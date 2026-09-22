'use server'

import { createHash, randomInt } from 'crypto'
import { ApprovalDecision, Prisma, VersionStatus } from '@prisma/client'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { areDemandReviewsClear } from '@/src/actions/demand-reviews'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'
import {
  VALIDATION_DECISION_LABELS,
  isValidatedDecision,
  type ValidationDecision,
  type DuplicateCheckResult,
} from '@/lib/atlas/demand-validation'

// Re-export types only (type-only re-exports are compile-time only, no runtime value)
export type { ValidationDecision, DuplicateCheckResult } from '@/lib/atlas/demand-validation'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 10000)}`
}

function j(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue
}

/**
 * Simple title-keyword duplicate search.
 * Finds demands with 3+ consecutive words in common with the target title,
 * or whose title contains at least one 5+ char word from the target.
 */
async function runDuplicateSearch(
  demandId: string,
  demandTitle: string,
): Promise<DuplicateCheckResult> {
  const words = demandTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 5)

  if (words.length === 0) {
    return { status: 'CLEAR', potential_matches: [] }
  }

  // Search for any demand sharing a meaningful keyword
  const candidates = await prisma.demand.findMany({
    where: {
      demand_id: { not: demandId },
      is_active: true,
      record_status: {
        in: ['SUBMITTED', 'UNDER_REVIEW', 'UNDER_VALIDATION', 'VALIDATED', 'VALIDATED_COND'],
      },
      OR: words.map((w) => ({
        demand_title: { contains: w },
      })),
    },
    select: { demand_id: true, demand_title: true, record_status: true },
    take: 5,
  })

  if (candidates.length === 0) return { status: 'CLEAR', potential_matches: [] }
  return { status: 'POTENTIAL_DUPLICATE', potential_matches: candidates }
}

/**
 * Compute a basic completeness score — percentage of core mandatory fields
 * that are non-null/non-empty.
 */
function computeCompleteness(demand: {
  demand_title: string
  problem_opportunity_statement: string | null
  scope_in: string | null
  scope_out: string | null
  indicative_one_time_cost_sar: unknown
  requested_start_date: unknown
  required_by_date: unknown
  delivery_mode: string | null
  estimate_confidence: string | null
  urgency: string | null
}): number {
  const checks = [
    !!demand.demand_title?.trim(),
    !!demand.problem_opportunity_statement?.trim(),
    !!demand.scope_in?.trim(),
    !!demand.scope_out?.trim(),
    !!demand.indicative_one_time_cost_sar,
    !!demand.requested_start_date,
    !!demand.required_by_date,
    !!demand.delivery_mode?.trim(),
    !!demand.estimate_confidence?.trim(),
    !!demand.urgency?.trim(),
  ]
  const filled = checks.filter(Boolean).length
  return Math.round((filled / checks.length) * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DemandValidationQueueItem = {
  demand_id: string
  demand_title: string
  master_trace_id: string
  entry_route: string
  record_status: string | null
  submitted_at: Date | null
  submitted_by: string | null
  urgency: string | null
  indicative_one_time_cost_sar: number | null
  budget_validation_decision: string | null
  completeness_score_pct: number | null
}

export type DemandValidationDetail = {
  demand_id: string
  demand_title: string
  master_trace_id: string
  entry_route: string
  record_status: string | null
  submitted_at: Date | null
  submitted_by: string | null
  urgency: string | null
  problem_opportunity_statement: string | null
  current_state_description: string | null
  scope_in: string | null
  scope_out: string | null
  indicative_one_time_cost_sar: number | null
  indicative_recurring_cost_sar: number | null
  tco_sar: number | null
  cost_estimate_basis: string | null
  estimate_confidence: string | null
  delivery_mode: string | null
  requested_start_date: Date | null
  required_by_date: Date | null
  ad_hoc_justification: string | null
  completeness_score_pct: number
  duplicate_check_result: DuplicateCheckResult
  budget_validation_decision: string | null
  budget_validation_comments: string | null
  architecture_assessment_summary: string | null
  security_requirements: string | null
  options: { option_name: string; is_do_nothing: boolean; option_estimated_cost_sar: number | null }[]
  benefits: { benefit_description: string | null; annual_financial_benefit_sar: number | null }[]
}

export type ValidateDemandPayload = {
  demand_id: string
  decision: ValidationDecision
  comments: string
  duplicate_disposition?: string
  duplicate_related_ids?: string[]
  validated_by: string
}

export type ValidateDemandResult =
  | { ok: true; demand_id: string; decision: ValidationDecision }
  | { ok: false; error: string; code?: string }

// ─────────────────────────────────────────────────────────────────────────────
// getDemandValidationQueue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Demands awaiting commercial validation (PI-06).
 * Includes UNDER_VALIDATION (cleared reviews) and SUBMITTED (no impact flags).
 */
export async function getDemandValidationQueue(): Promise<DemandValidationQueueItem[]> {
  const demands = await prisma.demand.findMany({
    where: {
      is_active: true,
      record_status: { in: ['UNDER_VALIDATION', 'SUBMITTED', 'UNDER_REVIEW'] },
    },
    select: {
      demand_id: true,
      demand_title: true,
      master_trace_id: true,
      entry_route: true,
      record_status: true,
      submitted_at: true,
      submitted_by: true,
      urgency: true,
      indicative_one_time_cost_sar: true,
      budget_validation_decision: true,
      completeness_score_pct: true,
    },
    orderBy: [{ urgency: 'asc' }, { submitted_at: 'asc' }],
  })

  const ready: typeof demands = []
  for (const demand of demands) {
    if (demand.record_status === 'UNDER_REVIEW') {
      const clear = await areDemandReviewsClear(demand.demand_id)
      if (!clear) continue
    }
    ready.push(demand)
  }

  return ready.map((d) => ({
    demand_id: d.demand_id,
    demand_title: d.demand_title,
    master_trace_id: d.master_trace_id,
    entry_route: d.entry_route,
    record_status: d.record_status,
    submitted_at: d.submitted_at,
    submitted_by: d.submitted_by,
    urgency: d.urgency,
    indicative_one_time_cost_sar: d.indicative_one_time_cost_sar
      ? Number(d.indicative_one_time_cost_sar)
      : null,
    budget_validation_decision: d.budget_validation_decision,
    completeness_score_pct: d.completeness_score_pct
      ? Number(d.completeness_score_pct)
      : null,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// getDemandValidationDetail
// ─────────────────────────────────────────────────────────────────────────────

export async function getDemandValidationDetail(
  demandId: string,
): Promise<DemandValidationDetail | null> {
  const demand = await prisma.demand.findUnique({
    where: { demand_id: demandId },
    include: {
      options: {
        select: {
          option_name: true,
          is_do_nothing: true,
          option_estimated_cost_sar: true,
        },
        orderBy: { created_at: 'asc' },
      },
      benefits: {
        select: {
          benefit_description: true,
          annual_financial_benefit_sar: true,
        },
        orderBy: { created_at: 'asc' },
      },
    },
  })
  if (!demand) return null

  // Recompute completeness score
  const completeness_score_pct = computeCompleteness(demand)

  // Run duplicate search (or use stored result if already Clear/disposed)
  const stored = demand.duplicate_check_result as DuplicateCheckResult | null
  const duplicate_check_result: DuplicateCheckResult =
    stored && (stored.status === 'CLEAR' || stored.status === 'OVERLAP_ACCEPTED')
      ? stored
      : await runDuplicateSearch(demand.demand_id, demand.demand_title)

  return {
    demand_id: demand.demand_id,
    demand_title: demand.demand_title,
    master_trace_id: demand.master_trace_id,
    entry_route: demand.entry_route,
    record_status: demand.record_status,
    submitted_at: demand.submitted_at,
    submitted_by: demand.submitted_by,
    urgency: demand.urgency,
    problem_opportunity_statement: demand.problem_opportunity_statement,
    current_state_description: demand.current_state_description,
    scope_in: demand.scope_in,
    scope_out: demand.scope_out,
    indicative_one_time_cost_sar: demand.indicative_one_time_cost_sar
      ? Number(demand.indicative_one_time_cost_sar)
      : null,
    indicative_recurring_cost_sar: demand.indicative_recurring_cost_sar
      ? Number(demand.indicative_recurring_cost_sar)
      : null,
    tco_sar: demand.tco_sar ? Number(demand.tco_sar) : null,
    cost_estimate_basis: demand.cost_estimate_basis,
    estimate_confidence: demand.estimate_confidence,
    delivery_mode: demand.delivery_mode,
    requested_start_date: demand.requested_start_date,
    required_by_date: demand.required_by_date,
    ad_hoc_justification: demand.ad_hoc_justification,
    completeness_score_pct,
    duplicate_check_result,
    budget_validation_decision: demand.budget_validation_decision,
    budget_validation_comments: demand.budget_validation_comments,
    architecture_assessment_summary: demand.architecture_assessment_summary,
    security_requirements: demand.security_requirements,
    options: demand.options.map((o) => ({
      option_name: o.option_name,
      is_do_nothing: o.is_do_nothing,
      option_estimated_cost_sar: o.option_estimated_cost_sar
        ? Number(o.option_estimated_cost_sar)
        : null,
    })),
    benefits: demand.benefits.map((b) => ({
      benefit_description: b.benefit_description,
      annual_financial_benefit_sar: b.annual_financial_benefit_sar
        ? Number(b.annual_financial_benefit_sar)
        : null,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// validateDemand
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commercial & Budgeting validation of a submitted demand (PI-06).
 *
 * Enforces:
 *   BR-020 — duplicate check non-clear requires disposition before validation
 *   DEM-094 — only VALIDATED/VALIDATED_COND can enter budget consolidation
 */
export async function validateDemand(
  payload: ValidateDemandPayload,
): Promise<ValidateDemandResult> {
  const { demand_id, decision, validated_by } = payload
  const comments = payload.comments?.trim() ?? ''

  if (!demand_id?.trim()) return { ok: false, error: 'demand_id is required.' }
  if (!decision) return { ok: false, error: 'A validation decision is required.' }
  const requiresComments: ValidationDecision[] = ['VALIDATED_COND', 'CONDITIONAL', 'RETURNED', 'NOT_FUNDABLE', 'DEFERRED']
  if (requiresComments.includes(decision) && comments.length < 10) {
    return {
      ok: false,
      error: 'Comments are required for this decision (min. 10 chars).',
      code: 'COMMENTS_REQUIRED',
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const demand = await tx.demand.findUnique({
        where: { demand_id },
        select: {
          demand_id: true,
          demand_title: true,
          master_trace_id: true,
          record_status: true,
          is_locked: true,
          duplicate_check_result: true,
        },
      })
      if (!demand) throw new Error(`Demand not found: ${demand_id}`)
      if (demand.record_status === 'UNDER_REVIEW') {
        const clear = await areDemandReviewsClear(demand_id)
        if (!clear) {
          throw new Error(
            'Demand is not in a validatable state. Conditional reviews are still open.',
          )
        }
      } else if (!['SUBMITTED', 'UNDER_VALIDATION'].includes(demand.record_status ?? '')) {
        throw new Error(
          'Demand is not in a validatable state. It must be SUBMITTED or UNDER_VALIDATION.',
        )
      }

      // BR-020: duplicate check non-clear requires disposition
      const storedDup = demand.duplicate_check_result as DuplicateCheckResult | null
      if (storedDup && storedDup.status === 'POTENTIAL_DUPLICATE') {
        if (!payload.duplicate_disposition?.trim()) {
          throw Object.assign(
            new Error(
              'BR-020: Potential duplicate detected. Provide a disposition and related record reference before validating.',
            ),
            { code: 'BR-020' },
          )
        }
      }

      const now = new Date()

      // Build updated duplicate_check_result
      let newDupResult: DuplicateCheckResult | null = null
      if (storedDup) {
        newDupResult = {
          ...storedDup,
          disposition: payload.duplicate_disposition ?? storedDup.disposition,
          related_record_ids:
            payload.duplicate_related_ids && payload.duplicate_related_ids.length > 0
              ? payload.duplicate_related_ids
              : storedDup.related_record_ids,
          status:
            payload.duplicate_disposition?.trim()
              ? 'OVERLAP_ACCEPTED'
              : storedDup.status,
        }
      }

      let newStatus: string
      let newApprovalStatus: ApprovalDecision
      let newLocked: boolean
      let currentStage: string

      switch (decision) {
        case 'VALIDATED':
          newStatus = 'VALIDATED'
          newApprovalStatus = ApprovalDecision.APPROVED
          newLocked = true
          currentStage = 'PI-07'
          break
        case 'VALIDATED_COND':
          newStatus = 'VALIDATED_COND'
          newApprovalStatus = ApprovalDecision.APPROVED_COND
          newLocked = true
          currentStage = 'PI-07'
          break
        case 'RETURNED':
          newStatus = 'RETURNED'
          newApprovalStatus = ApprovalDecision.RETURNED
          newLocked = false
          currentStage = 'PI-04'
          break
        case 'NOT_FUNDABLE':
          newStatus = 'NOT_FUNDABLE'
          newApprovalStatus = ApprovalDecision.REJECTED
          newLocked = true
          currentStage = 'CLOSED'
          break
        case 'CONDITIONAL':
          // G-06: Conditional — demand is partially approved subject to conditions being met
          newStatus = 'CONDITIONAL'
          newApprovalStatus = ApprovalDecision.APPROVED_COND
          newLocked = true
          currentStage = 'PI-07'
          break
        case 'DEFERRED':
          // G-06: Demand is deferred — out of current budget cycle but may be re-raised later
          newStatus = 'DEFERRED'
          newApprovalStatus = ApprovalDecision.RETURNED
          newLocked = false
          currentStage = 'PI-04'
          break
        default:
          throw new Error(`Unknown validation decision: ${decision}`)
      }

      await tx.demand.update({
        where: { demand_id },
        data: {
          budget_validation_decision: decision,
          budget_validation_comments: comments || null,
          duplicate_check_result: newDupResult ? j(newDupResult) : undefined,
          record_status: newStatus,
          approval_status: newApprovalStatus,
          version_status: VersionStatus.APPROVED,
          is_locked: newLocked,
          current_stage_code: currentStage,
          modified_by: validated_by,
        },
      })

      // Add audit comment
      await tx.comment.create({
        data: {
          comment_id: generateId('CMT'),
          master_trace_id: demand.master_trace_id,
          linked_entity: j({ entity_type: 'DEMAND', entity_id: demand_id }),
          comment_type: decision === 'RETURNED' ? 'RETURN_INSTRUCTION' : 'APPROVAL_COMMENT',
          comment_text: comments || VALIDATION_DECISION_LABELS[decision],
          resolution_status: 'RESOLVED',
          uploaded_by: validated_by,
          created_by: validated_by,
          is_locked: false,
        },
      })
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'VALIDATE_DEMAND',
      entity_type: 'DEMAND',
      entity_id: demand_id,
      active_user_id: validated_by,
      outcome: 'success',
    })

    return { ok: true, demand_id, decision }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to validate demand'
    const code = (err as { code?: string }).code
    captureException(err, {
      action_type: 'VALIDATE_DEMAND',
      entity_id: demand_id,
      active_user_id: validated_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message, code }
  }
}
