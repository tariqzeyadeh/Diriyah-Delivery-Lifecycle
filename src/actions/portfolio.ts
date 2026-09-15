'use server'

import { prisma } from '@/lib/prisma'
import { getServerRole, getServerPersonaEmail } from '@/src/lib/auth/server-guard'
import { firstDeleteBlock, isDraftStatus, type DeleteBlockCode } from '@/lib/atlas/record-delete'
import { normalizeProcurementStage } from '@/lib/atlas/procurement'

// G-21: Roles that see ALL business units (no row-level filter)
const GLOBAL_ROLES = ['Strategy & Governance', 'CTO Office', 'PMO'] as const

/**
 * Returns a Prisma `where` fragment to scope records to the caller's BU.
 * Global roles (Strategy & Governance, CTO Office, PMO) get no filter.
 * Business Owner / Commercial roles see only their own BU records.
 */
async function buScopeWhere(): Promise<{ owning_business_unit_id?: string } | undefined> {
  const role = await getServerRole()
  if (!role || GLOBAL_ROLES.includes(role as typeof GLOBAL_ROLES[number])) return undefined
  // BU is encoded as the domain prefix of the email in demo mode
  // e.g. ahmed.khalid@diriyah.sa → business_unit = 'ahmed.khalid'
  // In production this would come from the JWT claim 'business_unit_id'.
  // For the POC we use a stable mapping from persona email to BU.
  const email = await getServerPersonaEmail()
  if (!email) return undefined
  const buId = email.split('@')[0] // demo: persona id doubles as BU identifier
  return { owning_business_unit_id: buId }
}

// ─────────────────────────────────────────────────────────────────────────────
// listStrategies
// ─────────────────────────────────────────────────────────────────────────────

export type StrategyListItem = {
  strategy_id: string
  strategy_title: string
  record_status: string | null
  is_locked: boolean
  funding_envelope: number | null
  horizon_start_date: string | null
  horizon_end_date: string | null
  created_at: string
  master_trace_id: string
  objective_count: number
  canDelete: boolean
  deleteBlockedCode: DeleteBlockCode | null
}

