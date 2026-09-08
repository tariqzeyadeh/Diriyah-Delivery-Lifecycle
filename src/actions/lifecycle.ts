'use server'

/**
 * Lifecycle hardening actions:
 *
 *   BR-009  – version_number bump when a returned record is re-submitted
 *   BR-010  – version_status transitions (DRAFT → SUBMITTED → RETURNED → RE_SUBMITTED)
 *   BR-011  – reject / close without deleting (terminates the record)
 *   RBAC    – role checks for each action via server-guard
 */

import { randomInt } from 'crypto'
import { revalidateTag } from 'next/cache'
import { VersionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'
import { requireRole } from '@/src/lib/auth/server-guard'

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export type LifecycleResult =
  | { ok: true; entity_id: string; new_status: string; new_version?: number }
  | { ok: false; error: string; code?: string }

function generateId(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 10000)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// BR-011: Reject / Close
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reject a Demand (only when record_status is SUBMITTED, UNDER_REVIEW, or RETURNED).
 *
 * BR-011: A rejected demand cannot be re-opened; it is archived in place.
 * Allowed roles: CTO Office (for gate rejections), Strategy & Governance
 */
export async function rejectDemand(
  demandId: string,
  reason: string,
  actingUserId: string,
): Promise<LifecycleResult> {
  const rbac = await requireRole('CTO Office', 'Strategy & Governance')
  if (rbac) return rbac

  if (!demandId?.trim()) return { ok: false, error: 'demandId is required.' }
  if (!reason?.trim()) return { ok: false, error: 'Rejection reason is required.' }

  try {
    const demand = await prisma.demand.findUnique({
      where: { demand_id: demandId },
      select: { record_status: true, is_locked: true },
    })
    if (!demand) return { ok: false, error: `Demand not found: ${demandId}` }
    if (demand.record_status === 'REJECTED') return { ok: false, error: 'Already rejected.' }
    if (demand.record_status === 'APPROVED') {
      return { ok: false, error: 'Cannot reject an already-approved demand.' }
    }

    await prisma.demand.update({
      where: { demand_id: demandId },
      data: {
        record_status: 'REJECTED',
        approval_status: 'REJECTED',
        is_locked: true,
        is_active: false,
        modified_by: actingUserId,
      },
    })

    // Add a system comment with the rejection reason
    const comment_id = generateId('CMT')
    await prisma.comment.create({
      data: {
        comment_id,
        linked_entity_field: { entity_type: 'DEMAND', entity_id: demandId },
        comment_type: 'GENERAL',
        comment_text: `[REJECTED] ${reason}`,
        created_by: actingUserId,
        uploaded_by: actingUserId,
        resolution_status: 'RESOLVED',
      },
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'REJECT_DEMAND',
      entity_type: 'DEMAND',
      entity_id: demandId,
      active_user_id: actingUserId,
      outcome: 'success',
      reason,
    })

    return { ok: true, entity_id: demandId, new_status: 'REJECTED' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reject demand'
    captureException(err, { action_type: 'REJECT_DEMAND', entity_id: demandId, outcome: 'failure', error: message, active_user_id: actingUserId })
    return { ok: false, error: message }
  }
}

/**
 * Reject a Strategy (only CTO Office — gate G-S1 rejection).
 */
export async function rejectStrategy(
  strategyId: string,
  reason: string,
  actingUserId: string,
): Promise<LifecycleResult> {
  const rbac = await requireRole('CTO Office')
  if (rbac) return rbac

  if (!strategyId?.trim()) return { ok: false, error: 'strategyId is required.' }
  if (!reason?.trim()) return { ok: false, error: 'Rejection reason is required.' }

  try {
    const strategy = await prisma.strategy.findUnique({
      where: { strategy_id: strategyId },
      select: { record_status: true },
    })
    if (!strategy) return { ok: false, error: `Strategy not found: ${strategyId}` }
    if (strategy.record_status === 'REJECTED') return { ok: false, error: 'Already rejected.' }
    if (strategy.record_status === 'APPROVED') {
      return { ok: false, error: 'Cannot reject an already-approved strategy.' }
    }

    await prisma.strategy.update({
      where: { strategy_id: strategyId },
      data: {
        record_status: 'REJECTED',
        approval_status: 'REJECTED',
        is_locked: true,
        is_active: false,
        modified_by: actingUserId,
      },
    })

    const comment_id = generateId('CMT')
    await prisma.comment.create({
      data: {
        comment_id,
        linked_entity_field: { entity_type: 'STRATEGY', entity_id: strategyId },
        comment_type: 'GENERAL',
        comment_text: `[REJECTED] ${reason}`,
        created_by: actingUserId,
        uploaded_by: actingUserId,
        resolution_status: 'RESOLVED',
      },
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'REJECT_STRATEGY',
      entity_type: 'STRATEGY',
      entity_id: strategyId,
      active_user_id: actingUserId,
      outcome: 'success',
      reason,
    })

    return { ok: true, entity_id: strategyId, new_status: 'REJECTED' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reject strategy'
    captureException(err, { action_type: 'REJECT_STRATEGY', entity_id: strategyId, outcome: 'failure', error: message, active_user_id: actingUserId })
    return { ok: false, error: message }
  }
}

/**
 * Reject a BudgetSubmission (CTO Office — gate G-B1 rejection).
 */
export async function rejectBudget(
  budgetSubmissionId: string,
  reason: string,
  actingUserId: string,
): Promise<LifecycleResult> {
  const rbac = await requireRole('CTO Office')
  if (rbac) return rbac

  if (!budgetSubmissionId?.trim()) return { ok: false, error: 'budgetSubmissionId is required.' }
  if (!reason?.trim()) return { ok: false, error: 'Rejection reason is required.' }

  try {
    const budget = await prisma.budgetSubmission.findUnique({
      where: { budget_submission_id: budgetSubmissionId },
      select: { record_status: true, is_locked: true },
    })
    if (!budget) return { ok: false, error: `Budget not found: ${budgetSubmissionId}` }
    if (budget.record_status === 'REJECTED') return { ok: false, error: 'Already rejected.' }
    if (budget.record_status === 'APPROVED') {
      return { ok: false, error: 'Cannot reject an already-approved budget.' }
    }

    await prisma.budgetSubmission.update({
      where: { budget_submission_id: budgetSubmissionId },
      data: {
        record_status: 'REJECTED',
        approval_status: 'REJECTED',
        is_locked: false, // Allow Commercial to revise
        modified_by: actingUserId,
      },
    })

    const comment_id = generateId('CMT')
    await prisma.comment.create({
      data: {
        comment_id,
        linked_entity_field: { entity_type: 'BUDGET_SUBMISSION', entity_id: budgetSubmissionId },
        comment_type: 'GENERAL',
        comment_text: `[REJECTED] ${reason}`,
        created_by: actingUserId,
        uploaded_by: actingUserId,
        resolution_status: 'RESOLVED',
      },
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'REJECT_BUDGET',
      entity_type: 'BUDGET_SUBMISSION',
      entity_id: budgetSubmissionId,
      active_user_id: actingUserId,
      outcome: 'success',
      reason,
    })

    return { ok: true, entity_id: budgetSubmissionId, new_status: 'REJECTED' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reject budget'
    captureException(err, { action_type: 'REJECT_BUDGET', entity_id: budgetSubmissionId, outcome: 'failure', error: message, active_user_id: actingUserId })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BR-009/010: Re-submit with version bump
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-submit a returned Demand (BR-009/010).
 *
 * When a demand has been RETURNED by a reviewer, the Business Owner can
 * address the comments and re-submit. Each re-submission bumps version_number.
 */
export async function resubmitDemand(
  demandId: string,
  submittedBy: string,
): Promise<LifecycleResult> {
  const rbac = await requireRole('Business Owner', 'CTO Office')
  if (rbac) return rbac

  if (!demandId?.trim()) return { ok: false, error: 'demandId is required.' }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const demand = await tx.demand.findUnique({
        where: { demand_id: demandId },
        select: {
          record_status: true,
          approval_status: true,
          version_number: true,
          architecture_impact: true,
          security_privacy_impact: true,
          data_governance_impact: true,
          master_trace_id: true,
        },
      })

      if (!demand) throw new Error(`Demand not found: ${demandId}`)
      if (!['RETURNED', 'DRAFT'].includes(demand.record_status ?? '')) {
        throw Object.assign(
          new Error('Demand must be in RETURNED or DRAFT status to re-submit.'),
          { code: 'BR-009' },
        )
      }

      // BR-009: bump version number
      const newVersion = (demand.version_number ?? 1) + 1

      await tx.demand.update({
        where: { demand_id: demandId },
        data: {
          record_status: 'SUBMITTED',
          version_status: VersionStatus.SUBMITTED,
          approval_status: 'PENDING',
          version_number: newVersion,
          is_locked: true,
          submitted_by: submittedBy,
          submitted_at: new Date(),
          modified_by: submittedBy,
        },
      })

      return { demand_id: demandId, new_version: newVersion }
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'RESUBMIT_DEMAND',
      entity_type: 'DEMAND',
      entity_id: demandId,
      active_user_id: submittedBy,
      outcome: 'success',
      new_version: result.new_version,
    })

    return {
      ok: true,
      entity_id: demandId,
      new_status: 'SUBMITTED',
      new_version: result.new_version,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to re-submit demand'
    const code = (err as { code?: string }).code
    captureException(err, { action_type: 'RESUBMIT_DEMAND', entity_id: demandId, outcome: 'failure', error: message, active_user_id: submittedBy })
    return { ok: false, error: message, code }
  }
}

/**
 * Re-submit a returned Strategy (BR-009/010).
 * Only Strategy & Governance can re-submit.
 */
export async function resubmitStrategy(
  strategyId: string,
  submittedBy: string,
): Promise<LifecycleResult> {
  const rbac = await requireRole('Strategy & Governance', 'CTO Office')
  if (rbac) return rbac

  if (!strategyId?.trim()) return { ok: false, error: 'strategyId is required.' }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const strategy = await tx.strategy.findUnique({
        where: { strategy_id: strategyId },
        select: { record_status: true, version_number: true },
      })

      if (!strategy) throw new Error(`Strategy not found: ${strategyId}`)
      if (!['RETURNED', 'DRAFT', 'WORKING'].includes(strategy.record_status ?? '')) {
        throw Object.assign(
          new Error('Strategy must be in RETURNED or WORKING status to re-submit.'),
          { code: 'BR-009' },
        )
      }

      const newVersion = (strategy.version_number ?? 1) + 1

      await tx.strategy.update({
        where: { strategy_id: strategyId },
        data: {
          record_status: 'SUBMITTED',
          version_status: VersionStatus.SUBMITTED,
          approval_status: 'PENDING',
          version_number: newVersion,
          is_locked: true,
          submitted_by: submittedBy,
          submitted_at: new Date(),
          modified_by: submittedBy,
        },
      })

      return { strategy_id: strategyId, new_version: newVersion }
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'RESUBMIT_STRATEGY',
      entity_type: 'STRATEGY',
      entity_id: strategyId,
      active_user_id: submittedBy,
      outcome: 'success',
      new_version: result.new_version,
    })

    return {
      ok: true,
      entity_id: strategyId,
      new_status: 'SUBMITTED',
      new_version: result.new_version,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to re-submit strategy'
    const code = (err as { code?: string }).code
    captureException(err, { action_type: 'RESUBMIT_STRATEGY', entity_id: strategyId, outcome: 'failure', error: message, active_user_id: submittedBy })
    return { ok: false, error: message, code }
  }
}

/**
 * Re-submit a returned Budget (BR-009/010).
 * Only Commercial & Budgeting can re-submit.
 */
export async function resubmitBudget(
  budgetSubmissionId: string,
  submittedBy: string,
): Promise<LifecycleResult> {
  const rbac = await requireRole('Commercial & Budgeting', 'CTO Office')
  if (rbac) return rbac

  if (!budgetSubmissionId?.trim()) return { ok: false, error: 'budgetSubmissionId is required.' }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const budget = await tx.budgetSubmission.findUnique({
        where: { budget_submission_id: budgetSubmissionId },
        select: {
          record_status: true,
          version_number: true,
          is_locked: true,
          consolidation: { select: { funding_recommendation_summary: true } },
        },
      })

      if (!budget) throw new Error(`Budget not found: ${budgetSubmissionId}`)
      if (!['RETURNED', 'DRAFT'].includes(budget.record_status ?? '')) {
        throw Object.assign(
          new Error('Budget must be in RETURNED or DRAFT status to re-submit.'),
          { code: 'BR-009' },
        )
      }

      // BR-027: re-check consolidation pack before re-submission
      if (!budget.consolidation?.funding_recommendation_summary?.trim()) {
        throw Object.assign(
          new Error('BR-027: Consolidation pack (CON-018) must be completed before re-submission.'),
          { code: 'BR-027' },
        )
      }

      const newVersion = (budget.version_number ?? 1) + 1

      await tx.budgetSubmission.update({
        where: { budget_submission_id: budgetSubmissionId },
        data: {
          record_status: 'SUBMITTED',
          version_status: VersionStatus.SUBMITTED,
          approval_status: 'PENDING',
          version_number: newVersion,
          is_locked: true,
          submitted_by: submittedBy,
          submitted_at: new Date(),
          modified_by: submittedBy,
        },
      })

      return { budget_submission_id: budgetSubmissionId, new_version: newVersion }
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'RESUBMIT_BUDGET',
      entity_type: 'BUDGET_SUBMISSION',
      entity_id: budgetSubmissionId,
      active_user_id: submittedBy,
      outcome: 'success',
      new_version: result.new_version,
    })

    return {
      ok: true,
      entity_id: budgetSubmissionId,
      new_status: 'SUBMITTED',
      new_version: result.new_version,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to re-submit budget'
    const code = (err as { code?: string }).code
    captureException(err, { action_type: 'RESUBMIT_BUDGET', entity_id: budgetSubmissionId, outcome: 'failure', error: message, active_user_id: submittedBy })
    return { ok: false, error: message, code }
  }
}
