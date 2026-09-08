'use server'

import { revalidateTag } from 'next/cache'
import { randomInt } from 'crypto'
import { Prisma, RagStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'
import { requireRole } from '@/src/lib/auth/server-guard'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SaveKpiUpdatePayload = {
  kpi_id: string
  /** YYYY-MM — used as the period_start_date (1st of month) */
  reporting_period: string
  actual_value?: number
  performance_commentary?: string
  submitted_by: string
}

export type SaveKpiUpdateResult =
  | { ok: true; kpi_update_id: string; kpi_id: string; rag_status: RagStatus | null }
  | { ok: false; error: string }

export type ValidateKpiUpdatePayload = {
  kpi_update_id: string
  decision: 'VALIDATED' | 'RETURNED'
  comments?: string
  validated_by: string
}

export type ValidateKpiUpdateResult =
  | { ok: true; kpi_update_id: string }
  | { ok: false; error: string }

export type KpiWithDefinition = {
  kpi_id: string
  kpi_name: string
  kpi_definition?: string | null
  unit_of_measure?: string | null
  kpi_type?: string | null
  baseline_value?: number | null
  green_threshold?: string | null
  amber_threshold?: string | null
  red_threshold?: string | null
  collection_frequency?: string | null
  /** KPU-029: polarity for achievement computation */
  performance_polarity?: string | null
  score_cap_pct?: number | null
  kpi_weight_pct?: number | null
  latest_update?: {
    kpi_update_id: string
    reporting_period: string        // YYYY-MM derived from period_start_date
    actual_value?: string | null
    rag_status?: RagStatus | null
    performance_commentary?: string | null
    /** KPU-029: PENDING | VALIDATED | RETURNED */
    validation_decision?: string | null
    achievement_pct?: number | null
  } | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 10000)}`
}

/** Parse "YYYY-MM" → Date (1st of that month) */
function periodToDate(period: string): Date {
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

/** Date → "YYYY-MM" */
function dateToPeriod(d: Date | null | undefined): string {
  if (!d) return ''
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Compute RAG from actual value vs threshold strings like ">=90", "80", etc.
 */
function computeRag(
  actual: number,
  green?: string | null,
  amber?: string | null,
): RagStatus | null {
  function evalThreshold(t: string, v: number): boolean {
    const m = t.match(/^(>=|<=|>|<|=)?\s*([\d.]+)$/)
    if (!m) {
      const target = parseFloat(t)
      return !isNaN(target) && v >= target
    }
    const [, op, numStr] = m
    const num = parseFloat(numStr)
    switch (op ?? '>=') {
      case '>=': return v >= num
      case '<=': return v <= num
      case '>':  return v > num
      case '<':  return v < num
      case '=':  return v === num
      default:   return v >= num
    }
  }

  if (green && evalThreshold(green, actual)) return RagStatus.GREEN
  if (amber && evalThreshold(amber, actual)) return RagStatus.AMBER
  if (green || amber) return RagStatus.RED
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// G-30: Achievement / variance / polarity computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute achievement percentage using the KPI's performance_polarity.
 * BR-038 / KPU-030: result is capped at scoreCap (default 100).
 */
function computeAchievement(
  actual: number,
  target: number | null | undefined,
  polarity: string | null | undefined,
  scoreCap: number | null | undefined,
): number | null {
  if (target === null || target === undefined) return null
  const cap = scoreCap ?? 100
  let pct: number
  switch (polarity) {
    case 'LOWER_IS_BETTER':
      pct = target === 0 ? 100 : (target / actual) * 100
      break
    case 'TARGET_RANGE':
      pct =
        actual === target
          ? 100
          : Math.max(0, 100 - (Math.abs(actual - target) / target) * 100)
      break
    case 'BINARY':
      pct = actual >= target ? 100 : 0
      break
    default: // HIGHER_IS_BETTER or null
      pct = target === 0 ? 100 : (actual / target) * 100
  }
  return Math.min(pct, cap)
}

/**
 * Find the period target from a KPI's target_profile JSON array.
 * Falls back to baseline_value if no matching period entry exists.
 * target_profile shape: [{ period: "YYYY-MM", target: number }, …]
 */
function findPeriodTarget(
  targetProfile: unknown,
  period: string,
  baseline: number | null | undefined,
): number | null {
  if (targetProfile && Array.isArray(targetProfile)) {
    const entry = (targetProfile as Array<{ period?: string; target?: number }>).find(
      (e) => e.period === period,
    )
    if (entry?.target !== undefined && entry.target !== null) return Number(entry.target)
  }
  return baseline ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// saveKpiUpdate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records a KPI performance update for the given month.
 * Sets validation_decision = 'PENDING' (KPU-029: requires separate Data Validator approval).
 * Auto-calculates RAG status and achievement metrics from the KPI definition.
 * Idempotent — upserts on (kpi_id, period_start_date).
 */
export async function saveKpiUpdate(
  payload: SaveKpiUpdatePayload,
): Promise<SaveKpiUpdateResult> {
  const { kpi_id, reporting_period, submitted_by } = payload

  if (!kpi_id?.trim()) return { ok: false, error: 'kpi_id is required.' }
  if (!reporting_period?.trim()) return { ok: false, error: 'reporting_period is required.' }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const kpi = await tx.kpiDefinition.findUnique({ where: { kpi_id } })
      if (!kpi) throw new Error(`KpiDefinition not found: ${kpi_id}`)

      const periodStart = periodToDate(reporting_period)
      const periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0)) // last day of month

      const actual = payload.actual_value ?? null
      const rag_status = actual !== null
        ? computeRag(actual, kpi.green_threshold, kpi.amber_threshold)
        : null

      // G-30: Compute achievement metrics
      const baseline = kpi.baseline_value ? Number(kpi.baseline_value) : null
      const periodTarget = actual !== null
        ? findPeriodTarget(kpi.target_profile, reporting_period, baseline)
        : null
      const polarity = kpi.performance_polarity
      const cap = kpi.score_cap_pct ? Number(kpi.score_cap_pct) : null

      const achievement_pct =
        actual !== null ? computeAchievement(actual, periodTarget, polarity, cap) : null
      const variance_to_target =
        actual !== null && periodTarget !== null ? actual - periodTarget : null
      const kpi_weight = kpi.kpi_weight_pct ? Number(kpi.kpi_weight_pct) : null
      const weighted_kpi_score =
        achievement_pct !== null && kpi_weight !== null
          ? (achievement_pct / 100) * kpi_weight * 100
          : null

      // Look for existing update in this period
      const existing = await tx.kpiPerformanceUpdate.findFirst({
        where: { kpi_id, period_start_date: periodStart },
        orderBy: { created_at: 'desc' },
      })

      let kpi_update_id: string
      if (existing) {
        kpi_update_id = existing.kpi_update_id
        await tx.kpiPerformanceUpdate.update({
          where: { kpi_update_id: existing.kpi_update_id },
          data: {
            actual_value: actual !== null ? String(actual) : null,
            rag_status,
            performance_commentary: payload.performance_commentary ?? null,
            // G-29: reset to PENDING whenever data steward re-saves
            validation_decision: 'PENDING',
            achievement_pct: achievement_pct ?? undefined,
            variance_to_target: variance_to_target ?? undefined,
            weighted_kpi_score: weighted_kpi_score ?? undefined,
            period_target: periodTarget ?? undefined,
            modified_by: submitted_by,
          },
        })
      } else {
        kpi_update_id = generateId('KPU')
        await tx.kpiPerformanceUpdate.create({
          data: {
            kpi_update_id,
            kpi_id,
            period_start_date: periodStart,
            period_end_date: periodEnd,
            actual_value: actual !== null ? String(actual) : null,
            rag_status,
            performance_commentary: payload.performance_commentary ?? null,
            // G-29: new submissions start as PENDING
            validation_decision: 'PENDING',
            achievement_pct: achievement_pct ?? undefined,
            variance_to_target: variance_to_target ?? undefined,
            weighted_kpi_score: weighted_kpi_score ?? undefined,
            period_target: periodTarget ?? undefined,
            master_trace_id: kpi.master_trace_id,
            entity_type: 'KPI_PERFORMANCE_UPDATE',
            entry_route: kpi.entry_route,
            created_by: submitted_by,
          },
        })
      }

      // Touch KPI definition modified_by
      await tx.kpiDefinition.update({
        where: { kpi_id },
        data: { modified_by: submitted_by },
      })

      return { kpi_update_id, kpi_id, rag_status }
    })

    revalidateTag(CACHE_TAGS.STRATEGY_ROLLUP, 'max')
    auditLog({
      action_type: 'SAVE_KPI_UPDATE',
      entity_type: 'KPI_PERFORMANCE_UPDATE',
      entity_id: kpi_id,
      active_user_id: submitted_by,
      outcome: 'success',
      reporting_period,
    })

    return { ok: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save KPI update'
    captureException(err, {
      action_type: 'SAVE_KPI_UPDATE',
      entity_id: kpi_id,
      active_user_id: submitted_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// validateKpiUpdate  (KPU-029 / BR-038)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Data Validator sets validation_decision to VALIDATED or RETURNED.
 * Only VALIDATED updates feed the BSC (BR-038).
 * Re-confirms achievement_pct / variance / weighted score on VALIDATED.
 */
export async function validateKpiUpdate(
  payload: ValidateKpiUpdatePayload,
): Promise<ValidateKpiUpdateResult> {
  const { kpi_update_id, decision, comments, validated_by } = payload

  if (!kpi_update_id?.trim()) return { ok: false, error: 'kpi_update_id is required.' }
  if (!['VALIDATED', 'RETURNED'].includes(decision)) {
    return { ok: false, error: 'decision must be VALIDATED or RETURNED.' }
  }

  // RBAC: Data Governance / Strategy & Governance role
  const rbac = await requireRole('Strategy & Governance')
  if (rbac) return rbac

  try {
    const result = await prisma.$transaction(async (tx) => {
      const update = await tx.kpiPerformanceUpdate.findUnique({
        where: { kpi_update_id },
        include: { kpi: true },
      })
      if (!update) throw new Error(`KpiPerformanceUpdate not found: ${kpi_update_id}`)

      const kpi = update.kpi
      let achievement_pct: number | null =
        update.achievement_pct !== null && update.achievement_pct !== undefined
          ? Number(update.achievement_pct)
          : null
      let variance_to_target: number | null =
        update.variance_to_target !== null && update.variance_to_target !== undefined
          ? Number(update.variance_to_target)
          : null
      let weighted_kpi_score: number | null =
        update.weighted_kpi_score !== null && update.weighted_kpi_score !== undefined
          ? Number(update.weighted_kpi_score)
          : null

      // G-30: Re-calculate on VALIDATED to confirm metrics
      if (decision === 'VALIDATED' && update.actual_value !== null) {
        const actual = parseFloat(update.actual_value!)
        if (!isNaN(actual)) {
          const reportingPeriod = dateToPeriod(update.period_start_date)
          const baseline = kpi.baseline_value ? Number(kpi.baseline_value) : null
          const periodTarget = findPeriodTarget(kpi.target_profile, reportingPeriod, baseline)
          const polarity = kpi.performance_polarity
          const cap = kpi.score_cap_pct ? Number(kpi.score_cap_pct) : null
          const kpi_weight = kpi.kpi_weight_pct ? Number(kpi.kpi_weight_pct) : null

          achievement_pct = computeAchievement(actual, periodTarget, polarity, cap)
          variance_to_target =
            periodTarget !== null && achievement_pct !== null ? actual - periodTarget : null
          weighted_kpi_score =
            achievement_pct !== null && kpi_weight !== null
              ? (achievement_pct / 100) * kpi_weight * 100
              : null
        }
      }

      await tx.kpiPerformanceUpdate.update({
        where: { kpi_update_id },
        data: {
          validation_decision: decision,
          ...(comments != null && { performance_commentary: comments }),
          modified_by: validated_by,
          ...(decision === 'VALIDATED' && {
            ...(achievement_pct !== null && { achievement_pct }),
            ...(variance_to_target !== null && { variance_to_target }),
            ...(weighted_kpi_score !== null && { weighted_kpi_score }),
          }),
        },
      })

      return { kpi_update_id }
    })

    // BR-038: Revalidate BSC cache so only VALIDATED updates feed the scorecard
    revalidateTag(CACHE_TAGS.STRATEGY_ROLLUP, 'max')
    auditLog({
      action_type: 'VALIDATE_KPI_UPDATE',
      entity_type: 'KPI_PERFORMANCE_UPDATE',
      entity_id: kpi_update_id,
      active_user_id: validated_by,
      outcome: 'success',
      decision,
    })

    return { ok: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to validate KPI update'
    captureException(err, {
      action_type: 'VALIDATE_KPI_UPDATE',
      entity_id: kpi_update_id,
      active_user_id: validated_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getPortfolioKpis
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// getBscPerspectives — Balanced Scorecard matrix data
// ─────────────────────────────────────────────────────────────────────────────

// BSC_PERSPECTIVES lives in lib/atlas/kpi (client-safe). Import here for internal use.
import { BSC_PERSPECTIVES, type BscPerspective } from '@/lib/atlas/kpi'
export type { BscPerspective } from '@/lib/atlas/kpi'

export type BscKpi = {
  kpi_id: string
  kpi_name: string
  unit_of_measure: string | null
  rag_status: RagStatus | null
  actual_value: string | null
  reporting_period: string
}

export type BscObjective = {
  objective_id: string
  objective_name: string
  objective_description: string | null
  bsc_perspective: string
  objective_weight_pct: number | null
  objective_rag: string | null
  kpis: BscKpi[]
}

export type BscPerspectiveGroup = {
  perspective: BscPerspective | string
  label: string
  objectives: BscObjective[]
  /** Average RAG across all KPIs in this perspective */
  perspectiveRag: RagStatus | null
}

function perspectiveLabel(p: string): string {
  switch (p) {
    case 'FINANCIAL': return 'Financial'
    case 'CUSTOMER': return 'Customer'
    case 'INTERNAL_PROCESS': return 'Internal Processes'
    case 'LEARNING_GROWTH': return 'Learning & Growth'
    default: return p.replace(/_/g, ' ')
  }
}

function deriveRag(kpis: BscKpi[]): RagStatus | null {
  const statuses = kpis.map((k) => k.rag_status).filter(Boolean) as RagStatus[]
  if (statuses.length === 0) return null
  if (statuses.includes(RagStatus.RED)) return RagStatus.RED
  if (statuses.includes(RagStatus.AMBER)) return RagStatus.AMBER
  return RagStatus.GREEN
}

export async function getBscPerspectives(): Promise<BscPerspectiveGroup[]> {
  const objectives = await prisma.strategicObjective.findMany({
    where: { is_active: true },
    select: {
      objective_id: true,
      objective_name: true,
      objective_description: true,
      bsc_perspective: true,
      objective_weight_pct: true,
      objective_rag: true,
          kpis: {
        select: {
          kpi_id: true,
          kpi_name: true,
          unit_of_measure: true,
          updates: {
            // BR-038: only VALIDATED updates feed the BSC
            where: { validation_decision: 'VALIDATED' },
            take: 1,
            orderBy: { period_start_date: 'desc' },
            select: {
              rag_status: true,
              actual_value: true,
              period_start_date: true,
            },
          },
        },
      },
    },
    orderBy: { created_at: 'asc' },
  })

  // Group by perspective — use canonical order
  const perspectiveOrder = [...BSC_PERSPECTIVES, 'UNASSIGNED']
  const grouped = new Map<string, BscObjective[]>()

  for (const obj of objectives) {
    const p = obj.bsc_perspective?.toUpperCase() ?? 'UNASSIGNED'
    if (!grouped.has(p)) grouped.set(p, [])
    const kpis: BscKpi[] = obj.kpis.map((kd) => {
      const latest = kd.updates[0]
      return {
        kpi_id: kd.kpi_id,
        kpi_name: kd.kpi_name,
        unit_of_measure: kd.unit_of_measure,
        rag_status: latest?.rag_status ?? null,
        actual_value: latest?.actual_value ?? null,
        reporting_period: dateToPeriod(latest?.period_start_date),
      }
    })
    grouped.get(p)!.push({
      objective_id: obj.objective_id,
      objective_name: obj.objective_name,
      objective_description: obj.objective_description,
      bsc_perspective: p,
      objective_weight_pct: obj.objective_weight_pct ? Number(obj.objective_weight_pct) : null,
      objective_rag: obj.objective_rag,
      kpis,
    })
  }

  const result: BscPerspectiveGroup[] = []
  for (const p of perspectiveOrder) {
    const objs = grouped.get(p)
    if (!objs || objs.length === 0) continue
    const allKpis = objs.flatMap((o) => o.kpis)
    result.push({
      perspective: p,
      label: perspectiveLabel(p),
      objectives: objs,
      perspectiveRag: deriveRag(allKpis),
    })
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// getPortfolioKpis
// ─────────────────────────────────────────────────────────────────────────────

export async function getPortfolioKpis(limit = 50): Promise<KpiWithDefinition[]> {
  const kpis = await prisma.kpiDefinition.findMany({
    take: limit,
    orderBy: { created_at: 'desc' },
    select: {
      kpi_id: true,
      kpi_name: true,
      kpi_definition: true,
      unit_of_measure: true,
      kpi_type: true,
      baseline_value: true,
      green_threshold: true,
      amber_threshold: true,
      red_threshold: true,
      collection_frequency: true,
      performance_polarity: true,
      score_cap_pct: true,
      kpi_weight_pct: true,
      updates: {
        take: 1,
        orderBy: { period_start_date: 'desc' },
        select: {
          kpi_update_id: true,
          period_start_date: true,
          actual_value: true,
          rag_status: true,
          performance_commentary: true,
          validation_decision: true,
          achievement_pct: true,
        },
      },
    },
  })

  return kpis.map((k) => {
    const latest = k.updates[0]
    return {
      kpi_id: k.kpi_id,
      kpi_name: k.kpi_name,
      kpi_definition: k.kpi_definition,
      unit_of_measure: k.unit_of_measure,
      kpi_type: k.kpi_type,
      baseline_value: k.baseline_value ? Number(k.baseline_value) : null,
      green_threshold: k.green_threshold,
      amber_threshold: k.amber_threshold,
      red_threshold: k.red_threshold,
      collection_frequency: k.collection_frequency,
      performance_polarity: k.performance_polarity,
      score_cap_pct: k.score_cap_pct ? Number(k.score_cap_pct) : null,
      kpi_weight_pct: k.kpi_weight_pct ? Number(k.kpi_weight_pct) : null,
      latest_update: latest
        ? {
            kpi_update_id: latest.kpi_update_id,
            reporting_period: dateToPeriod(latest.period_start_date),
            actual_value: latest.actual_value,
            rag_status: latest.rag_status,
            performance_commentary: latest.performance_commentary,
            validation_decision: latest.validation_decision,
            achievement_pct: latest.achievement_pct ? Number(latest.achievement_pct) : null,
          }
        : null,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// computeBscSnapshot — 70/20/10 persist engine (BR-039)
// ─────────────────────────────────────────────────────────────────────────────

function ragToScore(rag: RagStatus | null | undefined): number {
  switch (rag) {
    case RagStatus.GREEN: return 100
    case RagStatus.AMBER: return 60
    case RagStatus.RED:   return 20
    default:              return 50   // no data — neutral
  }
}

function scoreToRag(score: number): RagStatus {
  if (score >= 80) return RagStatus.GREEN
  if (score >= 55) return RagStatus.AMBER
  return RagStatus.RED
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function j(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue
}

export type BscSnapshotResult =
  | {
      ok: true
      scorecard_id: string
      overall_score: number
      overall_rag: RagStatus
      perspectives_computed: number
      objectives_updated: number
    }
  | { ok: false; error: string }

export type BscSnapshotSummary = {
  scorecard_id: string
  strategy_id: string
  reporting_period: string
  overall_score: number | null
  overall_rag: RagStatus | null
  computed_at: Date
  is_published: boolean
  data_quality_status: string | null
}

export async function getLatestBscSnapshot(
  strategyId?: string,
): Promise<BscSnapshotSummary | null> {
  const where = strategyId ? { strategy_id: strategyId } : {}
  const row = await prisma.balancedScorecard.findFirst({
    where,
    orderBy: { created_at: 'desc' },
    select: {
      scorecard_id: true,
      strategy_id: true,
      reporting_period: true,
      overall_strategy_score: true,
      overall_strategy_rag: true,
      created_at: true,
      is_published: true,
      data_quality_status: true,
    },
  })
  if (!row) return null
  return {
    scorecard_id: row.scorecard_id,
    strategy_id: row.strategy_id,
    reporting_period: row.reporting_period,
    overall_score: row.overall_strategy_score ? Number(row.overall_strategy_score) : null,
    overall_rag: row.overall_strategy_rag,
    computed_at: row.created_at,
    is_published: row.is_published,
    data_quality_status: row.data_quality_status,
  }
}

/**
 * Compute and persist a 70/20/10 BSC snapshot for the given strategy.
 *
 * Weights:
 *   70% KPI performance (RAG-based score per objective)
 *   20% Project delivery (avg. physical_progress_pct of linked projects)
 *   10% Budget execution (committed / approved SAR ratio)
 *
 * Also updates StrategicObjective.objective_score and objective_rag in place.
 */
export async function computeBscSnapshot(
  strategyId: string | null,
  period: string,   // YYYY-MM
  computedBy: string,
): Promise<BscSnapshotResult> {
  try {
    // ── 1. Resolve strategy ────────────────────────────────────────────────
    let resolvedStrategyId = strategyId
    if (!resolvedStrategyId) {
      const first = await prisma.strategy.findFirst({
        where: { is_active: true, record_status: { in: ['APPROVED', 'SUBMITTED', 'WORKING'] } },
        orderBy: { created_at: 'asc' },
        select: { strategy_id: true },
      })
      if (!first) return { ok: false, error: 'No active strategy found to snapshot.' }
      resolvedStrategyId = first.strategy_id
    }

    // ── 2. Fetch objectives with KPIs + latest updates ─────────────────────
    const objectives = await prisma.strategicObjective.findMany({
      where: { strategy_id: resolvedStrategyId, is_active: true },
      select: {
        objective_id: true,
        objective_name: true,
        bsc_perspective: true,
        objective_weight_pct: true,
          kpis: {
          where: { is_active: true },
          select: {
            kpi_id: true,
            kpi_weight_pct: true,
            updates: {
              // BR-038: only VALIDATED updates feed the BSC
              where: { validation_decision: 'VALIDATED' },
              take: 1,
              orderBy: { period_start_date: 'desc' },
              select: { rag_status: true, actual_value: true },
            },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    })

    if (objectives.length === 0) {
      return { ok: false, error: 'No objectives found for this strategy.' }
    }

    // ── 3. Project score (20%): avg physical_progress_pct on objectives
    //       (ProjectRegistration does not yet carry a progress field in the current schema)
    const objectivesWithProgress = objectives.filter(
      (o): o is typeof o & { physical_progress_pct: unknown } => true,
    )
    // Query objective.physical_progress_pct separately
    const objProgressRows = await prisma.strategicObjective.findMany({
      where: { strategy_id: resolvedStrategyId, is_active: true },
      select: { physical_progress_pct: true },
    })
    const projectScore =
      objProgressRows.length > 0
        ? objProgressRows.reduce(
            (sum, o) => sum + (o.physical_progress_pct ? Number(o.physical_progress_pct) : 50),
            0,
          ) / objProgressRows.length
        : 50 // default: halfway if no progress data
    void objectivesWithProgress // unused reference, keep linter happy

    // ── 4. Budget score (10%): procurement items committed / approved budget
    const budgets = await prisma.budgetSubmission.findMany({
      where: { strategy_id: resolvedStrategyId, record_status: 'APPROVED', is_active: true },
      select: { total_requested_sar: true },
    })
    const totalApproved = budgets.reduce(
      (sum, b) => sum + (b.total_requested_sar ? Number(b.total_requested_sar) : 0),
      0,
    )
    // Sum committed values from procurement items (represents budget released to execution)
    const strategy = await prisma.strategy.findUnique({
      where: { strategy_id: resolvedStrategyId },
      select: { master_trace_id: true, entry_route: true },
    })
    const procurementItemsAgg = await prisma.procurementItem.aggregate({
      where: { master_trace_id: strategy?.master_trace_id ?? '', is_active: true },
      _sum: { approved_budget_sar: true },
    })
    const totalCommitted = procurementItemsAgg._sum.approved_budget_sar
      ? Number(procurementItemsAgg._sum.approved_budget_sar)
      : 0
    const budgetScore = totalApproved > 0 ? Math.min(100, (totalCommitted / totalApproved) * 100) : 50

    // ── 5. Compute per-objective composite ────────────────────────────────
    type ObjScore = {
      objective_id: string
      perspective: string
      weight: number
      composite: number
      rag: RagStatus
    }
    const objScores: ObjScore[] = []
    let objectivesUpdated = 0

    for (const obj of objectives) {
      // KPI component: weighted average of RAG scores
      const kpis = obj.kpis
      let kpiScore: number
      if (kpis.length === 0) {
        kpiScore = 50
      } else {
        const totalWeight = kpis.reduce(
          (s, k) => s + (k.kpi_weight_pct ? Number(k.kpi_weight_pct) : 0),
          0,
        )
        if (totalWeight > 0) {
          kpiScore = kpis.reduce((s, k) => {
            const w = k.kpi_weight_pct ? Number(k.kpi_weight_pct) : 0
            return s + ragToScore(k.updates[0]?.rag_status) * (w / totalWeight)
          }, 0)
        } else {
          kpiScore =
            kpis.reduce((s, k) => s + ragToScore(k.updates[0]?.rag_status), 0) / kpis.length
        }
      }

      const composite = round2(kpiScore * 0.7 + projectScore * 0.2 + budgetScore * 0.1)
      const rag = scoreToRag(composite)
      const weight = obj.objective_weight_pct ? Number(obj.objective_weight_pct) : 100 / objectives.length

      objScores.push({
        objective_id: obj.objective_id,
        perspective: obj.bsc_perspective?.toUpperCase() ?? 'UNASSIGNED',
        weight,
        composite,
        rag,
      })

      // Update the objective row
      await prisma.strategicObjective.update({
        where: { objective_id: obj.objective_id },
        data: {
          kpi_performance_score: round2(kpiScore),
          objective_score: composite,
          objective_rag: rag,
          performance_as_of_date: new Date(),
        },
      })
      objectivesUpdated++
    }

    // ── 6. Compute perspective scores ─────────────────────────────────────
    const byPerspective = new Map<string, ObjScore[]>()
    for (const o of objScores) {
      if (!byPerspective.has(o.perspective)) byPerspective.set(o.perspective, [])
      byPerspective.get(o.perspective)!.push(o)
    }

    type PerspectiveStat = {
      perspective: string
      score: number
      rag: RagStatus
      objective_count: number
    }
    const perspectiveStats: PerspectiveStat[] = []

    for (const [perspective, objs] of byPerspective) {
      const totalW = objs.reduce((s, o) => s + o.weight, 0)
      const score =
        totalW > 0
          ? objs.reduce((s, o) => s + o.composite * (o.weight / totalW), 0)
          : objs.reduce((s, o) => s + o.composite, 0) / objs.length
      perspectiveStats.push({
        perspective,
        score: round2(score),
        rag: scoreToRag(score),
        objective_count: objs.length,
      })
    }

    // ── 7. Overall strategy score ──────────────────────────────────────────
    const overallScore =
      perspectiveStats.length > 0
        ? round2(perspectiveStats.reduce((s, p) => s + p.score, 0) / perspectiveStats.length)
        : 0
    const overallRag = scoreToRag(overallScore)

    // Build perspective_lines JSON for the snapshot
    const perspectiveLines = perspectiveStats.map((p) => ({
      perspective: p.perspective,
      score: p.score,
      rag: p.rag,
      objective_count: p.objective_count,
    }))

    // ── 8. Upsert BalancedScorecard row ───────────────────────────────────
    const existing = await prisma.balancedScorecard.findFirst({
      where: { strategy_id: resolvedStrategyId, reporting_period: period },
      select: { scorecard_id: true },
    })

    // Counts for the snapshot metadata
    const linkedDemandCount = await prisma.demand.count({
      where: { master_trace_id: strategy?.master_trace_id ?? '', is_active: true },
    })
    const linkedProjectCount = await prisma.projectRegistration.count({
      where: { strategy_id: resolvedStrategyId, is_active: true },
    })
    const procurements = await prisma.procurementItem.count({
      where: { master_trace_id: strategy?.master_trace_id ?? '', is_active: true },
    })

    const approvedBudget = budgets.reduce(
      (s, b) => s + (b.total_requested_sar ? Number(b.total_requested_sar) : 0),
      0,
    )

    const scorecardData = {
      strategy_id: resolvedStrategyId,
      reporting_period: period,
      data_as_of_date: new Date(),
      perspective_lines: j(perspectiveLines),
      linked_demand_count: linkedDemandCount,
      linked_project_count: linkedProjectCount,
      linked_procurement_count: procurements,
      project_contribution_weight_pct: 20,
      weighted_project_progress_pct: round2(projectScore),
      approved_budget_sar: approvedBudget || undefined,
      comparison_value_sar: totalCommitted || undefined,
      budget_performance_score: round2(budgetScore),
      kpi_component_weight_pct: 70,
      budget_component_weight_pct: 10,
      composite_objective_score: overallScore,
      perspective_score: round2(
        perspectiveStats.reduce((s, p) => s + p.score, 0) / Math.max(1, perspectiveStats.length),
      ),
      overall_strategy_score: overallScore,
      overall_strategy_rag: overallRag,
      data_quality_status: objectivesUpdated > 0 ? 'PASS' : 'DATA_QUALITY_FAILURE',
      modified_by: computedBy,
    }

    let scorecard_id: string
    if (existing) {
      await prisma.balancedScorecard.update({
        where: { scorecard_id: existing.scorecard_id },
        data: scorecardData,
      })
      scorecard_id = existing.scorecard_id
    } else {
      scorecard_id = generateId('BSC')
      await prisma.balancedScorecard.create({
        data: {
          scorecard_id,
          master_trace_id: strategy?.master_trace_id ?? '',
          entity_type: 'BALANCED_SCORECARD',
          entry_route: strategy?.entry_route ?? 'STRATEGIC',
          created_by: computedBy,
          version_number: 1,
          ...scorecardData,
        },
      })
    }

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'COMPUTE_BSC_SNAPSHOT',
      entity_type: 'BALANCED_SCORECARD',
      entity_id: scorecard_id,
      active_user_id: computedBy,
      outcome: 'success',
    })

    return {
      ok: true,
      scorecard_id,
      overall_score: overallScore,
      overall_rag: overallRag,
      perspectives_computed: perspectiveStats.length,
      objectives_updated: objectivesUpdated,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to compute BSC snapshot'
    captureException(err, {
      action_type: 'COMPUTE_BSC_SNAPSHOT',
      entity_type: 'BALANCED_SCORECARD',
      active_user_id: computedBy,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// publishBscSnapshot — G-27: mark BSC snapshot as Published
// ─────────────────────────────────────────────────────────────────────────────

export type PublishBscResult =
  | { ok: true; scorecard_id: string }
  | { ok: false; error: string }

export async function publishBscSnapshot(
  scorecard_id: string,
  period: string,
  published_by: string,
): Promise<PublishBscResult> {
  try {
    // Try to find existing scorecard by id first, fall back to period lookup
    let sc = scorecard_id
      ? await prisma.balancedScorecard.findUnique({ where: { scorecard_id } })
      : null

    if (!sc) {
      sc = await prisma.balancedScorecard.findFirst({
        where: { reporting_period: period, is_active: true },
        orderBy: { created_at: 'desc' },
      })
    }

    if (sc) {
      await prisma.balancedScorecard.update({
        where: { scorecard_id: sc.scorecard_id },
        data: {
          is_published: true,
          published_at: new Date(),
          data_quality_status: 'PUBLISHED',
          modified_by: published_by,
        },
      })
      revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
      auditLog({ action_type: 'PUBLISH_BSC_SNAPSHOT', entity_type: 'BALANCED_SCORECARD', entity_id: sc.scorecard_id, active_user_id: published_by, outcome: 'success' })
      return { ok: true, scorecard_id: sc.scorecard_id }
    }

    // No snapshot found — create a minimal published placeholder
    const strategy = await prisma.strategy.findFirst({
      where: { is_active: true },
      select: { strategy_id: true, master_trace_id: true, entry_route: true },
    })
    if (!strategy) return { ok: false, error: 'No active strategy found.' }

    const new_id = generateId('BSC')
    await prisma.balancedScorecard.create({
      data: {
        scorecard_id: new_id,
        strategy_id: strategy.strategy_id,
        master_trace_id: strategy.master_trace_id,
        entity_type: 'BALANCED_SCORECARD',
        entry_route: strategy.entry_route,
        reporting_period: period,
        is_published: true,
        published_at: new Date(),
        data_quality_status: 'PUBLISHED',
        created_by: published_by,
        version_number: 1,
      },
    })
    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    return { ok: true, scorecard_id: new_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to publish BSC snapshot'
    captureException(err, { action_type: 'PUBLISH_BSC_SNAPSHOT', entity_type: 'BALANCED_SCORECARD', active_user_id: published_by, outcome: 'failure', error: message })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getKpiDefinition — G-25
// ─────────────────────────────────────────────────────────────────────────────

export type KpiDefinitionDetail = {
  kpi_id: string
  kpi_name: string
  kpi_definition: string | null
  measurement_purpose: string | null
  kpi_type: string | null
  performance_polarity: string | null
  unit_of_measure: string | null
  aggregation_method: string | null
  collection_frequency: string | null
  calculation_formula: string | null
  numerator_definition: string | null
  denominator_definition: string | null
  baseline_value: number | null
  green_threshold: string | null
  amber_threshold: string | null
  red_threshold: string | null
  kpi_owner_user_id: string | null
  data_steward_user_id: string | null
  kpi_source_system: string | null
  submission_due_offset_days: number | null
  target_profile: unknown
  data_quality_rules: unknown
  stretch_target: number | null
  record_status: string | null
  objective_id: string
  objective_name: string | null
}

export async function getKpiDefinition(kpiId: string): Promise<KpiDefinitionDetail | null> {
  const kpi = await prisma.kpiDefinition.findUnique({
    where: { kpi_id: kpiId },
    include: { objective: { select: { objective_name: true } } },
  })
  if (!kpi) return null
  return {
    kpi_id: kpi.kpi_id,
    kpi_name: kpi.kpi_name,
    kpi_definition: kpi.kpi_definition,
    measurement_purpose: kpi.measurement_purpose,
    kpi_type: kpi.kpi_type,
    performance_polarity: kpi.performance_polarity,
    unit_of_measure: kpi.unit_of_measure,
    aggregation_method: kpi.aggregation_method,
    collection_frequency: kpi.collection_frequency,
    calculation_formula: kpi.calculation_formula,
    numerator_definition: kpi.numerator_definition,
    denominator_definition: kpi.denominator_definition,
    baseline_value: kpi.baseline_value ? Number(kpi.baseline_value) : null,
    green_threshold: kpi.green_threshold,
    amber_threshold: kpi.amber_threshold,
    red_threshold: kpi.red_threshold,
    kpi_owner_user_id: kpi.kpi_owner_user_id,
    data_steward_user_id: kpi.data_steward_user_id,
    kpi_source_system: kpi.kpi_source_system,
    submission_due_offset_days: kpi.submission_due_offset_days,
    target_profile: kpi.target_profile,
    data_quality_rules: kpi.data_quality_rules,
    stretch_target: kpi.stretch_target ? Number(kpi.stretch_target) : null,
    record_status: kpi.record_status,
    objective_id: kpi.objective_id,
    objective_name: kpi.objective?.objective_name ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// saveKpiDefinition — G-25
// ─────────────────────────────────────────────────────────────────────────────

export type SaveKpiDefinitionPayload = {
  kpi_id: string
  kpi_name?: string
  kpi_definition?: string | null
  measurement_purpose?: string | null
  performance_polarity?: string | null
  unit_of_measure?: string | null
  aggregation_method?: string | null
  collection_frequency?: string | null
  calculation_formula?: string | null
  numerator_definition?: string | null
  denominator_definition?: string | null
  baseline_value?: number | null
  green_threshold?: string | null
  amber_threshold?: string | null
  red_threshold?: string | null
  kpi_owner_user_id?: string | null
  data_steward_user_id?: string | null
  kpi_source_system?: string | null
  submission_due_offset_days?: number | null
  target_profile?: Record<string, number> | null
  data_quality_rules?: Record<string, boolean> | null
  stretch_target?: number | null
  saved_by: string
}

export async function saveKpiDefinition(
  payload: SaveKpiDefinitionPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { kpi_id, saved_by, target_profile, data_quality_rules, ...rest } = payload
  try {
    await prisma.kpiDefinition.update({
      where: { kpi_id },
      data: {
        ...rest,
        target_profile: target_profile ?? Prisma.JsonNull,
        data_quality_rules: data_quality_rules ?? Prisma.JsonNull,
        modified_by: saved_by,
      },
    })
    revalidateTag(CACHE_TAGS.STRATEGY_ROLLUP, 'max')
    auditLog({ action_type: 'SAVE_KPI_DEFINITION', entity_type: 'KPI_DEFINITION', entity_id: kpi_id, active_user_id: saved_by, outcome: 'success' })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save KPI definition'
    captureException(err, { action_type: 'SAVE_KPI_DEFINITION', entity_id: kpi_id, active_user_id: saved_by, outcome: 'failure', error: message })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getKpiUpdateHistory — G-26
// ─────────────────────────────────────────────────────────────────────────────

export type KpiUpdateHistoryEntry = {
  kpi_update_id: string
  period: string
  actual_value: string | null
  period_target: number | null
  rag_status: string | null
  kpi_rag: string | null
  performance_commentary: string | null
  forecast_value: string | null
  forecast_target_status: string | null
  corrective_action: string | null
  action_owner_user_id: string | null
  action_due_date: string | null
  evidence_attachment_id: string | null
  validation_decision: string | null
  data_quality_status: string | null
}

export type KpiUpdateHistoryResult = {
  kpi: KpiDefinitionDetail
  updates: KpiUpdateHistoryEntry[]
}

export async function getKpiUpdateHistory(
  kpiId: string,
  periods = 12,
): Promise<KpiUpdateHistoryResult | null> {
  const kpi = await getKpiDefinition(kpiId)
  if (!kpi) return null

  const rows = await prisma.kpiPerformanceUpdate.findMany({
    where: { kpi_id: kpiId, is_active: true },
    orderBy: { period_start_date: 'desc' },
    take: periods,
    select: {
      kpi_update_id: true,
      period_start_date: true,
      actual_value: true,
      period_target: true,
      rag_status: true,
      kpi_rag: true,
      performance_commentary: true,
      forecast_value: true,
      forecast_target_status: true,
      corrective_action: true,
      action_owner_user_id: true,
      action_due_date: true,
      evidence_attachment_id: true,
      validation_decision: true,
      data_quality_status: true,
    },
  })

  const updates: KpiUpdateHistoryEntry[] = rows.map((r) => ({
    kpi_update_id: r.kpi_update_id,
    period: r.period_start_date
      ? `${r.period_start_date.getUTCFullYear()}-${String(r.period_start_date.getUTCMonth() + 1).padStart(2, '0')}`
      : '',
    actual_value: r.actual_value,
    period_target: r.period_target ? Number(r.period_target) : null,
    rag_status: r.rag_status,
    kpi_rag: r.kpi_rag,
    performance_commentary: r.performance_commentary,
    forecast_value: r.forecast_value,
    forecast_target_status: r.forecast_target_status,
    corrective_action: r.corrective_action,
    action_owner_user_id: r.action_owner_user_id,
    action_due_date: r.action_due_date?.toISOString() ?? null,
    evidence_attachment_id: r.evidence_attachment_id,
    validation_decision: r.validation_decision,
    data_quality_status: r.data_quality_status,
  }))

  return { kpi, updates }
}

// ─────────────────────────────────────────────────────────────────────────────
// getStrategyExecutionDrivers — G-27 sidebar stats
// ─────────────────────────────────────────────────────────────────────────────

export type StrategyExecutionDrivers = {
  projectsOnTrack: number
  procurementDelayed: number
  budgetCommittedPct: number | null
  benefitsForecast: string
}

export async function getStrategyExecutionDrivers(): Promise<StrategyExecutionDrivers> {
  const [projectsOnTrack, procurementDelayed, budgetAgg] = await Promise.all([
    prisma.projectRegistration.count({
      where: { record_status: 'REGISTERED', is_active: true },
    }),
    prisma.procurementItem.count({
      where: { procurement_status: 'DELAYED', is_active: true },
    }),
    prisma.procurementItem.aggregate({
      where: { is_active: true },
      _sum: { actual_commitment_sar: true, approved_budget_sar: true },
    }),
  ])

  const committed = budgetAgg._sum.actual_commitment_sar
    ? Number(budgetAgg._sum.actual_commitment_sar)
    : null
  const approved = budgetAgg._sum.approved_budget_sar
    ? Number(budgetAgg._sum.approved_budget_sar)
    : null
  const budgetCommittedPct =
    committed !== null && approved !== null && approved > 0
      ? Math.round((committed / approved) * 100)
      : null

  return {
    projectsOnTrack,
    procurementDelayed,
    budgetCommittedPct,
    benefitsForecast: 'On track',
  }
}

