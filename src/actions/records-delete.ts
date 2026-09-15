'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'
import { getServerPersonaEmail } from '@/src/lib/auth/server-guard'
import { normalizeProcurementStage } from '@/lib/atlas/procurement'
import {
  type DeletableEntity,
  type DeleteBlockCode,
  isDraftStatus,
} from '@/lib/atlas/record-delete'

export type { DeletableEntity, DeleteBlockCode }

export type DeleteRecordResult = { ok: true } | { ok: false; error: string; code?: DeleteBlockCode }

async function actorId(): Promise<string> {
  return (await getServerPersonaEmail()) ?? 'system'
}

function revalidateRegisters() {
  revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
  for (const locale of ['en', 'ar'] as const) {
    revalidatePath(`/${locale}/strategy`)
    revalidatePath(`/${locale}/demand`)
    revalidatePath(`/${locale}/budget`)
    revalidatePath(`/${locale}/procurement`)
    revalidatePath(`/${locale}/projects`)
    revalidatePath(`/${locale}/home`)
  }
}

async function deactivateOrphanTrace(masterTraceId: string) {
  const [strategies, demands, budgets, items, projects] = await Promise.all([
    prisma.strategy.count({ where: { master_trace_id: masterTraceId, is_active: true } }),
    prisma.demand.count({ where: { master_trace_id: masterTraceId, is_active: true } }),
    prisma.budgetSubmission.count({ where: { master_trace_id: masterTraceId, is_active: true } }),
    prisma.procurementItem.count({ where: { master_trace_id: masterTraceId, is_active: true } }),
    prisma.projectRegistration.count({ where: { master_trace_id: masterTraceId, is_active: true } }),
  ])
  if (strategies + demands + budgets + items + projects === 0) {
    await prisma.masterTrace.update({
      where: { master_trace_id: masterTraceId },
      data: { is_active: false },
    })
  }
}

function fail(code: DeleteBlockCode, error: string): DeleteRecordResult {
  return { ok: false, error, code }
}

export async function deletePortfolioRecord(payload: {
  entityType: DeletableEntity
  entityId: string
}): Promise<DeleteRecordResult> {
  const entityType = payload.entityType
  const entityId = payload.entityId?.trim()
  if (!entityId) return { ok: false, error: 'Record id is required.' }
  const actingUser = await actorId()

  try {
    let result: DeleteRecordResult
    if (entityType === 'STRATEGY') result = await deleteStrategy(entityId, actingUser)
    else if (entityType === 'DEMAND') result = await deleteDemand(entityId, actingUser)
    else if (entityType === 'BUDGET') result = await deleteBudget(entityId, actingUser)
    else if (entityType === 'PROCUREMENT') result = await deleteProcurement(entityId, actingUser)
    else result = fail('registered', 'Registered projects cannot be deleted.')

    if (result.ok) revalidateRegisters()
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete record'
    captureException(err, {
      action_type: 'DELETE_RECORD',
      entity_type: entityType,
      entity_id: entityId,
      outcome: 'failure',
      error: message,
      active_user_id: actingUser,
    })
    return { ok: false, error: message }
  }
}

async function deleteStrategy(strategyId: string, actingUser: string): Promise<DeleteRecordResult> {
  const row = await prisma.strategy.findUnique({
    where: { strategy_id: strategyId },
    select: {
      is_active: true,
      is_locked: true,
      record_status: true,
      master_trace_id: true,
      _count: {
        select: {
          demands: { where: { is_active: true } },
          budget_submissions: { where: { is_active: true } },
        },
      },
    },
  })
  if (!row || !row.is_active) return { ok: false, error: `Strategy not found: ${strategyId}` }
  if (row.is_locked) return fail('locked', 'This record is locked.')
  if (!isDraftStatus(row.record_status)) return fail('not_draft', 'Only draft records can be deleted.')
  if (row._count.demands > 0) return fail('linked_demand', 'Linked to a demand.')
  if (row._count.budget_submissions > 0) return fail('linked_budget', 'A budget exists for this record.')

  const projectCount = await prisma.projectRegistration.count({
    where: { strategy_id: strategyId, is_active: true },
  })
  if (projectCount > 0) return fail('linked_project', 'A project is registered.')

  const objectives = await prisma.strategicObjective.findMany({
    where: { strategy_id: strategyId },
    select: { objective_id: true },
  })
  const objectiveIds = objectives.map((o) => o.objective_id)
  const kpis = objectiveIds.length
    ? await prisma.kpiDefinition.findMany({
        where: { objective_id: { in: objectiveIds } },
        select: { kpi_id: true },
      })
    : []
  const kpiIds = kpis.map((k) => k.kpi_id)

  await prisma.$transaction(async (tx) => {
    if (kpiIds.length) {
      await tx.kpiPerformanceUpdate.updateMany({
        where: { kpi_id: { in: kpiIds } },
        data: { is_active: false, modified_by: actingUser },
      })
      await tx.kpiDefinition.updateMany({
        where: { kpi_id: { in: kpiIds } },
        data: { is_active: false, modified_by: actingUser },
      })
    }
    if (objectiveIds.length) {
      await tx.strategicObjective.updateMany({
        where: { objective_id: { in: objectiveIds } },
        data: { is_active: false, modified_by: actingUser },
      })
    }
    await tx.strategicTheme.updateMany({
      where: { strategy_id: strategyId },
      data: { is_active: false, modified_by: actingUser },
    })
    await tx.balancedScorecard.updateMany({
      where: { strategy_id: strategyId },
      data: { is_active: false, modified_by: actingUser },
    })
    await tx.strategy.update({
      where: { strategy_id: strategyId },
      data: { is_active: false, modified_by: actingUser },
    })
  })

  await deactivateOrphanTrace(row.master_trace_id)
  auditLog({
    action_type: 'DELETE_RECORD',
    entity_type: 'STRATEGY',
    entity_id: strategyId,
    master_trace_id: row.master_trace_id,
    active_user_id: actingUser,
    outcome: 'success',
  })
  return { ok: true }
}

