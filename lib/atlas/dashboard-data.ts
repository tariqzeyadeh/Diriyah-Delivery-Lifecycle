import { DecisionEnum, type Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { withSpan } from '@/src/lib/otel'

function n(v: Prisma.Decimal | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  return typeof v === 'number' ? v : Number(v)
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

export function formatSar(amount: number): string {
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

/** Uncached Prisma aggregation — wrapped by getCockpitMetrics */
async function fetchCockpitMetrics() {
  return withSpan('calculate-portfolio-health', async (span) => {
    span.setAttribute('atlas.surface', 'pre-initiation-cockpit')
    const now = new Date()
    const soon = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  const [
    openMasterRecords,
    pendingApprovals,
    approvedBudgetSum,
    strategyTotal,
    strategyApproved,
    demandTotal,
    demandAdvanced,
    budgetTotal,
    budgetApproved,
    procurementTotal,
    procurementDelivered,
    projectTotal,
    projectRegistered,
    pendingTxns,
  ] = await Promise.all([
    prisma.masterTrace.count({ where: { is_active: true } }),
    prisma.approvalTransaction.count({ where: { decision: DecisionEnum.PENDING } }),
    prisma.budgetSubmission.aggregate({
      where: { record_status: 'APPROVED' },
      _sum: { capex_total_sar: true, opex_total_sar: true },
    }),
    prisma.strategy.count(),
    prisma.strategy.count({ where: { record_status: 'APPROVED' } }),
    prisma.demand.count(),
    prisma.demand.count({
      where: {
        record_status: { in: ['SUBMITTED', 'VALIDATED', 'INCLUDED', 'FUNDED', 'APPROVED'] },
      },
    }),
    prisma.budgetSubmission.count(),
    prisma.budgetSubmission.count({ where: { record_status: 'APPROVED' } }),
    prisma.procurementItem.count(),
    prisma.procurementItem.count({
      where: {
        OR: [
          { procurement_stage: 'DELIVERED' },
          { procurement_status: 'DELIVERED' },
          { procurement_stage: 'COMPLETED' },
        ],
      },
    }),
    prisma.projectRegistration.count(),
    prisma.projectRegistration.count({
      where: { record_status: { in: ['REGISTERED', 'APPROVED', 'ACTIVE'] } },
    }),
    prisma.approvalTransaction.findMany({
      where: { decision: DecisionEnum.PENDING },
      select: { is_overdue: true, sla_due_at: true },
    }),
  ])

  const totalApprovedBudget =
    n(approvedBudgetSum._sum.capex_total_sar) + n(approvedBudgetSum._sum.opex_total_sar)

  let withinSla = 0
  let dueSoon = 0
  let overdue = 0
  for (const t of pendingTxns) {
    if (t.is_overdue || t.sla_due_at < now) overdue += 1
    else if (t.sla_due_at <= soon) dueSoon += 1
    else withinSla += 1
  }
    if (pendingTxns.length === 0) {
      withinSla = 1
      dueSoon = 0
      overdue = 0
    }

    span.setAttribute('atlas.open_master_records', openMasterRecords)
    span.setAttribute('atlas.pending_approvals', pendingApprovals)
    span.setAttribute('atlas.total_approved_budget_sar', totalApprovedBudget)

    return {
      kpi: {
        openMasterRecords,
        pendingApprovals,
        totalApprovedBudget,
      },
      stageHealth: [
        {
          key: 'strategy',
          label: 'Strategy',
          total: strategyTotal,
          complete: strategyApproved,
          pct: pct(strategyApproved, strategyTotal),
        },
        {
          key: 'demand',
          label: 'Demand',
          total: demandTotal,
          complete: demandAdvanced,
          pct: pct(demandAdvanced, demandTotal),
        },
        {
          key: 'budget',
          label: 'Budget',
          total: budgetTotal,
          complete: budgetApproved,
          pct: pct(budgetApproved, budgetTotal),
        },
        {
          key: 'procurement',
          label: 'Procurement',
          total: procurementTotal,
          complete: procurementDelivered,
          pct: pct(procurementDelivered, procurementTotal),
        },
        {
          key: 'projects',
          label: 'Projects',
          total: projectTotal,
          complete: projectRegistered,
          pct: pct(projectRegistered, projectTotal),
        },
      ],
      sla: {
        withinSla,
        dueSoon,
        overdue,
        total: withinSla + dueSoon + overdue,
        empty: pendingTxns.length === 0,
      },
    }
  })
}

/** Pre-Initiation Cockpit — cached under `portfolio-metrics` */
export const getCockpitMetrics = unstable_cache(fetchCockpitMetrics, ['cockpit-metrics'], {
  tags: [CACHE_TAGS.PORTFOLIO_METRICS],
  revalidate: 300,
})

/** Full Master Trace spine for the Traceability Explorer */
export async function getTraceabilityTree(masterTraceId: string) {
  return prisma.masterTrace.findUnique({
    where: { master_trace_id: masterTraceId },
    include: {
      strategies: {
        orderBy: { created_at: 'asc' },
        include: {
          objectives: { select: { objective_id: true, objective_name: true, record_status: true } },
        },
      },
      demands: { orderBy: { created_at: 'asc' } },
      budget_submissions: {
        orderBy: { created_at: 'asc' },
        include: {
          budget_lines: {
            include: {
              procurement_items: {
                include: {
                  project_registration: true,
                },
              },
            },
          },
          procurement_plans: {
            include: {
              items: {
                include: { project_registration: true },
              },
            },
          },
        },
      },
      projects: { orderBy: { created_at: 'asc' } },
    },
  })
}

export type TraceabilityTree = NonNullable<Awaited<ReturnType<typeof getTraceabilityTree>>>

export async function listMasterTraceIds(limit = 20) {
  return prisma.masterTrace.findMany({
    where: { is_active: true },
    select: { master_trace_id: true, entry_route: true, created_at: true },
    orderBy: { created_at: 'desc' },
    take: limit,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for reporting period / data-as-of (BR-043)
// ─────────────────────────────────────────────────────────────────────────────

function deriveReportingPeriod(): string {
  const now = new Date()
  const q = Math.ceil((now.getMonth() + 1) / 3)
  return `${now.getFullYear()}-Q${q}`
}

/** Uncached one-pager aggregation — wrapped by getExecutiveOnePager */
async function fetchExecutiveOnePager() {
  return withSpan('calculate-portfolio-health', async (span) => {
    span.setAttribute('atlas.surface', 'executive-one-pager')

    // BR-043: capture data-as-of date at query time
    const dataAsOf = new Date()
    const reportingPeriod = deriveReportingPeriod()

    const [
      strategyInMotion,
      demandInMotion,
      budgetInMotion,
      procurementInMotion,
      projectsInMotion,
      objectivesTotal,
      objectivesAchieved,
      procurementCommitted,
      procurementPlanned,
      strategyBudgetUsed,
      strategyBudgetEnvelope,
      strategies,
    ] = await Promise.all([
    prisma.strategy.count({
      where: { record_status: { notIn: ['APPROVED', 'REJECTED', 'ARCHIVED'] } },
    }),
    prisma.demand.count({
      where: {
        record_status: {
          in: ['DRAFT', 'SUBMITTED', 'UNDER_VALIDATION', 'VALIDATED', 'CONDITIONAL', 'RETURNED'],
        },
      },
    }),
    prisma.budgetSubmission.count({
      where: { record_status: { in: ['DRAFT', 'CONSOLIDATING', 'SUBMITTED', 'RETURNED'] } },
    }),
    prisma.procurementItem.count({
      where: {
        OR: [
          {
            procurement_stage: {
              in: ['PLANNED', 'IN_SOURCING', 'AWARDED', 'RFX', 'PR_PREP', 'EVALUATION'],
            },
          },
          { procurement_stage: null },
        ],
      },
    }),
    prisma.projectRegistration.count({
      where: { record_status: { in: ['DRAFT', 'REGISTERED', 'PENDING'] } },
    }),
    prisma.strategicObjective.count(),
    prisma.strategicObjective.count({
      where: {
        OR: [
          { forecast_outcome_status: { in: ['ACHIEVED', 'ON_TRACK', 'COMPLETE'] } },
          { record_status: 'APPROVED' },
          { rag_status: 'GREEN' },
        ],
      },
    }),
    prisma.procurementItem.aggregate({
      _sum: { actual_commitment_sar: true },
    }),
    prisma.procurementItem.aggregate({
      _sum: { planned_value_sar: true, approved_budget_sar: true },
    }),
    prisma.budgetSubmission.aggregate({
      where: { record_status: 'APPROVED' },
      _sum: { total_approved_sar: true, capex_total_sar: true, opex_total_sar: true },
    }),
    prisma.strategy.aggregate({
      _sum: { funding_envelope: true },
    }),
    // BR-042: matrix uses only approved/validated entities for each strategy
    prisma.strategy.findMany({
      where: { record_status: { in: ['APPROVED', 'SUBMITTED'] }, is_active: true },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        demands: {
          where: {
            record_status: {
              in: ['VALIDATED', 'VALIDATED_COND', 'APPROVED', 'FUNDED', 'SUBMITTED', 'INCLUDED'],
            },
          },
          select: {
            demand_id: true,
            record_status: true,
          },
        },
        budget_submissions: {
          // BR-042: only include submitted or better budget submissions
          where: { record_status: { in: ['SUBMITTED', 'APPROVED'] } },
          select: {
            budget_submission_id: true,
            record_status: true,
            total_approved_sar: true,
            total_requested_sar: true,
            capex_total_sar: true,
            opex_total_sar: true,
            budget_lines: {
              select: {
                requested_total_sar: true,
                procurement_items: {
                  select: {
                    procurement_item_id: true,
                    actual_commitment_sar: true,
                    approved_budget_sar: true,
                    planned_value_sar: true,
                    procurement_stage: true,
                    project_registration: { select: { project_id: true } },
                  },
                },
              },
            },
          },
        },
        objectives: { select: { objective_id: true } },
      },
    }),
  ])

  const committed = n(procurementCommitted._sum.actual_commitment_sar)
  const plannedProc =
    n(procurementPlanned._sum.planned_value_sar) || n(procurementPlanned._sum.approved_budget_sar)
  const usedBudget =
    n(strategyBudgetUsed._sum.total_approved_sar) ||
    n(strategyBudgetUsed._sum.capex_total_sar) + n(strategyBudgetUsed._sum.opex_total_sar)
  const envelope = n(strategyBudgetEnvelope._sum.funding_envelope)

  const matrix = strategies.map((s) => {
    const demandsLinked = s.demands.length
    const demandsSubmitted = s.demands.filter((d) =>
      ['SUBMITTED', 'VALIDATED', 'INCLUDED', 'FUNDED', 'UNDER_VALIDATION'].includes(
        d.record_status || '',
      ),
    ).length

    const procItems = s.budget_submissions.flatMap((b) =>
      b.budget_lines.flatMap((l) => l.procurement_items),
    )
    const projectsRegistered = procItems.filter((p) => p.project_registration).length
    const projectsEligible = procItems.filter(
      (p) => (p.procurement_stage || '').toUpperCase() === 'DELIVERED',
    ).length

    const procActual = procItems.reduce((sum, p) => sum + n(p.actual_commitment_sar), 0)
    const procTotal = procItems.reduce(
      (sum, p) => sum + (n(p.approved_budget_sar) || n(p.planned_value_sar)),
      0,
    )

    const approvedBudgets = s.budget_submissions.filter((b) => b.record_status === 'APPROVED')
    const strategyApproved = s.record_status === 'APPROVED' ? 1 : 0
    const demandProgress = demandsLinked ? demandsSubmitted / demandsLinked : 0
    const budgetProgress = s.budget_submissions.length
      ? approvedBudgets.length / s.budget_submissions.length
      : 0
    const procProgress = procTotal > 0 ? procActual / procTotal : 0
    const overall =
      Math.round(((strategyApproved + demandProgress + budgetProgress + procProgress) / 4) * 1000) /
      10

    return {
      strategy_id: s.strategy_id,
      strategy_title: s.strategy_title,
      record_status: s.record_status,
      master_trace_id: s.master_trace_id,
      demands_linked: demandsLinked,
      demands_submitted: demandsSubmitted,
      projects_registered: projectsRegistered,
      projects_eligible: projectsEligible,
      procurement_actual: procActual,
      procurement_total: procTotal,
      overall_progress_pct: overall,
      objective_count: s.objectives.length,
    }
  })

  return {
    // BR-043: reporting period + data-as-of metadata
    reportingPeriod,
    dataAsOf,
    funnel: [
      { key: 'strategy', label: 'Develop Strategy', count: strategyInMotion },
      { key: 'demand', label: 'Demand', count: demandInMotion },
      { key: 'budget', label: 'Budget', count: budgetInMotion },
      { key: 'procurement', label: 'Procurement', count: procurementInMotion },
      { key: 'projects', label: 'Register Projects', count: projectsInMotion },
    ],
    scorecard: {
      objectivesAchieved,
      objectivesTotal,
      procurementCommitted: committed,
      procurementPlanned: plannedProc,
      strategyBudgetUsed: usedBudget,
      strategyBudgetEnvelope: envelope,
    },
    matrix,
  }
  })
}

/** Executive One-Pager — cached under portfolio-metrics + strategy-rollup */
export const getExecutiveOnePager = unstable_cache(
  fetchExecutiveOnePager,
  ['executive-one-pager'],
  {
    tags: [CACHE_TAGS.PORTFOLIO_METRICS, CACHE_TAGS.STRATEGY_ROLLUP],
    revalidate: 300,
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Financial Position  (G-35)
// ─────────────────────────────────────────────────────────────────────────────

export type FinancialPositionRow = {
  measure: string
  value: number
  pct: number
}

export async function fetchFinancialPosition(): Promise<FinancialPositionRow[]> {
  const [envelope, approved, committed, delivered] = await Promise.all([
    prisma.strategy.aggregate({ _sum: { funding_envelope: true } }),
    prisma.budgetSubmission.aggregate({
      where: { record_status: 'APPROVED' },
      _sum: { capex_total_sar: true, opex_total_sar: true },
    }),
    prisma.procurementItem.aggregate({ _sum: { actual_commitment_sar: true } }),
    prisma.procurementItem.aggregate({
      where: { OR: [{ procurement_stage: 'DELIVERED' }, { procurement_stage: 'COMPLETED' }] },
      _sum: { actual_commitment_sar: true },
    }),
  ])

  const envelopeVal = n(envelope._sum.funding_envelope)
  const approvedVal = n(approved._sum.capex_total_sar) + n(approved._sum.opex_total_sar)
  const committedVal = n(committed._sum.actual_commitment_sar)
  const deliveredVal = n(delivered._sum.actual_commitment_sar)
  const base = envelopeVal || 1

  return [
    { measure: 'Strategy envelope', value: envelopeVal, pct: 100 },
    { measure: 'Approved budget', value: approvedVal, pct: pct(approvedVal, base) },
    { measure: 'Committed procurement', value: committedVal, pct: pct(committedVal, base) },
    { measure: 'Delivered value', value: deliveredVal, pct: pct(deliveredVal, base) },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisions Required  (G-35)
// ─────────────────────────────────────────────────────────────────────────────

export type PendingDecision = {
  approval_transaction_id: string
  description: string
  sla_due_at: Date
  is_overdue: boolean
}

export async function fetchDecisionsRequired(limit = 3): Promise<PendingDecision[]> {
  const rows = await prisma.approvalTransaction.findMany({
    where: { decision: 'PENDING' },
    orderBy: { sla_due_at: 'asc' },
    take: limit,
    select: {
      approval_id: true,
      gate_code: true,
      entity_type: true,
      entity_id: true,
      decision_comments: true,
      sla_due_at: true,
      is_overdue: true,
    },
  })
  return rows.map((r) => ({
    approval_transaction_id: r.approval_id,
    description:
      r.decision_comments?.trim() ||
      `${r.gate_code} · ${r.entity_type} ${r.entity_id}`,
    sla_due_at: r.sla_due_at,
    is_overdue: Boolean(r.is_overdue),
  }))
}
