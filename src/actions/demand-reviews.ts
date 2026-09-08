'use server'

import {
  DecisionEnum,
  Prisma,
  ResolutionStatus,
  VersionStatus,
} from '@prisma/client'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  REVIEW_GATE,
  REVIEW_GATES,
  REVIEW_LABEL,
  isPassedReviewDecision,
  parseReviewType,
  triggeredReviewTypes,
  type DemandReviewType,
} from '@/lib/atlas/demand-reviews'
import {
  createPendingReview,
  latestReviewByGate,
  newReviewId,
} from '@/src/lib/demand-review-ops'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'

function j(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue
}

export type DemandReviewQueueItem = {
  demand_id: string
  demand_title: string
  master_trace_id: string
  submitted_by: string | null
  submitted_at: Date | null
  entry_route: string
  review_type: DemandReviewType
  gate_code: string
  approval_id: string | null
  decision: string
}

export type DemandReviewDetail = {
  demand_id: string
  demand_title: string
  master_trace_id: string
  entry_route: string
  record_status: string | null
  submitted_by: string | null
  submitted_at: Date | null
  problem_opportunity_statement: string | null
  current_state_description: string | null
  scope_in: string | null
  scope_out: string | null
  architecture_impact: boolean
  security_privacy_impact: boolean
  data_governance_impact: boolean
  architecture_assessment_summary: string | null
  security_requirements: string | null
  review_type: DemandReviewType
  gate_code: string
  approval_id: string | null
  latest_decision: string
  latest_comments: string | null
  latest_critical: boolean
  options: { option_name: string; is_do_nothing: boolean }[]
}

export type SubmitDemandReviewPayload = {
  demand_id: string
  review_type: DemandReviewType
  decision: 'ENDORSE' | 'RETURN'
  assessment: string
  critical_finding: boolean
  reviewed_by: string
}

export type SubmitDemandReviewResult =
  | {
      ok: true
      demand_id: string
      approval_id: string
      reviews_clear: boolean
    }
  | { ok: false; error: string }

export async function areDemandReviewsClear(demandId: string): Promise<boolean> {
  const demand = await prisma.demand.findUnique({
    where: { demand_id: demandId },
    select: {
      architecture_impact: true,
      security_privacy_impact: true,
      data_governance_impact: true,
    },
  })
  if (!demand) return false
  const types = triggeredReviewTypes(demand)
  if (types.length === 0) return true
  const latest = await latestReviewByGate(prisma, demandId)
  return types.every((type) => latest.get(REVIEW_GATE[type])?.decision === DecisionEnum.APPROVED)
}

export async function getDemandReviewQueue(): Promise<DemandReviewQueueItem[]> {
  const demands = await prisma.demand.findMany({
    where: {
      is_active: true,
      record_status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
      OR: [
        { architecture_impact: true },
        { security_privacy_impact: true },
        { data_governance_impact: true },
      ],
    },
    select: {
      demand_id: true,
      demand_title: true,
      master_trace_id: true,
      submitted_by: true,
      submitted_at: true,
      entry_route: true,
      architecture_impact: true,
      security_privacy_impact: true,
      data_governance_impact: true,
    },
    orderBy: { submitted_at: 'desc' },
  })

  const items: DemandReviewQueueItem[] = []
  for (const demand of demands) {
    const types = triggeredReviewTypes(demand)
    const latest = await latestReviewByGate(prisma, demand.demand_id)
    for (const type of types) {
      const gate = REVIEW_GATE[type]
      const current = latest.get(gate)
      if (current && isPassedReviewDecision(current.decision)) continue
      items.push({
        demand_id: demand.demand_id,
        demand_title: demand.demand_title,
        master_trace_id: demand.master_trace_id,
        submitted_by: demand.submitted_by,
        submitted_at: demand.submitted_at,
        entry_route: demand.entry_route,
        review_type: type,
        gate_code: gate,
        approval_id: current?.approval_id ?? null,
        decision: current?.decision ?? 'PENDING',
      })
    }
  }
  return items
}

