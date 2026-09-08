'use server'

import { randomInt } from 'crypto'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OnePagerPublishState = {
  snapshot_id: string | null
  reporting_period: string
  fiscal_year: number
  data_as_of_date: Date | null
  is_published: boolean
  published_at: Date | null
  published_by: string | null
  quality_status: 'PASS' | 'FAIL' | 'PENDING'
  quality_block_reasons: string[]
  approved_strategy_count: number
  validated_demand_count: number
  approved_budget_count: number
}

export type QualityCheck = {
  check_id: string
  label: string
  passed: boolean
  detail: string
}

export type PublishOnePagerResult =
  | { ok: true; snapshot_id: string; quality_status: 'PASS'; checks: QualityCheck[] }
  | { ok: false; error: string; quality_status: 'FAIL'; checks: QualityCheck[]; code?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 10000)}`
}

function currentPeriod(): { period: string; year: number } {
  const now = new Date()
  const year = now.getFullYear()
  const q = Math.ceil((now.getMonth() + 1) / 3)
  return { period: `${year}-Q${q}`, year }
}

// Raw query helpers (ExecutiveSnapshot table is new — not yet in generated Prisma client types)
async function findLatestSnapshot(period: string) {
  const rows = await prisma.$queryRawUnsafe<
    {
      snapshot_id: string
      reporting_period: string
      fiscal_year: number
      data_as_of_date: Date
      is_published: number  // MySQL returns tinyint as number
      published_at: Date | null
      published_by: string | null
      quality_status: string
      quality_block_reasons: string | null
      approved_strategy_count: number
      validated_demand_count: number
      approved_budget_count: number
    }[]
  >(
    `SELECT snapshot_id, reporting_period, fiscal_year, data_as_of_date,
            is_published, published_at, published_by,
            quality_status, quality_block_reasons,
            approved_strategy_count, validated_demand_count, approved_budget_count
     FROM executive_snapshot
     WHERE reporting_period = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    period,
  )
  return rows[0] ?? null
}