async function deleteDemand(demandId: string, actingUser: string): Promise<DeleteRecordResult> {
  const row = await prisma.demand.findUnique({
    where: { demand_id: demandId },
    select: {
      is_active: true,
      is_locked: true,
      record_status: true,
      strategy_id: true,
      master_trace_id: true,
      _count: {
        select: {
          budget_lines: { where: { is_active: true } },
          procurement_items: { where: { is_active: true } },
          projects: { where: { is_active: true } },
        },
      },
    },
  })
  if (!row || !row.is_active) return { ok: false, error: `Demand not found: ${demandId}` }
  if (row.is_locked) return fail('locked', 'This record is locked.')
  if (!isDraftStatus(row.record_status)) return fail('not_draft', 'Only draft records can be deleted.')
  if (row.strategy_id) return fail('linked_strategy', 'Linked to a strategy.')
  if (row._count.budget_lines > 0) return fail('linked_budget', 'A budget exists for this record.')
  if (row._count.procurement_items > 0) return fail('linked_procurement', 'Procurement has started.')
  if (row._count.projects > 0) return fail('linked_project', 'A project is registered.')

  const linkedBudget = await prisma.budgetSubmission.findFirst({
    where: { parent_record_id: demandId, is_active: true },
    select: { budget_submission_id: true },
  })
  if (linkedBudget) return fail('linked_budget', 'A budget exists for this record.')

  await prisma.$transaction(async (tx) => {
    await tx.demandOption.updateMany({
      where: { demand_id: demandId },
      data: { is_active: false, modified_by: actingUser },
    })
    await tx.demandBenefit.updateMany({
      where: { demand_id: demandId },
      data: { is_active: false, modified_by: actingUser },
    })
    await tx.demandRaidc.updateMany({
      where: { demand_id: demandId },
      data: { is_active: false, modified_by: actingUser },
    })
    await tx.demand.update({
      where: { demand_id: demandId },
      data: { is_active: false, modified_by: actingUser },
    })
  })

  await deactivateOrphanTrace(row.master_trace_id)
  auditLog({
    action_type: 'DELETE_RECORD',
    entity_type: 'DEMAND',
    entity_id: demandId,
    master_trace_id: row.master_trace_id,
    active_user_id: actingUser,
    outcome: 'success',
  })
  return { ok: true }
}

async function deleteBudget(budgetId: string, actingUser: string): Promise<DeleteRecordResult> {
  const row = await prisma.budgetSubmission.findUnique({
    where: { budget_submission_id: budgetId },
    select: {
      is_active: true,
      is_locked: true,
      record_status: true,
      master_trace_id: true,
      budget_lines: {
        where: { is_active: true },
        select: { _count: { select: { procurement_items: { where: { is_active: true } } } } },
      },
    },
  })
  if (!row || !row.is_active) return { ok: false, error: `Budget not found: ${budgetId}` }
  if (row.is_locked) return fail('locked', 'This record is locked.')
  if (!isDraftStatus(row.record_status)) return fail('not_draft', 'Only draft records can be deleted.')
  if (row.budget_lines.some((line) => line._count.procurement_items > 0)) {
    return fail('linked_procurement', 'Procurement has started.')
  }

  await prisma.$transaction(async (tx) => {
    await tx.budgetConsolidation.updateMany({
      where: { budget_submission_id: budgetId },
      data: { is_active: false, modified_by: actingUser },
    })
    await tx.procurementPlan.updateMany({
      where: { budget_submission_id: budgetId },
      data: { is_active: false, modified_by: actingUser },
    })
    await tx.budgetLine.updateMany({
      where: { budget_submission_id: budgetId },
      data: { is_active: false, modified_by: actingUser },
    })
    await tx.budgetSubmission.update({
      where: { budget_submission_id: budgetId },
      data: { is_active: false, modified_by: actingUser },
    })
  })

  await deactivateOrphanTrace(row.master_trace_id)
  auditLog({
    action_type: 'DELETE_RECORD',
    entity_type: 'BUDGET_SUBMISSION',
    entity_id: budgetId,
    master_trace_id: row.master_trace_id,
    active_user_id: actingUser,
    outcome: 'success',
  })
  return { ok: true }
}

async function deleteProcurement(itemId: string, actingUser: string): Promise<DeleteRecordResult> {
  const row = await prisma.procurementItem.findUnique({
    where: { procurement_item_id: itemId },
    select: {
      is_active: true,
      is_locked: true,
      procurement_stage: true,
      master_trace_id: true,
      project_registration: { select: { project_id: true } },
    },
  })
  if (!row || !row.is_active) return { ok: false, error: `Procurement item not found: ${itemId}` }
  if (row.is_locked) return fail('locked', 'This record is locked.')
  if (row.project_registration) return fail('linked_project', 'A project is registered.')
  if (normalizeProcurementStage(row.procurement_stage) !== 'PLANNED') {
    return fail('not_planned', 'Procurement has moved past Planned.')
  }

  await prisma.procurementItem.update({
    where: { procurement_item_id: itemId },
    data: { is_active: false, modified_by: actingUser },
  })

  await deactivateOrphanTrace(row.master_trace_id)
  auditLog({
    action_type: 'DELETE_RECORD',
    entity_type: 'PROCUREMENT_ITEM',
    entity_id: itemId,
    master_trace_id: row.master_trace_id,
    active_user_id: actingUser,
    outcome: 'success',
  })
  return { ok: true }
}
