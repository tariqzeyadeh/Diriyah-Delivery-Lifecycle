'use server'

import { randomInt } from 'crypto'
import { Prisma } from '@prisma/client'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProcurementPlanHeader = {
  procurement_plan_id: string
  procurement_plan_title: string
  budget_submission_id: string
  master_trace_id: string
  plan_start_date: string | null // ISO date
  plan_end_date: string | null
  procurement_plan_owner_user_id: string | null
  release_authorization_status: string | null
  approved_funding_available_sar: number | null
  planned_procurement_value_sar: number | null
  procurement_item_count: number | null
  record_status: string | null
  is_locked: boolean
}

export type SaveProcurementPlanHeaderPayload = {
  procurement_plan_id: string
  procurement_plan_title?: string
  plan_start_date?: string | null
  plan_end_date?: string | null
  procurement_plan_owner_user_id?: string | null
  release_authorization_status?: string | null
  modified_by: string
}

export type SaveProcurementPlanHeaderResult =
  | { ok: true; procurement_plan_id: string }
  | { ok: false; error: string }

// ─────────────────────────────────────────────────────────────────────────────
// getProcurementPlanHeader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the procurement plan header for a given budget submission.
 * Returns the first (and typically only) plan linked to the submission.
 */
export async function getProcurementPlanHeader(
  budgetSubmissionId: string,
): Promise<ProcurementPlanHeader | null> {
  const plan = await prisma.procurementPlan.findFirst({
    where: { budget_submission_id: budgetSubmissionId, is_active: true },
    select: {
      procurement_plan_id: true,
      procurement_plan_title: true,
      budget_submission_id: true,
      master_trace_id: true,
      plan_start_date: true,
      plan_end_date: true,
      procurement_plan_owner_user_id: true,
      release_authorization_status: true,
      approved_funding_available_sar: true,
      planned_procurement_value_sar: true,
      procurement_item_count: true,
      record_status: true,
      is_locked: true,
    },
    orderBy: { created_at: 'asc' },
  })

  if (!plan) return null

  return {
    procurement_plan_id: plan.procurement_plan_id,
    procurement_plan_title: plan.procurement_plan_title,
    budget_submission_id: plan.budget_submission_id,
    master_trace_id: plan.master_trace_id,
    plan_start_date: plan.plan_start_date?.toISOString().split('T')[0] ?? null,
    plan_end_date: plan.plan_end_date?.toISOString().split('T')[0] ?? null,
    procurement_plan_owner_user_id: plan.procurement_plan_owner_user_id,
    release_authorization_status: plan.release_authorization_status,
    approved_funding_available_sar: plan.approved_funding_available_sar
      ? Number(plan.approved_funding_available_sar)
      : null,
    planned_procurement_value_sar: plan.planned_procurement_value_sar
      ? Number(plan.planned_procurement_value_sar)
      : null,
    procurement_item_count: plan.procurement_item_count,
    record_status: plan.record_status,
    is_locked: plan.is_locked,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// saveProcurementPlanHeader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the editable header fields on a ProcurementPlan (PI-07).
 */
export async function saveProcurementPlanHeader(
  payload: SaveProcurementPlanHeaderPayload,
): Promise<SaveProcurementPlanHeaderResult> {
  const { procurement_plan_id, modified_by } = payload

  if (!procurement_plan_id?.trim()) {
    return { ok: false, error: 'procurement_plan_id is required.' }
  }

  try {
    const data: Prisma.ProcurementPlanUpdateInput = {
      modified_by,
    }

    if (payload.procurement_plan_title !== undefined) {
      const title = payload.procurement_plan_title?.trim()
      if (!title) return { ok: false, error: 'Plan title cannot be empty.' }
      data.procurement_plan_title = title
    }
    if (payload.plan_start_date !== undefined) {
      data.plan_start_date = payload.plan_start_date
        ? new Date(payload.plan_start_date)
        : null
    }
    if (payload.plan_end_date !== undefined) {
      data.plan_end_date = payload.plan_end_date ? new Date(payload.plan_end_date) : null
    }
    if (payload.procurement_plan_owner_user_id !== undefined) {
      data.procurement_plan_owner_user_id = payload.procurement_plan_owner_user_id ?? null
    }
    if (payload.release_authorization_status !== undefined) {
      data.release_authorization_status = payload.release_authorization_status ?? null
    }

    await prisma.procurementPlan.update({
      where: { procurement_plan_id },
      data,
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'SAVE_PROCUREMENT_PLAN_HEADER',
      entity_type: 'PROCUREMENT_PLAN',
      entity_id: procurement_plan_id,
      active_user_id: modified_by,
      outcome: 'success',
    })

    return { ok: true, procurement_plan_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save procurement plan header'
    captureException(err, {
      action_type: 'SAVE_PROCUREMENT_PLAN_HEADER',
      entity_id: procurement_plan_id,
      active_user_id: modified_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}