async function upsertSnapshot(payload: {
  snapshot_id: string
  reporting_period: string
  fiscal_year: number
  is_published: boolean
  published_at: Date | null
  published_by: string | null
  quality_status: string
  quality_block_reasons: string[]
  approved_strategy_count: number
  validated_demand_count: number
  approved_budget_count: number
  created_by: string
}) {
  const blockJson = JSON.stringify(payload.quality_block_reasons)
  const dataAsOf = new Date()
  const existing = await findLatestSnapshot(payload.reporting_period)

  if (existing) {
    await prisma.$executeRawUnsafe(
      `UPDATE executive_snapshot
       SET is_published = ?, published_at = ?, published_by = ?,
           quality_status = ?, quality_block_reasons = ?,
           approved_strategy_count = ?, validated_demand_count = ?, approved_budget_count = ?,
           data_as_of_date = ?, modified_by = ?, modified_at = NOW()
       WHERE snapshot_id = ?`,
      payload.is_published ? 1 : 0,
      payload.published_at,
      payload.published_by,
      payload.quality_status,
      blockJson,
      payload.approved_strategy_count,
      payload.validated_demand_count,
      payload.approved_budget_count,
      dataAsOf,
      payload.created_by,
      existing.snapshot_id,
    )
    return existing.snapshot_id
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO executive_snapshot
       (snapshot_id, reporting_period, fiscal_year, data_as_of_date,
        is_published, published_at, published_by,
        quality_status, quality_block_reasons,
        approved_strategy_count, validated_demand_count, approved_budget_count,
        created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    payload.snapshot_id,
    payload.reporting_period,
    payload.fiscal_year,
    dataAsOf,
    payload.is_published ? 1 : 0,
    payload.published_at,
    payload.published_by,
    payload.quality_status,
    blockJson,
    payload.approved_strategy_count,
    payload.validated_demand_count,
    payload.approved_budget_count,
    payload.created_by,
  )
  return payload.snapshot_id
}

// ─────────────────────────────────────────────────────────────────────────────
// getOnePagerPublishState
// ─────────────────────────────────────────────────────────────────────────────

export async function getOnePagerPublishState(): Promise<OnePagerPublishState> {
  const { period, year } = currentPeriod()
  const row = await findLatestSnapshot(period)

  if (!row) {
    return {
      snapshot_id: null,
      reporting_period: period,
      fiscal_year: year,
      data_as_of_date: null,
      is_published: false,
      published_at: null,
      published_by: null,
      quality_status: 'PENDING',
      quality_block_reasons: [],
      approved_strategy_count: 0,
      validated_demand_count: 0,
      approved_budget_count: 0,
    }
  }

  return {
    snapshot_id: row.snapshot_id,
    reporting_period: row.reporting_period,
    fiscal_year: row.fiscal_year,
    data_as_of_date: row.data_as_of_date,
    is_published: Boolean(row.is_published),
    published_at: row.published_at,
    published_by: row.published_by,
    quality_status: row.quality_status as OnePagerPublishState['quality_status'],
    quality_block_reasons: row.quality_block_reasons
      ? JSON.parse(row.quality_block_reasons)
      : [],
    approved_strategy_count: row.approved_strategy_count,
    validated_demand_count: row.validated_demand_count,
    approved_budget_count: row.approved_budget_count,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// publishOnePager — BR-044 quality gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run quality checks (BR-044) and, if all pass, mark the one-pager as published.
 *
 * Quality gate checks:
 *   QC-1: At least one approved strategy
 *   QC-2: No overdue approval transactions
 *   QC-3: At least one validated (or better) demand
 *   QC-4: At least one approved budget submission
 */
export async function publishOnePager(publishedBy: string): Promise<PublishOnePagerResult> {
  const { period, year } = currentPeriod()

  try {
    // ── Run all checks in parallel ─────────────────────────────────────────
    const [
      approvedStrategyCount,
      overdueApprovals,
      validatedDemandCount,
      approvedBudgetCount,
    ] = await Promise.all([
      prisma.strategy.count({ where: { record_status: 'APPROVED', is_active: true } }),
      prisma.approvalTransaction.count({
        where: {
          decision: 'PENDING',
          sla_due_at: { lt: new Date() },
          is_overdue: true,
        },
      }),
      prisma.demand.count({
        where: {
          record_status: { in: ['VALIDATED', 'VALIDATED_COND', 'APPROVED', 'FUNDED'] },
          is_active: true,
        },
      }),
      prisma.budgetSubmission.count({
        where: { record_status: 'APPROVED', is_active: true },
      }),
    ])

    const checks: QualityCheck[] = [
      {
        check_id: 'QC-1',
        label: 'At least one approved strategy',
        passed: approvedStrategyCount > 0,
        detail:
          approvedStrategyCount > 0
            ? `${approvedStrategyCount} approved strategy(ies) found`
            : 'No approved strategies — portfolio cannot be published',
      },
      {
        check_id: 'QC-2',
        label: 'No overdue approval transactions',
        passed: overdueApprovals === 0,
        detail:
          overdueApprovals === 0
            ? 'All approval transactions within SLA'
            : `${overdueApprovals} overdue approval(s) — resolve before publishing`,
      },
      {
        check_id: 'QC-3',
        label: 'At least one commercially validated demand',
        passed: validatedDemandCount > 0,
        detail:
          validatedDemandCount > 0
            ? `${validatedDemandCount} validated demand(s) found`
            : 'No validated demands — publish is premature without approved programme items',
      },
      {
        check_id: 'QC-4',
        label: 'At least one approved budget',
        passed: approvedBudgetCount > 0,
        detail:
          approvedBudgetCount > 0
            ? `${approvedBudgetCount} approved budget submission(s) found`
            : 'No approved budgets — at least one budget must pass G-B1 before publishing',
      },
    ]

    const failedChecks = checks.filter((c) => !c.passed)
    const qualityStatus = failedChecks.length === 0 ? 'PASS' : 'FAIL'
    const blockReasons = failedChecks.map((c) => `${c.check_id}: ${c.detail}`)

    const snapshot_id = generateId('EXS')
    await upsertSnapshot({
      snapshot_id,
      reporting_period: period,
      fiscal_year: year,
      is_published: qualityStatus === 'PASS',
      published_at: qualityStatus === 'PASS' ? new Date() : null,
      published_by: qualityStatus === 'PASS' ? publishedBy : null,
      quality_status: qualityStatus,
      quality_block_reasons: blockReasons,
      approved_strategy_count: approvedStrategyCount,
      validated_demand_count: validatedDemandCount,
      approved_budget_count: approvedBudgetCount,
      created_by: publishedBy,
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'PUBLISH_ONE_PAGER',
      entity_type: 'EXECUTIVE_SNAPSHOT',
      entity_id: snapshot_id,
      active_user_id: publishedBy,
      outcome: qualityStatus === 'PASS' ? 'success' : 'denied',
      quality_status: qualityStatus,
    })

    if (qualityStatus === 'FAIL') {
      return {
        ok: false,
        error: `Quality gate blocked: ${blockReasons.join('; ')}`,
        quality_status: 'FAIL',
        checks,
        code: 'BR-044',
      }
    }

    return { ok: true, snapshot_id, quality_status: 'PASS', checks }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to publish one-pager'
    captureException(err, {
      action_type: 'PUBLISH_ONE_PAGER',
      active_user_id: publishedBy,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message, quality_status: 'FAIL', checks: [], code: 'SERVER_ERROR' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// saveExecutiveNarrative (G-15)
// ─────────────────────────────────────────────────────────────────────────────

export type ExecutiveNarrativePayload = {
  scorecard_id: string
  narrative: {
    top_achievements?: string
    key_concerns?: string
    decisions_actions_required?: string
    next_steps?: string
  }
  modified_by: string
}

export type SaveNarrativeResult =
  | { ok: true }
  | { ok: false; error: string }

export async function saveExecutiveNarrative(
  payload: ExecutiveNarrativePayload,
): Promise<SaveNarrativeResult> {
  if (!payload.scorecard_id?.trim()) return { ok: false, error: 'scorecard_id is required.' }

  try {
    await prisma.balancedScorecard.update({
      where: { scorecard_id: payload.scorecard_id },
      data: {
        executive_narrative: payload.narrative as object,
        modified_by: payload.modified_by,
      },
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'SAVE_EXECUTIVE_NARRATIVE',
      entity_type: 'BALANCED_SCORECARD',
      entity_id: payload.scorecard_id,
      active_user_id: payload.modified_by,
      outcome: 'success',
    })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save narrative'
    captureException(err, {
      action_type: 'SAVE_EXECUTIVE_NARRATIVE',
      entity_id: payload.scorecard_id,
      active_user_id: payload.modified_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// holdOnePager — retract published state
// ─────────────────────────────────────────────────────────────────────────────

export async function holdOnePager(
  heldBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { period, year } = currentPeriod()
  try {
    const snapshot_id = generateId('EXS')
    await upsertSnapshot({
      snapshot_id,
      reporting_period: period,
      fiscal_year: year,
      is_published: false,
      published_at: null,
      published_by: null,
      quality_status: 'PENDING',
      quality_block_reasons: [],
      approved_strategy_count: 0,
      validated_demand_count: 0,
      approved_budget_count: 0,
      created_by: heldBy,
    })
    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'HOLD_ONE_PAGER',
      entity_type: 'EXECUTIVE_SNAPSHOT',
      active_user_id: heldBy,
      outcome: 'success',
    })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to hold one-pager'
    captureException(err, {
      action_type: 'HOLD_ONE_PAGER',
      active_user_id: heldBy,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}
