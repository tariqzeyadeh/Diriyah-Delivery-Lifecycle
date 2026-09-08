import { createHash, randomInt } from 'crypto'
import { DecisionEnum, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  REVIEW_APPROVER_ROLE,
  REVIEW_AUTHORITY,
  REVIEW_GATE,
  REVIEW_GATES,
  triggeredReviewTypes,
  type DemandReviewType,
} from '@/lib/atlas/demand-reviews'

export type ReviewTx = Prisma.TransactionClient

export type LatestReview = {
  approval_id: string
  decision: DecisionEnum
  decision_comments: string | null
  approval_conditions: Prisma.JsonValue
  created_at: Date
}

function generateId(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 10000)}`
}

function versionHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export function newReviewId(prefix: string): string {
  return generateId(prefix)
}

export function reviewVersionHash(payload: unknown): string {
  return versionHash(payload)
}

export async function latestReviewByGate(
  tx: ReviewTx | typeof prisma,
  demandId: string,
): Promise<Map<string, LatestReview>> {
  const rows = await tx.approvalTransaction.findMany({
    where: {
      entity_type: 'DEMAND',
      entity_id: demandId,
      gate_code: { in: [...REVIEW_GATES] },
    },
    orderBy: { created_at: 'desc' },
    select: {
      approval_id: true,
      gate_code: true,
      decision: true,
      decision_comments: true,
      approval_conditions: true,
      created_at: true,
    },
  })
  const map = new Map<string, LatestReview>()
  for (const row of rows) {
    if (!map.has(row.gate_code)) {
      map.set(row.gate_code, row)
    }
  }
  return map
}

export async function createPendingReview(
  tx: ReviewTx,
  args: {
    demand_id: string
    master_trace_id: string
    version_number: number
    review_type: DemandReviewType
    submitted_by: string
    sequence: number
  },
): Promise<string> {
  const now = new Date()
  const approval_id = generateId('APR')
  const gate_code = REVIEW_GATE[args.review_type]
  await tx.approvalTransaction.create({
    data: {
      approval_id,
      entity_type: 'DEMAND',
      entity_id: args.demand_id,
      entity_version: args.version_number,
      version_number: args.version_number,
      version_hash: versionHash({
        demand_id: args.demand_id,
        gate_code,
        assigned_at: now.toISOString(),
      }),
      gate_code,
      approval_sequence: args.sequence,
      approval_group: 'DEMAND_CONDITIONAL_REVIEW',
      approver_role: REVIEW_APPROVER_ROLE[args.review_type],
      approver_user_id: 'unassigned',
      authority_basis: REVIEW_AUTHORITY[args.review_type],
      assigned_at: now,
      sla_due_at: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      decision: DecisionEnum.PENDING,
      notification_status: 'PENDING',
      created_by: args.submitted_by,
      master_trace_id: args.master_trace_id,
      is_locked: true,
    },
  })
  return approval_id
}

/** Open PENDING review tasks for each triggered impact flag (idempotent). */
export async function openDemandReviewTasks(
  tx: ReviewTx,
  demand: {
    demand_id: string
    master_trace_id: string
    version_number: number
    architecture_impact: boolean | null
    security_privacy_impact: boolean | null
    data_governance_impact: boolean | null
  },
  submitted_by: string,
): Promise<DemandReviewType[]> {
  const types = triggeredReviewTypes(demand)
  if (types.length === 0) return []

  const latest = await latestReviewByGate(tx, demand.demand_id)
  const opened: DemandReviewType[] = []
  let sequence = 1
  for (const type of types) {
    const gate = REVIEW_GATE[type]
    const current = latest.get(gate)
    const shouldOpen =
      !current ||
      current.decision === DecisionEnum.RETURNED ||
      current.decision === DecisionEnum.WITHDRAWN
    if (shouldOpen) {
      await createPendingReview(tx, {
        demand_id: demand.demand_id,
        master_trace_id: demand.master_trace_id,
        version_number: demand.version_number,
        review_type: type,
        submitted_by,
        sequence,
      })
      opened.push(type)
    }
    sequence += 1
  }
  return opened
}
