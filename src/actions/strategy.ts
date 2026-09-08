'use server'

import { revalidateTag } from 'next/cache'
import { createHash, randomInt } from 'crypto'
import { DecisionEnum, Prisma, VersionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Coerce a nullable JSON value to Prisma.JsonNull so Json? fields accept it. */
function j<T>(v: T | null | undefined): T | typeof Prisma.JsonNull {
  return v !== null && v !== undefined ? v : Prisma.JsonNull
}
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'
import { checkDocumentPack } from '@/lib/atlas/document-pack'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ObjectiveInput = {
  objective_id?: string        // present when updating an existing row
  theme_id?: string
  objective_name: string
  objective_description?: string
  intended_outcome?: string
  bsc_perspective?: string     // FINANCIAL | CUSTOMER | INTERNAL | LEARNING
  objective_type?: string
  objective_owner_user_id?: string
  objective_priority?: string
  objective_weight_pct?: number
  baseline_narrative?: string
  target_outcome_date?: string
}

export type KpiInput = {
  kpi_id?: string
  objective_local_id: string  // matches ObjectiveInput.objective_id or a temp id
  kpi_name: string
  kpi_definition?: string
  unit_of_measure?: string
  kpi_type?: string
  kpi_weight_pct?: number
  baseline_value?: number
  target_profile?: Record<string, number>  // { "YYYY-MM": target }
  green_threshold?: string
  amber_threshold?: string
  red_threshold?: string
  collection_frequency?: string
  kpi_owner_user_id?: string
}

export type StrategicThemeInput = {
  theme_id?: string
  theme_name: string
  theme_description?: string
  theme_order?: number
}

export type SaveStrategyPayload = {
  strategy_id: string
  // Core identity
  strategy_title: string
  strategy_type?: string
  parent_strategy_id?: string
  // Horizon
  horizon_start_date?: string
  horizon_end_date?: string
  baseline_fiscal_year?: number
  // Owners
  executive_sponsor_user_id?: string
  strategy_owner_user_id?: string
  performance_manager_user_id?: string
  // Narrative
  executive_summary?: string
  mandate_statement?: string
  vision_statement?: string
  mission_statement?: string
  strategic_drivers?: string[]
  current_state_summary?: string
  trend_summary?: string
  swot_summary?: string
  target_state_description?: string
  // Scope
  scope_in?: string
  scope_out?: string
  target_beneficiaries?: string[]
  // Themes
  themes?: StrategicThemeInput[]
  // Strategy
  strategic_priorities?: string[]
  key_outcomes?: string[]
  key_assumptions?: string
  key_constraints?: string
  strategic_risks?: object[]
  // Finance
  funding_envelope?: number
  currency_code?: string
  indicative_capex?: number
  indicative_opex?: number
  annual_funding_profile?: Record<string, number>
  funding_source?: string[]
  // Governance
  review_frequency?: string
  performance_reporting_frequency?: string
  decision_forums?: string[]
  requested_effective_date?: string
  // Objectives and KPIs
  objectives?: ObjectiveInput[]
  kpis?: KpiInput[]
  // Actor
  modified_by: string
}

export type SaveStrategyResult =
  | { ok: true; strategy_id: string }
  | { ok: false; error: string }

export type SubmitStrategyPayload = {
  strategy_id: string
  submitted_by: string
}

export type SubmitStrategyResult =
  | { ok: true; strategy_id: string; approval_id: string; version_hash: string }
  | { ok: false; error: string; code?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 10000)}`
}

function versionHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

// ─────────────────────────────────────────────────────────────────────────────
// saveStrategy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upserts a Strategy record and its child Themes, Objectives, and KPIs.
 * Enforces: master_trace_id ownership, is_locked check.
 * Does NOT lock the record — that happens on submitStrategy().
 */
export async function saveStrategy(
  payload: SaveStrategyPayload,
): Promise<SaveStrategyResult> {
  const { strategy_id, modified_by } = payload

  if (!strategy_id?.trim()) return { ok: false, error: 'strategy_id is required.' }
  if (!payload.strategy_title?.trim()) return { ok: false, error: 'strategy_title is required.' }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.strategy.findUnique({ where: { strategy_id } })
      if (!existing) throw new Error(`Strategy not found: ${strategy_id}`)
      if (existing.is_locked) throw new Error('Strategy is locked — submit a revision request.')

      // Update Strategy
      await tx.strategy.update({
        where: { strategy_id },
        data: {
          strategy_title: payload.strategy_title.slice(0, 255),
          strategy_type: payload.strategy_type ?? null,
          parent_strategy_id: payload.parent_strategy_id ?? null,
          horizon_start_date: payload.horizon_start_date ? new Date(payload.horizon_start_date) : null,
          horizon_end_date: payload.horizon_end_date ? new Date(payload.horizon_end_date) : null,
          baseline_fiscal_year: payload.baseline_fiscal_year ?? null,
          executive_sponsor_user_id: payload.executive_sponsor_user_id ?? null,
          strategy_owner_user_id: payload.strategy_owner_user_id ?? null,
          performance_manager_user_id: payload.performance_manager_user_id ?? null,
          executive_summary: payload.executive_summary ?? null,
          mandate_statement: payload.mandate_statement ?? null,
          vision_statement: payload.vision_statement ?? null,
          mission_statement: payload.mission_statement ?? null,
          strategic_drivers: j(payload.strategic_drivers),
          current_state_summary: payload.current_state_summary ?? null,
          trend_summary: payload.trend_summary ?? null,
          swot_summary: payload.swot_summary ?? null,
          target_state_description: payload.target_state_description ?? null,
          scope_in: payload.scope_in ?? null,
          scope_out: payload.scope_out ?? null,
          target_beneficiaries: j(payload.target_beneficiaries),
          strategic_theme_ids: j(
            payload.themes?.map((t) => t.theme_id ?? t.theme_name),
          ),
          strategic_priorities: j(payload.strategic_priorities),
          key_outcomes: j(payload.key_outcomes),
          key_assumptions: payload.key_assumptions ?? null,
          key_constraints: payload.key_constraints ?? null,
          strategic_risks: j(payload.strategic_risks),
          funding_envelope: payload.funding_envelope ?? null,
          currency_code: payload.currency_code ?? null,
          indicative_capex: payload.indicative_capex ?? null,
          indicative_opex: payload.indicative_opex ?? null,
          annual_funding_profile: j(payload.annual_funding_profile),
          funding_source: j(payload.funding_source),
          review_frequency: payload.review_frequency ?? null,
          performance_reporting_frequency: payload.performance_reporting_frequency ?? null,
          decision_forums: j(payload.decision_forums),
          requested_effective_date: payload.requested_effective_date
            ? new Date(payload.requested_effective_date)
            : null,
          modified_by,
          record_status: existing.record_status === 'RETURNED' ? 'DRAFT' : existing.record_status,
        },
      })

      // Upsert Strategic Themes
      if (payload.themes?.length) {
        for (const th of payload.themes) {
          const theme_id = th.theme_id ?? generateId('THM')
          await tx.strategicTheme.upsert({
            where: { theme_id },
            create: {
              theme_id,
              strategy_id,
              theme_name: th.theme_name.slice(0, 255),
              theme_description: th.theme_description ?? null,
              theme_order: th.theme_order ?? null,
              master_trace_id: existing.master_trace_id,
              entity_type: 'STRATEGIC_THEME',
              entry_route: existing.entry_route,
              created_by: modified_by,
            },
            update: {
              theme_name: th.theme_name.slice(0, 255),
              theme_description: th.theme_description ?? null,
              theme_order: th.theme_order ?? null,
              modified_by,
            },
          })
        }
      }

      // Upsert Objectives
      if (payload.objectives?.length) {
        for (const obj of payload.objectives) {
          const objective_id = obj.objective_id ?? generateId('OBJ')
          await tx.strategicObjective.upsert({
            where: { objective_id },
            create: {
              objective_id,
              strategy_id,
              master_trace_id: existing.master_trace_id,
              entity_type: 'STRATEGIC_OBJECTIVE',
              entry_route: existing.entry_route,
              objective_name: obj.objective_name.slice(0, 255),
              objective_description: obj.objective_description ?? null,
              intended_outcome: obj.intended_outcome ?? null,
              bsc_perspective: obj.bsc_perspective ?? null,
              objective_type: obj.objective_type ?? null,
              objective_owner_user_id: obj.objective_owner_user_id ?? null,
              objective_priority: obj.objective_priority ?? null,
              objective_weight_pct: obj.objective_weight_pct ?? null,
              baseline_narrative: obj.baseline_narrative ?? null,
              target_outcome_date: obj.target_outcome_date ? new Date(obj.target_outcome_date) : null,
              theme_id: obj.theme_id ?? null,
              created_by: modified_by,
            },
            update: {
              objective_name: obj.objective_name.slice(0, 255),
              objective_description: obj.objective_description ?? null,
              intended_outcome: obj.intended_outcome ?? null,
              bsc_perspective: obj.bsc_perspective ?? null,
              objective_type: obj.objective_type ?? null,
              objective_owner_user_id: obj.objective_owner_user_id ?? null,
              objective_priority: obj.objective_priority ?? null,
              objective_weight_pct: obj.objective_weight_pct ?? null,
              baseline_narrative: obj.baseline_narrative ?? null,
              target_outcome_date: obj.target_outcome_date ? new Date(obj.target_outcome_date) : null,
              theme_id: obj.theme_id ?? null,
              modified_by,
            },
          })
        }
      }

      // Upsert KPIs (linked to objectives by objective_id)
      if (payload.kpis?.length) {
        for (const kpi of payload.kpis) {
          const kpi_id = kpi.kpi_id ?? generateId('KPI')
          const objective_id = kpi.objective_local_id
          const objExists = await tx.strategicObjective.findUnique({ where: { objective_id } })
          if (!objExists) continue // skip orphan KPIs

          await tx.kpiDefinition.upsert({
            where: { kpi_id },
            create: {
              kpi_id,
              objective_id,
              master_trace_id: existing.master_trace_id,
              entity_type: 'KPI_DEFINITION',
              entry_route: existing.entry_route,
              kpi_name: kpi.kpi_name.slice(0, 255),
              kpi_definition: kpi.kpi_definition ?? null,
              unit_of_measure: kpi.unit_of_measure ?? null,
              kpi_type: kpi.kpi_type ?? null,
              kpi_weight_pct: kpi.kpi_weight_pct ?? null,
              baseline_value: kpi.baseline_value ?? null,
              target_profile: j(kpi.target_profile),
              green_threshold: kpi.green_threshold ?? null,
              amber_threshold: kpi.amber_threshold ?? null,
              red_threshold: kpi.red_threshold ?? null,
              collection_frequency: kpi.collection_frequency ?? null,
              kpi_owner_user_id: kpi.kpi_owner_user_id ?? null,
              created_by: modified_by,
            },
            update: {
              kpi_name: kpi.kpi_name.slice(0, 255),
              kpi_definition: kpi.kpi_definition ?? null,
              unit_of_measure: kpi.unit_of_measure ?? null,
              kpi_type: kpi.kpi_type ?? null,
              kpi_weight_pct: kpi.kpi_weight_pct ?? null,
              baseline_value: kpi.baseline_value ?? null,
              target_profile: j(kpi.target_profile),
              green_threshold: kpi.green_threshold ?? null,
              amber_threshold: kpi.amber_threshold ?? null,
              red_threshold: kpi.red_threshold ?? null,
              collection_frequency: kpi.collection_frequency ?? null,
              kpi_owner_user_id: kpi.kpi_owner_user_id ?? null,
              modified_by,
            },
          })
        }
      }
    })

    revalidateTag(CACHE_TAGS.STRATEGY_ROLLUP, 'max')
    auditLog({
      action_type: 'SAVE_STRATEGY',
      entity_type: 'STRATEGY',
      entity_id: strategy_id,
      active_user_id: modified_by,
      outcome: 'success',
    })

    return { ok: true, strategy_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save strategy'
    captureException(err, {
      action_type: 'SAVE_STRATEGY',
      entity_id: strategy_id,
      active_user_id: modified_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// submitStrategy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submits a Strategy to the CTO for Gate G-S1 review.
 *
 * Enforces:
 *   BR-006 — at least one objective must exist
 *   BR-007 — objective weights must sum to 100% (within 0.01 tolerance)
 *   BR-008 — generates version_hash, locks the record, creates ApprovalTransaction
 */
export async function submitStrategy(
  payload: SubmitStrategyPayload,
): Promise<SubmitStrategyResult> {
  const { strategy_id, submitted_by } = payload

  if (!strategy_id?.trim()) return { ok: false, error: 'strategy_id is required.' }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const strategy = await tx.strategy.findUnique({
        where: { strategy_id },
        include: {
          objectives: {
            include: {
              kpis: {
                select: { kpi_id: true, kpi_name: true, kpi_weight_pct: true },
              },
            },
          },
        },
      })

      if (!strategy) throw new Error(`Strategy not found: ${strategy_id}`)
      if (strategy.is_locked) throw new Error('Strategy is already locked / submitted.')
      if (strategy.record_status === 'APPROVED') throw new Error('Strategy is already APPROVED.')

      // BR-006: at least one objective
      if (!strategy.objectives || strategy.objectives.length === 0) {
        throw Object.assign(
          new Error('BR-006: Strategy must have at least one Strategic Objective before submission.'),
          { code: 'BR-006' },
        )
      }

      // BR-007: objective weights must sum to 100%
      const weightedObjectives = strategy.objectives.filter(
        (o) => o.objective_weight_pct !== null,
      )
      if (weightedObjectives.length > 0) {
        const total = weightedObjectives.reduce(
          (sum, o) => sum + Number(o.objective_weight_pct ?? 0),
          0,
        )
        if (Math.abs(total - 100) > 0.01) {
          throw Object.assign(
            new Error(
              `BR-007: Objective weights must sum to 100%. Current total: ${total.toFixed(2)}%.`,
            ),
            { code: 'BR-007' },
          )
        }
      }

      // BR-007 (KPI level): KPI weights within each objective must sum to 100% if any KPIs have weights
      for (const obj of strategy.objectives) {
        const kpis = (obj as any).kpis ?? []
        const weightedKpis = kpis.filter((k: any) => k.kpi_weight_pct !== null && k.kpi_weight_pct !== undefined)
        if (weightedKpis.length > 0) {
          const kpiTotal = weightedKpis.reduce(
            (sum: number, k: any) => sum + Number(k.kpi_weight_pct ?? 0),
            0,
          )
          if (Math.abs(kpiTotal - 100) > 0.01) {
            throw Object.assign(
              new Error(
                `BR-007: KPI weights for objective "${(obj as any).objective_name ?? obj.objective_id}" must sum to 100%. Current total: ${kpiTotal.toFixed(2)}%.`,
              ),
              { code: 'BR-007-KPI' },
            )
          }
        }
      }

      // G-17: mandatory document pack check
      const attachedTypes = await tx.attachment.findMany({
        where: { master_trace_id: strategy.master_trace_id ?? '' },
        select: { document_type: true },
      })
      const docError = checkDocumentPack('STRATEGY', 'SUBMIT', attachedTypes.map((a) => a.document_type))
      if (docError) {
        throw Object.assign(new Error(docError), { code: 'BR-017' })
      }

      const now = new Date()
      const hash = versionHash({
        strategy_id,
        version_number: strategy.version_number,
        strategy_title: strategy.strategy_title,
        objective_count: strategy.objectives.length,
        submitted_at: now.toISOString(),
      })

      // Lock the strategy and mark as submitted (BR-008)
      await tx.strategy.update({
        where: { strategy_id },
        data: {
          record_status: 'SUBMITTED',
          approval_status: 'PENDING',
          version_status: VersionStatus.SUBMITTED,
          is_locked: true,
          submitted_by,
          submitted_at: now,
          modified_by: submitted_by,
        },
      })

      // Create approval transaction at gate G-S1
      const approval_id = generateId('APR')
      await tx.approvalTransaction.create({
        data: {
          approval_id,
          entity_type: 'STRATEGY',
          entity_id: strategy_id,
          entity_version: strategy.version_number,
          version_number: strategy.version_number,
          version_hash: hash,
          gate_code: 'G-S1',
          approval_sequence: 1,
          approver_role: 'CTO',
          approver_user_id: 'cto',   // Placeholder — overwritten by gate page
          authority_basis: 'CTO Strategy Gate Policy',
          assigned_at: now,
          sla_due_at: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          decision: DecisionEnum.PENDING,
          notification_status: 'PENDING',
          created_by: submitted_by,
          master_trace_id: strategy.master_trace_id,
          is_locked: true,
        },
      })

      return { strategy_id, approval_id, version_hash: hash }
    })

    revalidateTag(CACHE_TAGS.STRATEGY_ROLLUP, 'max')
    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'SUBMIT_STRATEGY',
      entity_type: 'STRATEGY',
      entity_id: strategy_id,
      active_user_id: submitted_by,
      outcome: 'success',
      gate_code: 'G-S1',
    })

    return { ok: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit strategy'
    const code = (err as { code?: string }).code
    captureException(err, {
      action_type: 'SUBMIT_STRATEGY',
      entity_id: strategy_id,
      active_user_id: submitted_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message, code }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getStrategyWorkspace  (read-only loader for the workspace page)
// ─────────────────────────────────────────────────────────────────────────────

export async function getStrategyWorkspace(strategyId: string) {
  return prisma.strategy.findUnique({
    where: { strategy_id: strategyId },
    include: {
      master_trace: { select: { master_trace_id: true, entry_route: true } },
      themes: { orderBy: { theme_order: 'asc' } },
      objectives: {
        orderBy: { created_at: 'asc' },
        include: {
          kpis: { orderBy: { created_at: 'asc' } },
        },
      },
      // G-05: downstream parallel branches created on G-S1 approval
      demands: {
        select: {
          demand_id: true,
          demand_title: true,
          record_status: true,
          completeness_score_pct: true,
          submitted_at: true,
        },
        orderBy: { created_at: 'asc' },
      },
      budget_submissions: {
        select: {
          budget_submission_id: true,
          budget_cycle: true,
          record_status: true,
          total_requested_sar: true,
          submitted_at: true,
        },
        orderBy: { created_at: 'asc' },
      },
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// getObjectiveDetail — G-24 loader
// ─────────────────────────────────────────────────────────────────────────────

export type ObjectiveDetail = {
  objective_id: string
  objective_name: string
  objective_description: string | null
  intended_outcome: string | null
  bsc_perspective: string | null
  objective_priority: string | null
  objective_weight_pct: number | null
  objective_start_date: string | null
  objective_end_date: string | null
  objective_owner_user_id: string | null
  baseline_narrative: string | null
  performance_commentary: string | null
  corrective_action_summary: string | null
  forecast_outcome_status: string | null
  objective_score: number | null
  kpi_performance_score: number | null
  physical_progress_pct: number | null
  objective_rag: string | null
  strategy_id: string
  kpis: {
    kpi_id: string
    kpi_name: string
    unit_of_measure: string | null
    green_threshold: string | null
    amber_threshold: string | null
    target_profile: unknown
    latest_update: {
      kpi_update_id: string
      period: string
      actual_value: string | null
      rag_status: string | null
    } | null
  }[]
}

export async function getObjectiveDetail(objectiveId: string): Promise<ObjectiveDetail | null> {
  const obj = await prisma.strategicObjective.findUnique({
    where: { objective_id: objectiveId },
    include: {
      kpis: {
        orderBy: { created_at: 'asc' },
        include: {
          updates: {
            take: 1,
            orderBy: { period_start_date: 'desc' },
            select: {
              kpi_update_id: true,
              period_start_date: true,
              actual_value: true,
              rag_status: true,
            },
          },
        },
      },
    },
  })
  if (!obj) return null

  return {
    objective_id: obj.objective_id,
    objective_name: obj.objective_name,
    objective_description: obj.objective_description,
    intended_outcome: obj.intended_outcome,
    bsc_perspective: obj.bsc_perspective,
    objective_priority: obj.objective_priority,
    objective_weight_pct: obj.objective_weight_pct ? Number(obj.objective_weight_pct) : null,
    objective_start_date: obj.objective_start_date?.toISOString() ?? null,
    objective_end_date: obj.objective_end_date?.toISOString() ?? null,
    objective_owner_user_id: obj.objective_owner_user_id,
    baseline_narrative: obj.baseline_narrative,
    performance_commentary: obj.performance_commentary,
    corrective_action_summary: obj.corrective_action_summary,
    forecast_outcome_status: obj.forecast_outcome_status,
    objective_score: obj.objective_score ? Number(obj.objective_score) : null,
    kpi_performance_score: obj.kpi_performance_score ? Number(obj.kpi_performance_score) : null,
    physical_progress_pct: obj.physical_progress_pct ? Number(obj.physical_progress_pct) : null,
    objective_rag: obj.objective_rag,
    strategy_id: obj.strategy_id,
    kpis: obj.kpis.map((k) => {
      const latest = k.updates[0]
      return {
        kpi_id: k.kpi_id,
        kpi_name: k.kpi_name,
        unit_of_measure: k.unit_of_measure,
        green_threshold: k.green_threshold,
        amber_threshold: k.amber_threshold,
        target_profile: k.target_profile,
        latest_update: latest
          ? {
              kpi_update_id: latest.kpi_update_id,
              period: latest.period_start_date
                ? `${latest.period_start_date.getUTCFullYear()}-${String(latest.period_start_date.getUTCMonth() + 1).padStart(2, '0')}`
                : '',
              actual_value: latest.actual_value,
              rag_status: latest.rag_status,
            }
          : null,
      }
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// saveObjectiveDetail — G-24 save action
// ─────────────────────────────────────────────────────────────────────────────

export type SaveObjectiveDetailPayload = {
  objective_id: string
  performance_commentary?: string | null
  corrective_action_summary?: string | null
  forecast_outcome_status?: string | null
  saved_by: string
}

export async function saveObjectiveDetail(
  payload: SaveObjectiveDetailPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.strategicObjective.update({
      where: { objective_id: payload.objective_id },
      data: {
        performance_commentary: payload.performance_commentary ?? null,
        corrective_action_summary: payload.corrective_action_summary ?? null,
        forecast_outcome_status: payload.forecast_outcome_status ?? null,
        modified_by: payload.saved_by,
      },
    })
    revalidateTag(CACHE_TAGS.STRATEGY_ROLLUP, 'max')
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save objective'
    captureException(err, { action_type: 'SAVE_OBJECTIVE_DETAIL', entity_id: payload.objective_id, active_user_id: payload.saved_by, outcome: 'failure', error: message })
    return { ok: false, error: message }
  }
}