export async function getDemandReviewDetail(
  demandId: string,
  reviewTypeRaw: string,
): Promise<DemandReviewDetail | null> {
  const review_type = parseReviewType(reviewTypeRaw)
  if (!review_type) return null

  const demand = await prisma.demand.findUnique({
    where: { demand_id: demandId },
    include: {
      options: {
        select: { option_name: true, is_do_nothing: true },
        orderBy: { created_at: 'asc' },
      },
    },
  })
  if (!demand) return null

  const gate_code = REVIEW_GATE[review_type]
  const latest = await latestReviewByGate(prisma, demand.demand_id)
  const current = latest.get(gate_code)
  const conditions =
    current?.approval_conditions && typeof current.approval_conditions === 'object'
      ? (current.approval_conditions as { critical_finding?: boolean })
      : null

  return {
    demand_id: demand.demand_id,
    demand_title: demand.demand_title,
    master_trace_id: demand.master_trace_id,
    entry_route: demand.entry_route,
    record_status: demand.record_status,
    submitted_by: demand.submitted_by,
    submitted_at: demand.submitted_at,
    problem_opportunity_statement: demand.problem_opportunity_statement,
    current_state_description: demand.current_state_description,
    scope_in: demand.scope_in,
    scope_out: demand.scope_out,
    architecture_impact: demand.architecture_impact === true,
    security_privacy_impact: demand.security_privacy_impact === true,
    data_governance_impact: demand.data_governance_impact === true,
    architecture_assessment_summary: demand.architecture_assessment_summary,
    security_requirements: demand.security_requirements,
    review_type,
    gate_code,
    approval_id: current?.approval_id ?? null,
    latest_decision: current?.decision ?? 'PENDING',
    latest_comments: current?.decision_comments ?? null,
    latest_critical: conditions?.critical_finding === true,
    options: demand.options,
  }
}

/**
 * Architecture / Security / Data reviewer endorse or return (BR-015).
 * Critical findings record APPROVED_COND and keep validation blocked.
 */