export async function listStrategies(limit = 40): Promise<StrategyListItem[]> {
  const buScope = await buScopeWhere()
  const rows = await prisma.strategy.findMany({
    take: limit,
    where: { is_active: true, ...buScope },
    orderBy: { created_at: 'desc' },
    select: {
      strategy_id: true,
      strategy_title: true,
      record_status: true,
      is_locked: true,
      funding_envelope: true,
      horizon_start_date: true,
      horizon_end_date: true,
      created_at: true,
      master_trace_id: true,
      _count: {
        select: {
          objectives: true,
          demands: { where: { is_active: true } },
          budget_submissions: { where: { is_active: true } },
        },
      },
    },
  })

  return rows.map((r) => {
    const deleteBlockedCode = firstDeleteBlock([
      r.is_locked && 'locked',
      !isDraftStatus(r.record_status) && 'not_draft',
      r._count.demands > 0 && 'linked_demand',
      r._count.budget_submissions > 0 && 'linked_budget',
    ])
    return {
      strategy_id: r.strategy_id,
      strategy_title: r.strategy_title,
      record_status: r.record_status ?? null,
      is_locked: r.is_locked,
      funding_envelope: r.funding_envelope ? Number(r.funding_envelope) : null,
      horizon_start_date: r.horizon_start_date?.toISOString().slice(0, 10) ?? null,
      horizon_end_date: r.horizon_end_date?.toISOString().slice(0, 10) ?? null,
      created_at: r.created_at.toISOString().slice(0, 10),
      master_trace_id: r.master_trace_id,
      objective_count: r._count.objectives,
      canDelete: deleteBlockedCode == null,
      deleteBlockedCode,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// listDemands
// ─────────────────────────────────────────────────────────────────────────────

export type DemandListItem = {
  demand_id: string
  demand_title: string
  record_status: string | null
  is_locked: boolean
  entry_route: string
  urgency: string | null
  master_trace_id: string
  strategy_id: string | null
  created_at: string
  option_count: number
  canDelete: boolean
  deleteBlockedCode: DeleteBlockCode | null
}

export async function listDemandsForBudgetPicker(): Promise<DemandListItem[]> {
  return listDemands(500)
}

export async function listDemands(limit = 40): Promise<DemandListItem[]> {
  const buScope = await buScopeWhere()
  const rows = await prisma.demand.findMany({
    take: limit,
    where: { is_active: true, ...buScope },
    orderBy: { created_at: 'desc' },
    select: {
      demand_id: true,
      demand_title: true,
      record_status: true,
      is_locked: true,
      master_trace_id: true,
      strategy_id: true,
      urgency: true,
      created_at: true,
      master_trace: { select: { entry_route: true } },
      _count: {
        select: {
          options: true,
          budget_lines: { where: { is_active: true } },
          procurement_items: { where: { is_active: true } },
          projects: { where: { is_active: true } },
        },
      },
    },
  })

  const demandIds = rows.map((r) => r.demand_id)
  const linkedBudgets = demandIds.length
    ? await prisma.budgetSubmission.findMany({
        where: { is_active: true, parent_record_id: { in: demandIds } },
        select: { parent_record_id: true },
      })
    : []
  const demandIdsWithBudget = new Set(linkedBudgets.map((b) => b.parent_record_id))

  return rows.map((r) => {
    const hasBudget = r._count.budget_lines > 0 || demandIdsWithBudget.has(r.demand_id)
    const deleteBlockedCode = firstDeleteBlock([
      r.is_locked && 'locked',
      !isDraftStatus(r.record_status) && 'not_draft',
      Boolean(r.strategy_id) && 'linked_strategy',
      hasBudget && 'linked_budget',
      r._count.procurement_items > 0 && 'linked_procurement',
      r._count.projects > 0 && 'linked_project',
    ])
    return {
      demand_id: r.demand_id,
      demand_title: r.demand_title,
      record_status: r.record_status ?? null,
      is_locked: r.is_locked,
      entry_route: r.master_trace.entry_route,
      urgency: r.urgency ?? null,
      master_trace_id: r.master_trace_id,
      strategy_id: r.strategy_id ?? null,
      created_at: r.created_at.toISOString().slice(0, 10),
      option_count: r._count.options,
      canDelete: deleteBlockedCode == null,
      deleteBlockedCode,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// listBudgetSubmissions
// ─────────────────────────────────────────────────────────────────────────────

export type BudgetListItem = {
  budget_submission_id: string
  record_status: string | null
  is_locked: boolean
  total_requested_sar: number | null
  capex_total_sar: number | null
  opex_total_sar: number | null
  strategy_title: string | null
  master_trace_id: string
  created_at: string
  line_count: number
  canDelete: boolean
  deleteBlockedCode: DeleteBlockCode | null
}

export async function listBudgetSubmissions(limit = 40): Promise<BudgetListItem[]> {
  const buScope = await buScopeWhere()
  const rows = await prisma.budgetSubmission.findMany({
    take: limit,
    where: { is_active: true, ...buScope },
    orderBy: { created_at: 'desc' },
    select: {
      budget_submission_id: true,
      record_status: true,
      is_locked: true,
      total_requested_sar: true,
      capex_total_sar: true,
      opex_total_sar: true,
      master_trace_id: true,
      created_at: true,
      strategy: { select: { strategy_title: true } },
      _count: { select: { budget_lines: true } },
      budget_lines: {
        where: { is_active: true },
        select: { _count: { select: { procurement_items: { where: { is_active: true } } } } },
      },
    },
  })

  return rows.map((r) => {
    const hasProcurement = r.budget_lines.some((line) => line._count.procurement_items > 0)
    const deleteBlockedCode = firstDeleteBlock([
      r.is_locked && 'locked',
      !isDraftStatus(r.record_status) && 'not_draft',
      hasProcurement && 'linked_procurement',
    ])
    return {
      budget_submission_id: r.budget_submission_id,
      record_status: r.record_status ?? null,
      is_locked: r.is_locked,
      total_requested_sar: r.total_requested_sar ? Number(r.total_requested_sar) : null,
      capex_total_sar: r.capex_total_sar ? Number(r.capex_total_sar) : null,
      opex_total_sar: r.opex_total_sar ? Number(r.opex_total_sar) : null,
      strategy_title: r.strategy?.strategy_title ?? null,
      master_trace_id: r.master_trace_id,
      created_at: r.created_at.toISOString().slice(0, 10),
      line_count: r._count.budget_lines,
      canDelete: deleteBlockedCode == null,
      deleteBlockedCode,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// listProcurementItems
// ─────────────────────────────────────────────────────────────────────────────

export type ProcurementListItem = {
  procurement_item_id: string
  procurement_item_title: string
  procurement_stage: string | null
  planned_value_sar: number | null
  budget_submission_id: string | null
  master_trace_id: string
  created_at: string
  has_project: boolean
  canDelete: boolean
  deleteBlockedCode: DeleteBlockCode | null
}

export async function listProcurementItems(limit = 40): Promise<ProcurementListItem[]> {
  const buScope = await buScopeWhere()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await (prisma.procurementItem as any).findMany({
    take: limit,
    where: { is_active: true, ...buScope },
    orderBy: [{ created_at: 'desc' }, { procurement_item_id: 'desc' }],
    select: {
      procurement_item_id: true,
      procurement_item_title: true,
      procurement_stage: true,
      planned_value_sar: true,
      is_locked: true,
      // budget_submission_id is not a direct field — reach through budget_line relation
      budget_line: { select: { budget_submission_id: true } },
      master_trace_id: true,
      created_at: true,
      project_registration: { select: { project_id: true } },
    },
  })

  return rows
    .map((r) => {
      const hasProject = Boolean(r.project_registration)
      const planned = normalizeProcurementStage(r.procurement_stage) === 'PLANNED'
      const deleteBlockedCode = firstDeleteBlock([
        r.is_locked && 'locked',
        hasProject && 'linked_project',
        !planned && 'not_planned',
      ])
      return {
        procurement_item_id: r.procurement_item_id,
        procurement_item_title: r.procurement_item_title,
        procurement_stage: r.procurement_stage ?? null,
        planned_value_sar: r.planned_value_sar ? Number(r.planned_value_sar) : null,
        budget_submission_id: r.budget_line?.budget_submission_id ?? null,
        master_trace_id: r.master_trace_id,
        created_at: r.created_at.toISOString().slice(0, 10),
        has_project: hasProject,
        canDelete: deleteBlockedCode == null,
        deleteBlockedCode,
      }
    })
    .sort((a, b) => {
      const byDate = b.created_at.localeCompare(a.created_at)
      if (byDate !== 0) return byDate
      return b.procurement_item_id.localeCompare(a.procurement_item_id)
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// listProjectRegistrations
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectListItem = {
  project_id: string
  project_name: string
  record_status: string | null
  delivery_approach: string | null   // correct field name in schema
  planned_start_date: string | null
  planned_end_date: string | null    // correct field name in schema
  master_trace_id: string
  created_at: string
  canDelete: boolean
  deleteBlockedCode: DeleteBlockCode | null
}

export async function listProjectRegistrations(limit = 40): Promise<ProjectListItem[]> {
  const buScope = await buScopeWhere()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await (prisma.projectRegistration as any).findMany({
    take: limit,
    where: { is_active: true, ...buScope },
    orderBy: { created_at: 'desc' },
    select: {
      project_id: true,
      project_name: true,
      record_status: true,
      delivery_approach: true,       // was: delivery_method (doesn't exist)
      planned_start_date: true,
      planned_end_date: true,        // was: planned_finish_date (doesn't exist)
      master_trace_id: true,
      created_at: true,
    },
  })

  return rows.map((r) => ({
    project_id: r.project_id,
    project_name: r.project_name,
    record_status: r.record_status ?? null,
    delivery_approach: r.delivery_approach ?? null,
    planned_start_date: r.planned_start_date?.toISOString().slice(0, 10) ?? null,
    planned_end_date: r.planned_end_date?.toISOString().slice(0, 10) ?? null,
    master_trace_id: r.master_trace_id,
    created_at: r.created_at.toISOString().slice(0, 10),
    canDelete: false,
    deleteBlockedCode: 'registered' as const,
  }))
}