export async function submitDemandReview(
  payload: SubmitDemandReviewPayload,
): Promise<SubmitDemandReviewResult> {
  const { demand_id, review_type, decision, reviewed_by } = payload
  const assessment = payload.assessment.trim()
  const critical_finding = payload.critical_finding === true

  if (!demand_id?.trim()) return { ok: false, error: 'demand_id is required.' }
  if (!REVIEW_LABEL[review_type]) return { ok: false, error: 'Unknown review type.' }

  if (decision === 'ENDORSE' && assessment.length < 20) {
    return {
      ok: false,
      error: 'Disposition and findings are required (minimum 20 characters).',
    }
  }
  if (decision === 'RETURN' && assessment.length < 10) {
    return { ok: false, error: 'A return reason of at least 10 characters is required.' }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const demand = await tx.demand.findUnique({
        where: { demand_id },
        select: {
          demand_id: true,
          master_trace_id: true,
          version_number: true,
          record_status: true,
          is_locked: true,
          architecture_impact: true,
          security_privacy_impact: true,
          data_governance_impact: true,
        },
      })
      if (!demand) throw new Error(`Demand not found: ${demand_id}`)
      if (!['SUBMITTED', 'UNDER_REVIEW'].includes(demand.record_status ?? '')) {
        throw new Error('Demand is not awaiting conditional review.')
      }

      const triggered = triggeredReviewTypes(demand)
      if (!triggered.includes(review_type)) {
        throw new Error(`${REVIEW_LABEL[review_type]} review was not triggered for this demand.`)
      }

      const gate_code = REVIEW_GATE[review_type]
      const latest = await latestReviewByGate(tx, demand_id)
      let approval = latest.get(gate_code)
      if (!approval || approval.decision === DecisionEnum.RETURNED || approval.decision === DecisionEnum.WITHDRAWN) {
        const approval_id = await createPendingReview(tx, {
          demand_id,
          master_trace_id: demand.master_trace_id,
          version_number: demand.version_number,
          review_type,
          submitted_by: reviewed_by,
          sequence: triggered.indexOf(review_type) + 1,
        })
        approval = {
          approval_id,
          decision: DecisionEnum.PENDING,
          decision_comments: null,
          approval_conditions: null,
          created_at: new Date(),
        }
      }
      if (approval.decision !== DecisionEnum.PENDING) {
        throw new Error('This review has already been decided.')
      }

      const now = new Date()

      if (decision === 'RETURN') {
        await tx.approvalTransaction.update({
          where: { approval_id: approval.approval_id },
          data: {
            decision: DecisionEnum.RETURNED,
            decision_at: now,
            decision_comments: assessment,
            approver_user_id: reviewed_by,
            lock_release_action: 'CREATE_REVISION',
            is_locked: false,
          },
        })

        const siblings = await tx.approvalTransaction.findMany({
          where: {
            entity_type: 'DEMAND',
            entity_id: demand_id,
            gate_code: { in: [...REVIEW_GATES] },
            decision: DecisionEnum.PENDING,
            approval_id: { not: approval.approval_id },
          },
          select: { approval_id: true },
        })
        if (siblings.length > 0) {
          await tx.approvalTransaction.updateMany({
            where: { approval_id: { in: siblings.map((s) => s.approval_id) } },
            data: { decision: DecisionEnum.WITHDRAWN, decision_at: now, is_locked: false },
          })
        }

        await tx.demand.update({
          where: { demand_id },
          data: {
            record_status: 'RETURNED',
            approval_status: 'RETURNED',
            version_status: VersionStatus.WORKING,
            is_locked: false,
            current_stage_code: 'PI-04',
            modified_by: reviewed_by,
          },
        })

        await tx.comment.create({
          data: {
            comment_id: newReviewId('CMT'),
            master_trace_id: demand.master_trace_id,
            linked_entity: j({ entity_type: 'DEMAND', entity_id: demand_id, gate_code }),
            comment_type: 'RETURN_INSTRUCTION',
            comment_text: assessment,
            resolution_status: ResolutionStatus.OPEN,
            uploaded_by: reviewed_by,
            created_by: reviewed_by,
            is_locked: false,
          },
        })

        return { approval_id: approval.approval_id, reviews_clear: false }
      }

      const reviewDecision = critical_finding ? DecisionEnum.APPROVED_COND : DecisionEnum.APPROVED
      const demandPatch: Prisma.DemandUpdateInput = {
        modified_by: reviewed_by,
      }
      if (review_type === 'architecture') {
        demandPatch.architecture_assessment_summary = assessment
      }
      if (review_type === 'security') {
        demandPatch.security_requirements = assessment
      }

      await tx.approvalTransaction.update({
        where: { approval_id: approval.approval_id },
        data: {
          decision: reviewDecision,
          decision_at: now,
          decision_comments: assessment,
          approval_conditions: j({
            review_type,
            critical_finding,
            findings: assessment,
          }),
          approver_user_id: reviewed_by,
          lock_release_action: critical_finding ? 'KEEP_LOCKED' : 'RELEASE_FOR_NEXT_STAGE',
          is_locked: true,
        },
      })

      await tx.comment.create({
        data: {
          comment_id: newReviewId('CMT'),
          master_trace_id: demand.master_trace_id,
          linked_entity: j({ entity_type: 'DEMAND', entity_id: demand_id, gate_code }),
          comment_type: critical_finding ? 'VALIDATION_FINDING' : 'APPROVAL_COMMENT',
          comment_text: assessment,
          resolution_status: critical_finding ? ResolutionStatus.OPEN : ResolutionStatus.RESOLVED,
          uploaded_by: reviewed_by,
          created_by: reviewed_by,
          is_locked: false,
        },
      })

      const after = await latestReviewByGate(tx, demand_id)
      after.set(gate_code, {
        approval_id: approval.approval_id,
        decision: reviewDecision,
        decision_comments: assessment,
        approval_conditions: { critical_finding },
        created_at: now,
      })
      const reviews_clear = triggered.every(
        (type) => after.get(REVIEW_GATE[type])?.decision === DecisionEnum.APPROVED,
      )

      if (reviews_clear) {
        demandPatch.record_status = 'UNDER_VALIDATION'
        demandPatch.current_stage_code = 'PI-06'
        demandPatch.approval_status = 'PENDING'
      } else {
        demandPatch.record_status = 'UNDER_REVIEW'
        demandPatch.current_stage_code = 'PI-05'
        demandPatch.approval_status = 'PENDING'
      }

      await tx.demand.update({
        where: { demand_id },
        data: demandPatch,
      })

      return { approval_id: approval.approval_id, reviews_clear }
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'SUBMIT_DEMAND_REVIEW',
      entity_type: 'DEMAND',
      entity_id: demand_id,
      active_user_id: reviewed_by,
      outcome: 'success',
      gate_code: REVIEW_GATE[review_type],
    })

    return { ok: true, demand_id, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit demand review'
    captureException(err, {
      action_type: 'SUBMIT_DEMAND_REVIEW',
      entity_id: demand_id,
      active_user_id: reviewed_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}
