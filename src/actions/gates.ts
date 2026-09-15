'use server'

import { createHash, randomInt } from 'crypto'
import {
  DecisionEnum,
  type EntryRoute,
  ResolutionStatus,
  VirusScanStatus,
  type CommentType,
} from '@prisma/client'
import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'
import { withSpan } from '@/src/lib/otel'
import { requireGateRole } from '@/src/lib/auth/server-guard'
import {
  PROCUREMENT_BOARD_COLUMNS,
  PROCUREMENT_STAGE_PROGRESS,
  isPmoReadyStage,
  isValidProcurementTransition,
  type ProcurementBoardColumn,
} from '@/lib/atlas/procurement'

function revalidatePortfolioDashboards() {
  // Next.js 16: second arg is the stale-while-revalidate profile
  revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
  revalidateTag(CACHE_TAGS.STRATEGY_ROLLUP, 'max')
}

function revalidateProcurementPages(budgetSubmissionId?: string | null) {
  for (const locale of ['en', 'ar'] as const) {
    revalidatePath(`/${locale}/procurement`)
    if (!budgetSubmissionId) continue
    const id = encodeURIComponent(budgetSubmissionId)
    revalidatePath(`/${locale}/procurement/${id}`)
    revalidatePath(`/${locale}/procurement/${id}/board`)
    revalidatePath(`/${locale}/procurement/${id}/plan`)
  }
}

export type ApproveStrategyGatePayload = {
  strategy_id: string
  master_trace_id: string
  /** Actor for SHR created_by. Defaults to system. */
  created_by?: string
  /** Gate decision: APPROVED (default) or APPROVED_COND (approved with conditions). */
  decision?: 'APPROVED' | 'APPROVED_COND'
  /** Required when decision = APPROVED_COND (BR-012). */
  conditions?: string
}

export type ApproveStrategyGateResult =
  | {
      ok: true
      strategy_id: string
      master_trace_id: string
      demand_id: string
      budget_submission_id: string
    }
  | {
      ok: false
      error: string
    }

export type ApproveWithConditionsPayload = {
  entity_type: 'STRATEGY' | 'BUDGET_SUBMISSION'
  entity_id: string
  master_trace_id: string
  approver_user_id: string
  /** Mandatory for APPROVED_WITH_CONDITIONS (BR-012) */
  conditions: string
}

export type ApproveBudgetGatePayload = {
  /** Alias for budget_submission_id */
  budget_id: string
  master_trace_id: string
  approver_user_id: string
  /** Gate decision: APPROVED (default) or APPROVED_COND (approved with conditions). */
  decision?: 'APPROVED' | 'APPROVED_COND'
  /** Required when decision = APPROVED_COND (BR-012). */
  conditions?: string
}

export type ApproveBudgetGateResult =
  | {
      ok: true
      budget_submission_id: string
      master_trace_id: string
      consolidation_id: string
      approval_id: string
      version_hash: string
    }
  | {
      ok: false
      error: string
    }

export type ReturnGatePayload = {
  entity_type: 'STRATEGY' | 'BUDGET_SUBMISSION'
  entity_id: string
  master_trace_id: string
  gate_code: 'G-S1' | 'G-B1'
  return_comment: string
  returned_by: string
}

export type ReturnGateResult =
  | { ok: true; entity_id: string; approval_id: string }
  | { ok: false; error: string }

function yearToken(d = new Date()): number {
  return d.getFullYear()
}

function generateId(prefix: string): string {
  const suffix = String(randomInt(1000, 10000))
  return `${prefix}-${yearToken()}-${suffix}`
}

function versionHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

/**
 * CTO Gate 1 — Strategy Approval handoff.
 * Approves Strategy, then auto-instantiates Demand + BudgetSubmission (DRAFT)
 * on the same MasterTrace for Business / Commercial teams.
 */
export async function approveStrategyGate(
  payload: ApproveStrategyGatePayload,
): Promise<ApproveStrategyGateResult> {
  // RBAC: only CTO Office can approve strategy gate G-S1
  const rbac = await requireGateRole('G-S1')
  if (rbac) return rbac

  const strategy_id = payload.strategy_id?.trim()
  const master_trace_id = payload.master_trace_id?.trim()
  const created_by = (payload.created_by?.trim() || 'system').slice(0, 128)

  if (!strategy_id || !master_trace_id) {
    return { ok: false, error: 'strategy_id and master_trace_id are required.' }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const strategy = await tx.strategy.findUnique({
        where: { strategy_id },
      })

      if (!strategy) {
        throw new Error(`Strategy not found: ${strategy_id}`)
      }
      if (strategy.master_trace_id !== master_trace_id) {
        throw new Error('strategy_id does not belong to the provided master_trace_id.')
      }
      if (strategy.record_status === 'APPROVED') {
        throw new Error('Strategy is already APPROVED.')
      }

      const master = await tx.masterTrace.findUnique({
        where: { master_trace_id },
      })
      if (!master) {
        throw new Error(`MasterTrace not found: ${master_trace_id}`)
      }

      const entry_route = master.entry_route

      // G-03/G-02: support APPROVED_COND gate decision
      const gateDecision = payload.decision ?? 'APPROVED'
      if (gateDecision === 'APPROVED_COND' && !payload.conditions?.trim()) {
        throw Object.assign(
          new Error('BR-012: Conditions text is required when approving with conditions.'),
          { code: 'BR-012' },
        )
      }

      const now = new Date()
      await tx.strategy.update({
        where: { strategy_id },
        data: {
          record_status: 'APPROVED',
          approval_status: gateDecision === 'APPROVED_COND' ? 'APPROVED_COND' : 'APPROVED',
          is_locked: true,
          modified_by: created_by,
        },
      })

      // G-28 + G-03: Create ApprovalTransaction for G-S1 (strategy gate approval)
      const approval_id = generateId('APR')
      const g1Hash = versionHash({
        strategy_id,
        version_number: strategy.version_number ?? 1,
        strategy_title: strategy.strategy_title,
        submitted_at: now.toISOString(),
      })
      await tx.approvalTransaction.create({
        data: {
          approval_id,
          entity_type: 'STRATEGY',
          entity_id: strategy_id,
          entity_version: strategy.version_number ?? 1,
          version_number: strategy.version_number ?? 1,
          version_hash: g1Hash,
          gate_code: 'G-S1',
          approval_sequence: 1,
          approver_role: 'CTO',
          approver_user_id: created_by,
          authority_basis: 'CTO Strategy Gate Policy',
          assigned_at: now,
          sla_due_at: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          decision_at: now,
          decision: gateDecision === 'APPROVED_COND' ? DecisionEnum.APPROVED_COND : DecisionEnum.APPROVED,
          decision_comments: gateDecision === 'APPROVED_COND'
            ? (payload.conditions?.trim() ?? 'Strategy approved with conditions at CTO Gate G-S1.')
            : 'Strategy approved at CTO Gate G-S1.',
          approval_conditions: gateDecision === 'APPROVED_COND'
            ? { text: payload.conditions?.trim() }
            : undefined,
          lock_release_action: 'RELEASE_FOR_NEXT_STAGE',
          notification_status: 'PENDING',
          created_by,
          master_trace_id,
          is_locked: true,
        },
      })

      const demand_id = generateId('DEM')
      await tx.demand.create({
        data: {
          demand_id,
          master_trace_id,
          strategy_id,
          demand_title: `${strategy.strategy_title} — Demand Case`,
          entity_type: 'DEMAND',
          entry_route,
          record_status: 'DRAFT',
          parent_record_id: strategy_id,
          is_locked: false,
          created_by,
          version_number: 1,
        },
      })

      const budget_submission_id = generateId('BUD')
      await tx.budgetSubmission.create({
        data: {
          budget_submission_id,
          master_trace_id,
          strategy_id,
          entity_type: 'BUDGET_SUBMISSION',
          entry_route,
          record_status: 'DRAFT',
          parent_record_id: strategy_id,
          budget_cycle: 'Annual Plan',
          budget_scenario: 'Requested',
          base_currency: 'SAR',
          is_locked: false,
          created_by,
          version_number: 1,
        },
      })

      return {
        strategy_id,
        master_trace_id,
        demand_id,
        budget_submission_id,
      }
    })

    revalidatePortfolioDashboards()
    auditLog({
      action_type: 'APPROVE_STRATEGY_GATE',
      master_trace_id,
      active_user_id: created_by,
      entity_type: 'STRATEGY',
      entity_id: strategy_id,
      outcome: 'success',
      demand_id: result.demand_id,
      budget_submission_id: result.budget_submission_id,
    })

    return { ok: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to approve strategy gate'
    captureException(err, {
      action_type: 'APPROVE_STRATEGY_GATE',
      master_trace_id,
      active_user_id: created_by,
      entity_type: 'STRATEGY',
      entity_id: strategy_id,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

/**
 * CTO Gate 2 — Budget Approval.
 * BR-027: blocks if unresolved findings exist.
 * BR-008: writes ApprovalTransaction with version_hash.
 * Snapshots BudgetConsolidation at approval moment.
 */
export async function approveBudgetGate(
  payload: ApproveBudgetGatePayload,
): Promise<ApproveBudgetGateResult> {
  // RBAC: only CTO Office can approve budget gate G-B1
  const rbac = await requireGateRole('G-B1')
  if (rbac) return rbac

  const budget_submission_id = payload.budget_id?.trim()
  const master_trace_id = payload.master_trace_id?.trim()
  const approver_user_id = (payload.approver_user_id?.trim() || '').slice(0, 128)

  if (!budget_submission_id || !master_trace_id || !approver_user_id) {
    return {
      ok: false,
      error: 'budget_id, master_trace_id, and approver_user_id are required.',
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const budget = await tx.budgetSubmission.findUnique({
        where: { budget_submission_id },
        include: {
          budget_lines: {
            select: {
              budget_line_id: true,
              demand_id: true,
              line_description: true,
              cost_classification: true,
              cost_category: true,
              requested_total_sar: true,
            },
          },
          consolidation: true,
        },
      })

      if (!budget) {
        throw new Error(`BudgetSubmission not found: ${budget_submission_id}`)
      }
      if (budget.master_trace_id !== master_trace_id) {
        throw new Error('budget_id does not belong to the provided master_trace_id.')
      }
      if (budget.record_status === 'APPROVED') {
        throw new Error('BudgetSubmission is already APPROVED.')
      }

      // BR-027 — only validation findings block funding (not discussion / return notes)
      const unresolved = await tx.comment.count({
        where: {
          master_trace_id,
          comment_type: 'VALIDATION_FINDING',
          resolution_status: {
            in: [ResolutionStatus.OPEN, ResolutionStatus.RESPONDED, ResolutionStatus.REOPENED],
          },
        },
      })

      if (unresolved > 0) {
        throw new Error(
          `BR-027: ${unresolved} unresolved comment(s)/finding(s) must be resolved before budget approval.`,
        )
      }

      // G-03/G-02: support APPROVED_COND gate decision
      const budgetGateDecision = payload.decision ?? 'APPROVED'
      if (budgetGateDecision === 'APPROVED_COND' && !payload.conditions?.trim()) {
        throw Object.assign(
          new Error('BR-012: Conditions text is required when approving with conditions.'),
          { code: 'BR-012' },
        )
      }

      const now = new Date()
      const hashPayload = {
        budget_submission_id,
        master_trace_id,
        version_number: budget.version_number,
        total_requested_sar: budget.total_requested_sar?.toString() ?? null,
        total_validated_sar: budget.total_validated_sar?.toString() ?? null,
        capex_total_sar: budget.capex_total_sar?.toString() ?? null,
        opex_total_sar: budget.opex_total_sar?.toString() ?? null,
        line_count: budget.budget_lines.length,
        approved_at: now.toISOString(),
      }
      const version_hash = versionHash(hashPayload)

      await tx.budgetSubmission.update({
        where: { budget_submission_id },
        data: {
          record_status: 'APPROVED',
          approval_status: budgetGateDecision === 'APPROVED_COND' ? 'APPROVED_COND' : 'APPROVED',
          approval_conditions: budgetGateDecision === 'APPROVED_COND'
            ? payload.conditions?.trim()
            : undefined,
          is_locked: true,
          modified_by: approver_user_id,
          baseline_effective_date: now,
        },
      })

      const includedDemandIds = new Set(budget.budget_lines.map((l) => l.demand_id).filter(Boolean))

      const consolidation_id = await withSpan('calculate-budget-consolidation', async (span) => {
        span.setAttribute('atlas.budget_submission_id', budget_submission_id)
        span.setAttribute('atlas.line_count', budget.budget_lines.length)

        const nextConsolidationId = budget.consolidation?.consolidation_id ?? generateId('CON')
        const funding_ceiling = Number(budget.funding_ceiling_sar ?? 0)
        const total_requested = Number(budget.total_requested_sar ?? 0)
        const funding_gap = Number(budget.funding_gap_sar ?? total_requested - funding_ceiling)
        const capex = Number(budget.capex_total_sar ?? 0)
        const opex = Number(budget.opex_total_sar ?? 0)
        const strategic = Number(budget.strategic_total_sar ?? 0)
        const adhoc = Number(budget.adhoc_total_sar ?? 0)

        const consolidationData = {
          consolidation_id: nextConsolidationId,
          budget_submission_id,
          included_business_units: budget.owning_business_unit_id
            ? [budget.owning_business_unit_id]
            : [],
          included_demand_count: includedDemandIds.size,
          excluded_demand_count: 0,
          funding_ceiling_sar: funding_ceiling,
          funding_gap_sar: funding_gap,
          strategic_adhoc_mix: {
            strategic_total_sar: strategic,
            adhoc_total_sar: adhoc,
            total_requested_sar: total_requested,
            total_validated_sar: Number(budget.total_validated_sar ?? 0),
          },
          capex_opex_mix: {
            capex_total_sar: capex,
            opex_total_sar: opex,
          },
          demand_line_reconciliation: budget.demand_reconciliation_status ?? 'Pass',
        }

        // Approval-time stamp fields (CON-022–025)
        const approvalStamp = {
          record_status: 'APPROVED',
          approval_status: 'APPROVED' as const,
          cto_decision: 'APPROVED',
          is_locked: true,
          modified_by: approver_user_id,
        }

        if (budget.consolidation) {
          // Preserve CON-018–021 (narrative + decision items + risks + conditions)
          await tx.budgetConsolidation.update({
            where: { budget_submission_id },
            data: {
              included_business_units: consolidationData.included_business_units,
              included_demand_count: consolidationData.included_demand_count,
              excluded_demand_count: consolidationData.excluded_demand_count,
              funding_ceiling_sar: consolidationData.funding_ceiling_sar,
              funding_gap_sar: consolidationData.funding_gap_sar,
              strategic_adhoc_mix: consolidationData.strategic_adhoc_mix,
              capex_opex_mix: consolidationData.capex_opex_mix,
              demand_line_reconciliation: consolidationData.demand_line_reconciliation,
              ...approvalStamp,
            },
          })
        } else {
          await tx.budgetConsolidation.create({
            data: {
              ...consolidationData,
              master_trace_id,
              entry_route: budget.entry_route,
              ...approvalStamp,
            },
          })
        }

        return nextConsolidationId
      })

      // ── Procurement Plan + Items ────────────────────────────────────────────
      // Create one ProcurementPlan per approved BudgetSubmission, then one
      // ProcurementItem per BudgetLine so they appear on the Kanban board.
      const procurement_plan_id = generateId('PRP')
      await tx.procurementPlan.create({
        data: {
          procurement_plan_id,
          procurement_plan_title: `Procurement Plan — ${budget_submission_id}`,
          budget_submission_id,
          master_trace_id,
          strategy_id: budget.strategy_id ?? undefined,
          entity_type: 'PROCUREMENT_PLAN',
          entry_route: budget.entry_route,
          record_status: 'DRAFT',
          approved_funding_available_sar: budget.total_requested_sar ?? 0,
          planned_procurement_value_sar: budget.total_requested_sar ?? 0,
          procurement_item_count: budget.budget_lines.length,
          release_authorization_status: 'APPROVED',
          created_by: approver_user_id,
          version_number: 1,
        },
      })

      // Create one ProcurementItem per BudgetLine
      for (const line of budget.budget_lines) {
        const procurement_item_id = generateId('PIT')
        await tx.procurementItem.create({
          data: {
            procurement_item_id,
            procurement_plan_id,
            budget_line_id: line.budget_line_id,
            demand_id: line.demand_id ?? undefined,
            procurement_item_title:
              line.line_description ?? `Budget Line ${line.budget_line_id}`,
            master_trace_id,
            entity_type: 'PROCUREMENT_ITEM',
            entry_route: budget.entry_route,
            procurement_stage: 'PLANNED',
            procurement_status: 'PLANNED',
            approved_budget_sar: line.requested_total_sar ?? 0,
            planned_value_sar: line.requested_total_sar ?? 0,
            procurement_item_type: line.cost_classification ?? 'SERVICES',
            procurement_category: line.cost_category ?? undefined,
            project_registration_required: true,
            record_status: 'DRAFT',
            created_by: approver_user_id,
            version_number: 1,
          },
        })
      }

      const approval_id = generateId('APR')
      const slaDue = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      await tx.approvalTransaction.create({
        data: {
          approval_id,
          entity_type: 'BUDGET_SUBMISSION',
          entity_id: budget_submission_id,
          entity_version: budget.version_number,
          version_number: budget.version_number,
          version_hash,
          gate_code: 'G-B1',
          approval_sequence: 1,
          approver_role: 'CTO',
          approver_user_id,
          authority_basis: 'CTO Budget Gate Policy',
          assigned_at: now,
          sla_due_at: slaDue,
          decision_at: now,
          decision: budgetGateDecision === 'APPROVED_COND' ? DecisionEnum.APPROVED_COND : DecisionEnum.APPROVED,
          decision_comments: budgetGateDecision === 'APPROVED_COND'
            ? (payload.conditions?.trim() ?? 'Budget approved with conditions at CTO Gate G-B1.')
            : 'Budget approved at CTO Gate 2.',
          approval_conditions: budgetGateDecision === 'APPROVED_COND'
            ? { text: payload.conditions?.trim() }
            : undefined,
          lock_release_action: 'RELEASE_FOR_NEXT_STAGE',
          notification_status: 'PENDING',
          created_by: approver_user_id,
          master_trace_id,
          is_locked: true,
        },
      })

      return {
        budget_submission_id,
        master_trace_id,
        consolidation_id,
        approval_id,
        version_hash,
        procurement_plan_id,
        procurement_item_count: budget.budget_lines.length,
      }
    })

    revalidatePortfolioDashboards()
    auditLog({
      action_type: 'APPROVE_BUDGET_GATE',
      master_trace_id,
      active_user_id: approver_user_id,
      entity_type: 'BUDGET_SUBMISSION',
      entity_id: budget_submission_id,
      outcome: 'success',
      consolidation_id: result.consolidation_id,
      approval_id: result.approval_id,
    })

    return { ok: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to approve budget gate'
    captureException(err, {
      action_type: 'APPROVE_BUDGET_GATE',
      master_trace_id,
      active_user_id: approver_user_id,
      entity_type: 'BUDGET_SUBMISSION',
      entity_id: budget_submission_id,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

const BOARD_PROGRESS = PROCUREMENT_STAGE_PROGRESS

export async function recordProcurementStageMove(payload: {
  procurement_item_id: string
  previous_stage: string
  new_stage: string
  forecast_final_value_sar?: number
}) {
  const procurement_item_id = payload.procurement_item_id?.trim()
  const previous_stage = payload.previous_stage?.trim()
  const new_stage = payload.new_stage?.trim()

  if (!procurement_item_id || !previous_stage || !new_stage) {
    return {
      ok: false as const,
      error: 'procurement_item_id, previous_stage, and new_stage are required.',
    }
  }

  if (!(PROCUREMENT_BOARD_COLUMNS as readonly string[]).includes(new_stage)) {
    return { ok: false as const, error: `Invalid new_stage: ${new_stage}` }
  }

  if (!isValidProcurementTransition(previous_stage, new_stage)) {
    return {
      ok: false as const,
      error: 'BR-032: Stage moves must be one step forward or back (or Cancel).',
    }
  }

  try {
    const item = await prisma.procurementItem.findUnique({
      where: { procurement_item_id },
      include: { plan: { select: { budget_submission_id: true } } },
    })
    if (!item) {
      return {
        ok: false as const,
        error: 'Procurement item was not found. Refresh the board and try again.',
      }
    }

    const forecast =
      payload.forecast_final_value_sar ??
      Number(item.planned_value_sar ?? item.approved_budget_sar ?? 0)

    // BR-030: forecast must not exceed approved budget for the item
    const approvedBudget = Number(item.approved_budget_sar ?? 0)
    if (approvedBudget > 0 && forecast > approvedBudget * 1.05) {
      // Allow 5% tolerance; hard block at >105%
      return {
        ok: false as const,
        error: `BR-030: Forecast value (SAR ${forecast.toLocaleString()}) exceeds approved budget (SAR ${approvedBudget.toLocaleString()}) by more than 5%. Raise a budget amendment before proceeding.`,
        code: 'BR-030',
      }
    }

    const update_id = generateId('UPD')
    await prisma.$transaction(async (tx) => {
      await tx.procurementStatusUpdate.create({
        data: {
          update_id,
          procurement_item_id,
          previous_stage,
          new_stage,
          overall_status: new_stage === 'CANCELLED' ? 'Cancelled' : 'On Track',
          milestone_code: new_stage,
          progress_pct: BOARD_PROGRESS[new_stage as ProcurementBoardColumn] ?? 0,
          forecast_final_value_sar: forecast,
          update_validation_status: 'Validated',
          actual_milestone_date: new Date(),
          exception_reason: new_stage === 'CANCELLED' ? 'Cancelled from procurement board' : undefined,
          master_trace_id: item.master_trace_id,
          entry_route: item.entry_route,
        },
      })

      // Determine if this stage move makes the item PMO-ready
      const pmoReady = isPmoReadyStage(new_stage)

      await tx.procurementItem.update({
        where: { procurement_item_id },
        data: {
          procurement_stage: new_stage,
          procurement_status: new_stage,
          procurement_progress_pct: BOARD_PROGRESS[new_stage as ProcurementBoardColumn] ?? 0,
          ...(pmoReady ? { pmo_handoff_readiness: 'READY' } : {}),
        },
      })

      // BR-034: Auto-set SENT when readiness becomes READY and project_registration_required
      if (pmoReady && item.project_registration_required) {
        await tx.procurementItem.update({
          where: { procurement_item_id },
          data: { pmo_handoff_readiness: 'SENT', modified_by: 'system' },
        })
      }
    })

    // BR-034 audit log (outside transaction — fire-and-forget)
    if (isPmoReadyStage(new_stage) && item.project_registration_required) {
      auditLog({
        action_type: 'PMO_HANDOFF_TRIGGERED',
        entity_type: 'PROCUREMENT_ITEM',
        entity_id: procurement_item_id,
        active_user_id: 'system',
        outcome: 'success',
        note: 'BR-034: PMO handoff auto-triggered on READY status',
      })
    }

    auditLog({
      action_type: 'PROCUREMENT_STAGE_MOVE',
      master_trace_id: item.master_trace_id,
      active_user_id: 'system',
      entity_type: 'PROCUREMENT_ITEM',
      entity_id: procurement_item_id,
      outcome: 'success',
      previous_stage,
      new_stage,
    })

    revalidatePortfolioDashboards()
    revalidateProcurementPages(item.plan?.budget_submission_id)

    return { ok: true as const, update_id, new_stage }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record procurement stage move'
    captureException(err, {
      action_type: 'PROCUREMENT_STAGE_MOVE',
      entity_id: procurement_item_id,
      outcome: 'failure',
      error: message,
    })
    return { ok: false as const, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BR-030: Update actual commitment — blocks if it exceeds approved budget
// ─────────────────────────────────────────────────────────────────────────────

export async function updateActualCommitment(payload: {
  procurement_item_id: string
  actual_commitment_sar: number
  updated_by?: string
}): Promise<{ ok: true; procurement_item_id: string } | { ok: false; error: string; code?: string }> {
  const procurement_item_id = payload.procurement_item_id?.trim()
  if (!procurement_item_id) return { ok: false, error: 'procurement_item_id is required.' }

  const commitment = Number(payload.actual_commitment_sar)
  if (isNaN(commitment) || commitment < 0) {
    return { ok: false, error: 'actual_commitment_sar must be a non-negative number.' }
  }

  try {
    const item = await prisma.procurementItem.findUnique({
      where: { procurement_item_id },
      select: { approved_budget_sar: true, procurement_item_title: true, master_trace_id: true },
    })
    if (!item) return { ok: false, error: `Procurement item not found: ${procurement_item_id}` }

    // BR-030: hard block if actual commitment > approved budget
    const approvedBudget = Number(item.approved_budget_sar ?? 0)
    if (approvedBudget > 0 && commitment > approvedBudget) {
      return {
        ok: false,
        error: `BR-030: Actual commitment (SAR ${commitment.toLocaleString()}) exceeds the approved budget ceiling (SAR ${approvedBudget.toLocaleString()}) for item "${item.procurement_item_title}". Raise a budget amendment first.`,
        code: 'BR-030',
      }
    }

    await prisma.procurementItem.update({
      where: { procurement_item_id },
      data: {
        actual_commitment_sar: commitment,
        modified_by: (payload.updated_by ?? 'system').slice(0, 128),
      },
    })

    revalidatePortfolioDashboards()
    auditLog({
      action_type: 'UPDATE_ACTUAL_COMMITMENT',
      entity_type: 'PROCUREMENT_ITEM',
      entity_id: procurement_item_id,
      master_trace_id: item.master_trace_id,
      active_user_id: payload.updated_by ?? 'system',
      outcome: 'success',
      actual_commitment_sar: commitment,
    })

    return { ok: true, procurement_item_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update commitment'
    captureException(err, {
      action_type: 'UPDATE_ACTUAL_COMMITMENT',
      entity_id: procurement_item_id,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

export async function getProcurementBoard(budgetSubmissionId: string) {
  const submission = await prisma.budgetSubmission.findUnique({
    where: { budget_submission_id: budgetSubmissionId },
    include: {
      master_trace: true,
      procurement_plans: {
        include: {
          items: {
            include: {
              status_updates: { orderBy: { update_id: 'desc' }, take: 1 },
            },
            orderBy: { created_at: 'desc' },
          },
        },
      },
      budget_lines: {
        include: {
          procurement_items: {
            include: {
              status_updates: { orderBy: { update_id: 'desc' }, take: 1 },
            },
            orderBy: { created_at: 'desc' },
          },
        },
      },
    },
  })

  if (!submission) return null

  const gb1Approval = await prisma.approvalTransaction.findFirst({
    where: {
      entity_id: budgetSubmissionId,
      gate_code: 'G-B1',
      decision: { in: [DecisionEnum.APPROVED, DecisionEnum.APPROVED_COND] },
    },
    select: { approval_id: true },
  })

  const byId = new Map<
    string,
    {
      procurement_item_id: string
      procurement_item_title: string
      procurement_stage: string | null
      planned_value_sar: number
      approved_budget_sar: number
      actual_commitment_sar: number | null
      vendor_id: string | null
      pmo_handoff_readiness: string | null
      schedule_variance_days: number | null
      created_at: string
    }
  >()

  for (const plan of submission.procurement_plans) {
    for (const item of plan.items) {
      byId.set(item.procurement_item_id, {
        procurement_item_id: item.procurement_item_id,
        procurement_item_title: item.procurement_item_title,
        procurement_stage: item.procurement_stage,
        planned_value_sar: Number(item.planned_value_sar ?? 0),
        approved_budget_sar: Number(item.approved_budget_sar ?? 0),
        actual_commitment_sar: item.actual_commitment_sar != null ? Number(item.actual_commitment_sar) : null,
        vendor_id: item.vendor_id,
        pmo_handoff_readiness: item.pmo_handoff_readiness ?? null,
        schedule_variance_days: item.schedule_variance_days ?? null,
        created_at: item.created_at.toISOString(),
      })
    }
  }
  for (const line of submission.budget_lines) {
    for (const item of line.procurement_items) {
      byId.set(item.procurement_item_id, {
        procurement_item_id: item.procurement_item_id,
        procurement_item_title: item.procurement_item_title,
        procurement_stage: item.procurement_stage,
        planned_value_sar: Number(item.planned_value_sar ?? 0),
        approved_budget_sar: Number(item.approved_budget_sar ?? 0),
        actual_commitment_sar: item.actual_commitment_sar != null ? Number(item.actual_commitment_sar) : null,
        vendor_id: item.vendor_id,
        pmo_handoff_readiness: item.pmo_handoff_readiness ?? null,
        schedule_variance_days: item.schedule_variance_days ?? null,
        created_at: item.created_at.toISOString(),
      })
    }
  }

  return {
    submission: {
      budget_submission_id: submission.budget_submission_id,
      master_trace_id: submission.master_trace_id,
      record_status: submission.record_status,
      g_b1_already_approved:
        submission.record_status === 'APPROVED' || Boolean(gb1Approval),
    },
    items: Array.from(byId.values()).sort((a, b) => {
      const byDate = b.created_at.localeCompare(a.created_at)
      if (byDate !== 0) return byDate
      return b.procurement_item_id.localeCompare(a.procurement_item_id)
    }),
  }
}

export async function getPmoHandoff(procurementItemId: string) {
  const item = await prisma.procurementItem.findUnique({
    where: { procurement_item_id: procurementItemId },
    include: {
      project_registration: true,
      master_trace: true,
      demand: { select: { demand_id: true, demand_title: true, record_status: true } },
      plan: {
        select: {
          budget_submission_id: true,
          budget_submission: {
            select: { record_status: true },
          },
        },
      },
    },
  })
  if (!item) return null

  // BR-035: Compute derived readiness checks (G-39)
  const check_approved_demand =
    item.demand?.record_status === 'VALIDATED' ||
    item.demand?.record_status === 'VALIDATED_COND'
  const check_approved_budget = item.plan?.budget_submission?.record_status === 'APPROVED'
  const check_procurement_complete =
    item.procurement_stage === 'ACCEPTANCE' || item.procurement_stage === 'COMPLETED'
  const check_document_pack = await prisma.attachment.count({
    where: { master_trace_id: item.master_trace_id ?? undefined },
  }).then((n) => n > 0)

  // Attach derived readiness to a mutable copy so TypeScript retains all include types
  const result = item as typeof item & {
    derived_readiness: {
      check_approved_demand: boolean
      check_approved_budget: boolean
      check_procurement_complete: boolean
      check_document_pack: boolean
    }
  }
  result.derived_readiness = {
    check_approved_demand,
    check_approved_budget,
    check_procurement_complete,
    check_document_pack,
  }
  return result
}

export async function activateProjectRegistration(payload: {
  procurement_item_id: string
  project_name: string
  project_manager_id: string
  delivery_approach: string
  planned_start: string
  planned_finish: string
  project_type?: string
  project_category?: string
  complexity_rating?: string
  project_priority?: string
  project_sponsor_user_id?: string
  business_owner_user_id?: string
  technology_owner_user_id?: string
  project_purpose?: string
  project_scope_in?: string
  project_scope_out?: string
  project_deliverables?: string[]
  project_success_measures?: string[]
  approved_project_budget_sar?: number
  contract_value_sar?: number
  project_contingency_sar?: number
  contract_id?: string
  initial_risk_rating?: string
  governance_tier?: string
  steering_committee_required?: boolean
  project_reporting_frequency?: string
  check_approved_demand?: boolean
  check_approved_budget?: boolean
  check_procurement_complete?: boolean
  check_document_pack?: boolean
  created_by?: string
  /** G-40: RAIDC register rows (JSON string) — stored in initial_risks column */
  raidc_register?: string
  /** G-40: Payment milestones rows (JSON string) — stored in payment_milestones column */
  payment_milestones?: string
}) {
  const procurement_item_id = payload.procurement_item_id?.trim()
  const created_by = (payload.created_by?.trim() || 'pmo.user').slice(0, 128)

  if (!procurement_item_id) {
    return { ok: false as const, error: 'procurement_item_id is required.' }
  }

  try {
    const item = await prisma.procurementItem.findUnique({
      where: { procurement_item_id },
    })
    if (!item) {
      // Demo PMO gate without persisted procurement item
      return { ok: true as const, project_id: generateId('PRJ'), demo: true as const }
    }

    if (!isPmoReadyStage(item.procurement_stage)) {
      return {
        ok: false as const,
        error: 'Activation locked: Procurement Item must be in Acceptance or Completed.',
      }
    }

    const existing = await prisma.projectRegistration.findFirst({
      where: { procurement_item_id },
    })
    if (existing) {
      return { ok: false as const, error: 'Project already registered for this procurement item.' }
    }

    const checks = {
      check_approved_demand: payload.check_approved_demand === true,
      check_approved_budget: payload.check_approved_budget === true,
      check_procurement_complete: payload.check_procurement_complete !== false,
      check_document_pack: payload.check_document_pack === true,
    }
    if (!checks.check_approved_demand || !checks.check_approved_budget || !checks.check_document_pack) {
      return {
        ok: false as const,
        error: 'BR-035: Confirm approved demand, approved budget, and document pack before activation.',
      }
    }

    // BR-045: Duplicate project name check (MySQL collation handles case-insensitivity)
    const existingByName = await prisma.projectRegistration.findFirst({
      where: { project_name: { equals: payload.project_name }, is_active: true },
      select: { project_id: true },
    })
    if (existingByName) {
      throw new Error(`A project named "${payload.project_name}" already exists (${existingByName.project_id}). Use a unique name.`)
    }

    const project_id = generateId('PRJ')
    await prisma.projectRegistration.create({
      data: {
        project_id,
        project_name: payload.project_name.slice(0, 255),
        procurement_item_id,
        demand_id: item.demand_id,
        budget_line_id: item.budget_line_id,
        project_manager_user_id: payload.project_manager_id.slice(0, 128),
        delivery_approach: payload.delivery_approach.slice(0, 255),
        planned_start_date: new Date(payload.planned_start),
        planned_end_date: new Date(payload.planned_finish),
        project_type: payload.project_type || undefined,
        project_category: payload.project_category || undefined,
        complexity_rating: payload.complexity_rating || undefined,
        project_priority: payload.project_priority || undefined,
        project_sponsor_user_id: payload.project_sponsor_user_id || undefined,
        business_owner_user_id: payload.business_owner_user_id || undefined,
        technology_owner_user_id: payload.technology_owner_user_id || undefined,
        project_purpose: payload.project_purpose || undefined,
        project_scope_in: payload.project_scope_in || undefined,
        project_scope_out: payload.project_scope_out || undefined,
        project_deliverables: payload.project_deliverables?.length ? payload.project_deliverables : undefined,
        project_success_measures: payload.project_success_measures?.length
          ? payload.project_success_measures
          : undefined,
        approved_project_budget_sar:
          payload.approved_project_budget_sar ?? Number(item.approved_budget_sar ?? 0),
        contract_value_sar: payload.contract_value_sar || undefined,
        project_contingency_sar: payload.project_contingency_sar || undefined,
        contract_id: payload.contract_id || undefined,
        initial_risk_rating: payload.initial_risk_rating || undefined,
        governance_tier: payload.governance_tier || undefined,
        steering_committee_required: payload.steering_committee_required ?? false,
        project_reporting_frequency: payload.project_reporting_frequency || undefined,
        // G-40: RAIDC register stored in initial_risks column
        initial_risks: payload.raidc_register ? JSON.parse(payload.raidc_register) : undefined,
        // G-40: Payment milestones stored in payment_milestones column
        payment_milestones: payload.payment_milestones ? JSON.parse(payload.payment_milestones) : undefined,
        ...checks,
        master_trace_id: item.master_trace_id,
        entity_type: 'PROJECT_REGISTRATION',
        entry_route: item.entry_route,
        record_status: 'REGISTERED',
        parent_record_id: procurement_item_id,
        created_by,
        version_number: 1,
      },
    })

    await prisma.procurementItem.update({
      where: { procurement_item_id },
      data: { pmo_handoff_readiness: 'ACCEPTED' },
    })

    revalidatePortfolioDashboards()
    auditLog({
      action_type: 'ACTIVATE_PROJECT',
      master_trace_id: item.master_trace_id,
      active_user_id: created_by,
      entity_type: 'PROJECT_REGISTRATION',
      entity_id: project_id,
      outcome: 'success',
      procurement_item_id,
    })

    return { ok: true as const, project_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to activate project'
    captureException(err, {
      action_type: 'ACTIVATE_PROJECT',
      active_user_id: created_by,
      entity_id: procurement_item_id,
      outcome: 'failure',
      error: message,
    })
    return { ok: false as const, error: message }
  }
}

/** Simulate evidence upload → Attachment row (virus_scan_status = PASSED). */
export async function createAttachmentRecord(payload: {
  entity_type: string
  entity_id: string
  master_trace_id?: string
  file_name: string
  file_size_bytes: number
  mime_type?: string
  uploaded_by?: string
}) {
  try {
    const attachment_id = generateId('ATT')
    const uploaded_by = (payload.uploaded_by?.trim() || 'system').slice(0, 128)
    const checksum = createHash('sha256')
      .update(`${payload.file_name}:${payload.file_size_bytes}:${Date.now()}`)
      .digest('hex')

    const row = await prisma.attachment.create({
      data: {
        attachment_id,
        linked_entity: { entity_type: payload.entity_type, entity_id: payload.entity_id },
        document_type: 'APPROVAL_EVIDENCE',
        file_name: payload.file_name.slice(0, 255),
        file_version: '1',
        mime_type: (payload.mime_type || 'application/octet-stream').slice(0, 128),
        file_size_bytes: payload.file_size_bytes,
        file_checksum: checksum,
        virus_scan_status: VirusScanStatus.PASSED,
        attachment_classification: 'CONFIDENTIAL',
        uploaded_by,
        created_by: uploaded_by,
        master_trace_id: payload.master_trace_id || null,
        version_number: 1,
      },
    })

    auditLog({
      action_type: 'CREATE_ATTACHMENT',
      master_trace_id: payload.master_trace_id,
      active_user_id: uploaded_by,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      outcome: 'success',
      attachment_id,
    })

    return { ok: true as const, attachment: row }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create attachment'
    captureException(err, {
      action_type: 'CREATE_ATTACHMENT',
      master_trace_id: payload.master_trace_id,
      outcome: 'failure',
      error: message,
    })
    return { ok: false as const, error: message }
  }
}

export async function listBlockingFindings(master_trace_id: string) {
  if (!master_trace_id?.trim()) return []
  return prisma.comment.findMany({
    where: {
      master_trace_id,
      comment_type: 'VALIDATION_FINDING',
      resolution_status: {
        in: [ResolutionStatus.OPEN, ResolutionStatus.RESPONDED, ResolutionStatus.REOPENED],
      },
    },
    select: {
      comment_id: true,
      comment_text: true,
      uploaded_by: true,
      created_at: true,
    },
    orderBy: { created_at: 'asc' },
  })
}

export async function createCommentRecord(payload: {
  entity_type: string
  entity_id: string
  master_trace_id?: string
  comment_text: string
  requires_resolution: boolean
  uploaded_by?: string
  comment_type?: CommentType
}) {
  try {
    const comment_id = generateId('COM')
    const uploaded_by = (payload.uploaded_by?.trim() || 'system').slice(0, 128)
    const row = await prisma.comment.create({
      data: {
        comment_id,
        linked_entity: { entity_type: payload.entity_type, entity_id: payload.entity_id },
        linked_entity_field: {
          entity_type: payload.entity_type,
          entity_id: payload.entity_id,
        },
        comment_type: payload.requires_resolution
          ? 'VALIDATION_FINDING'
          : (payload.comment_type ?? 'GENERAL'),
        comment_text: payload.comment_text,
        resolution_status: payload.requires_resolution
          ? ResolutionStatus.OPEN
          : ResolutionStatus.NOT_APPLICABLE,
        uploaded_by,
        created_by: uploaded_by,
        master_trace_id: payload.master_trace_id || null,
        version_number: 1,
      },
    })
    auditLog({
      action_type: 'CREATE_COMMENT',
      master_trace_id: payload.master_trace_id,
      active_user_id: uploaded_by,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      outcome: 'success',
      comment_id,
    })

    return { ok: true as const, comment: row }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create comment'
    captureException(err, {
      action_type: 'CREATE_COMMENT',
      master_trace_id: payload.master_trace_id,
      outcome: 'failure',
      error: message,
    })
    return { ok: false as const, error: message }
  }
}

export async function submitGateDecision(payload: {
  entity_type: string
  entity_id: string
  master_trace_id?: string
  gate_code: string
  decision: 'APPROVED' | 'RETURNED'
  decision_comments?: string
  approver_user_id: string
  version_number?: number
}) {
  if (payload.decision === 'RETURNED' && !payload.decision_comments?.trim()) {
    return {
      ok: false as const,
      error: 'decision_comments are mandatory when returning for revision.',
    }
  }

  try {
    const existing = await prisma.approvalTransaction.findFirst({
      where: {
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
        gate_code: payload.gate_code,
        decision: { in: [DecisionEnum.APPROVED, DecisionEnum.APPROVED_COND] },
      },
      select: { approval_id: true },
    })
    if (existing && payload.decision === 'APPROVED') {
      return {
        ok: false as const,
        error: 'This gate is already approved. Approve cannot be submitted again.',
      }
    }

    const now = new Date()
    const approval_id = generateId('APR')
    const version_number = payload.version_number ?? 1
    const version_hash = versionHash({
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      decision: payload.decision,
      at: now.toISOString(),
      version_number,
    })

    const row = await prisma.approvalTransaction.create({
      data: {
        approval_id,
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
        entity_version: version_number,
        version_number,
        version_hash,
        gate_code: payload.gate_code,
        approval_sequence: 1,
        approver_role: 'GATE_APPROVER',
        approver_user_id: payload.approver_user_id.slice(0, 128),
        authority_basis: `${payload.gate_code} authority matrix`,
        assigned_at: now,
        sla_due_at: new Date(now.getTime() + 48 * 60 * 60 * 1000),
        decision_at: now,
        decision: payload.decision === 'APPROVED' ? DecisionEnum.APPROVED : DecisionEnum.RETURNED,
        decision_comments: payload.decision_comments?.trim() || null,
        lock_release_action:
          payload.decision === 'APPROVED' ? 'RELEASE_FOR_NEXT_STAGE' : 'CREATE_REVISION',
        notification_status: 'PENDING',
        created_by: payload.approver_user_id.slice(0, 128),
        master_trace_id: payload.master_trace_id || null,
        is_locked: true,
      },
    })

    revalidatePortfolioDashboards()
    if (payload.entity_type === 'BUDGET_SUBMISSION') {
      revalidateProcurementPages(payload.entity_id)
    }
    auditLog({
      action_type: 'SUBMIT_GATE_DECISION',
      master_trace_id: payload.master_trace_id,
      active_user_id: payload.approver_user_id,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      outcome: 'success',
      gate_code: payload.gate_code,
      decision: payload.decision,
      approval_id,
    })

    return { ok: true as const, approval: row }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit gate decision'
    captureException(err, {
      action_type: 'SUBMIT_GATE_DECISION',
      master_trace_id: payload.master_trace_id,
      active_user_id: payload.approver_user_id,
      outcome: 'failure',
      error: message,
    })
    return { ok: false as const, error: message }
  }
}

export async function listGateComments(_entityId: string, masterTraceId?: string) {
  if (!masterTraceId) return []
  return prisma.comment.findMany({
    where: { master_trace_id: masterTraceId },
    orderBy: { created_at: 'desc' },
    take: 50,
  })
}

export async function listGateAttachments(_entityId: string, masterTraceId?: string) {
  if (!masterTraceId) return []
  return prisma.attachment.findMany({
    where: { master_trace_id: masterTraceId },
    orderBy: { created_at: 'desc' },
    take: 50,
  })
}

/** Decision history for ApprovalGate compliance receipts. */
export async function listGateApprovals(entityId: string, masterTraceId?: string) {
  return prisma.approvalTransaction.findMany({
    where: {
      OR: [
        { entity_id: entityId },
        ...(masterTraceId ? [{ master_trace_id: masterTraceId }] : []),
      ],
      decision: {
        in: [
          DecisionEnum.APPROVED,
          DecisionEnum.APPROVED_COND,
          DecisionEnum.RETURNED,
          DecisionEnum.REJECTED,
        ],
      },
    },
    orderBy: { decision_at: 'desc' },
    take: 40,
    select: {
      approval_id: true,
      gate_code: true,
      decision: true,
      decision_at: true,
      approver_user_id: true,
      version_hash: true,
      entity_type: true,
      entity_id: true,
    },
  })
}

/** Load Demand workspace context including MasterTrace.entry_route (BR-005). */
export async function getDemandWorkspace(demandId: string) {
  const demand = await prisma.demand.findUnique({
    where: { demand_id: demandId },
    include: {
      master_trace: true,
      options: { orderBy: { created_at: 'asc' } },
      benefits: { orderBy: { created_at: 'asc' } },
      raidc_items: { orderBy: { created_at: 'asc' } },
      strategy: {
        select: {
          strategy_id: true,
          strategy_title: true,
          objectives: {
            select: {
              objective_id: true,
              objective_name: true,
              kpis: { select: { kpi_id: true, kpi_name: true } },
            },
          },
        },
      },
    },
  })

  if (!demand) return null

  const strategies = await prisma.strategy.findMany({
    where: {
      master_trace_id: demand.master_trace_id,
      record_status: 'APPROVED',
    },
    select: {
      strategy_id: true,
      strategy_title: true,
      objectives: {
        select: {
          objective_id: true,
          objective_name: true,
          kpis: { select: { kpi_id: true, kpi_name: true } },
        },
      },
    },
    orderBy: { created_at: 'desc' },
  })

  return {
    demand,
    entry_route: demand.master_trace.entry_route as EntryRoute,
    strategies,
  }
}

/** Load Budget submission header for the lines workspace. */
export async function getBudgetSubmissionWorkspace(budgetSubmissionId: string) {
  return prisma.budgetSubmission.findUnique({
    where: { budget_submission_id: budgetSubmissionId },
    include: {
      master_trace: { select: { master_trace_id: true, entry_route: true } },
      strategy: { select: { strategy_id: true, strategy_title: true } },
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// returnGate  (G-S1 / G-B1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CTO returns a Strategy (G-S1) or Budget (G-B1) for revision.
 * - Unlocks the record, sets record_status = 'RETURNED'
 * - Creates an ApprovalTransaction with decision = RETURNED
 * - Adds a Comment (type DECISION) with the return reason
 */
export async function returnGate(
  payload: ReturnGatePayload,
): Promise<ReturnGateResult> {
  const { entity_type, entity_id, master_trace_id, gate_code, return_comment, returned_by } =
    payload

  if (!entity_id?.trim()) return { ok: false, error: 'entity_id is required.' }
  if (!return_comment?.trim() || return_comment.trim().length < 10) {
    return { ok: false, error: 'A return reason of at least 10 characters is required.' }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (entity_type === 'STRATEGY') {
        const strategy = await tx.strategy.findUnique({ where: { strategy_id: entity_id } })
        if (!strategy) throw new Error(`Strategy not found: ${entity_id}`)
        if (strategy.record_status === 'RETURNED') throw new Error('Strategy is already RETURNED.')

        await tx.strategy.update({
          where: { strategy_id: entity_id },
          data: {
            record_status: 'RETURNED',
            approval_status: 'RETURNED',
            is_locked: false,
            modified_by: returned_by,
          },
        })
      } else {
        const budget = await tx.budgetSubmission.findUnique({
          where: { budget_submission_id: entity_id },
        })
        if (!budget) throw new Error(`BudgetSubmission not found: ${entity_id}`)
        if (budget.record_status === 'RETURNED') throw new Error('Budget submission is already RETURNED.')

        await tx.budgetSubmission.update({
          where: { budget_submission_id: entity_id },
          data: {
            record_status: 'RETURNED',
            approval_status: 'RETURNED',
            is_locked: false,
            modified_by: returned_by,
          },
        })
      }

      // Create approval transaction record with RETURNED decision
      const approval_id = generateId('APR')
      const now = new Date()
      await tx.approvalTransaction.create({
        data: {
          approval_id,
          entity_type,
          entity_id,
          entity_version: 1,
          version_hash: versionHash({ entity_type, entity_id, returned_by, returned_at: now }),
          version_number: 1,
          gate_code,
          approval_sequence: 1,
          approver_role: 'CTO',
          approver_user_id: returned_by,
          authority_basis: `${gate_code} Return Gate Policy`,
          assigned_at: now,
          sla_due_at: now,
          decision: DecisionEnum.RETURNED,
          decision_at: now,
          decision_comments: return_comment.trim(),
          lock_release_action: 'CREATE_REVISION',
          notification_status: 'PENDING',
          created_by: returned_by,
          master_trace_id,
          is_locked: false,
        },
      })

      // Add a comment so the requestor sees the reason
      const comment_id = generateId('CMT')
      await tx.comment.create({
        data: {
          comment_id,
          master_trace_id,
          linked_entity: { entity_type, entity_id },
          comment_type: 'RETURN_INSTRUCTION',
          comment_text: return_comment.trim(),
          resolution_status: ResolutionStatus.OPEN,
          uploaded_by: returned_by,
          created_by: returned_by,
          is_locked: false,
        },
      })

      return { entity_id, approval_id }
    })

    revalidatePortfolioDashboards()
    auditLog({
      action_type: 'RETURN_GATE',
      master_trace_id,
      active_user_id: returned_by,
      entity_type,
      entity_id,
      outcome: 'success',
      gate_code,
    })

    return { ok: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to return gate record'
    captureException(err, {
      action_type: 'RETURN_GATE',
      entity_type,
      entity_id,
      active_user_id: returned_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// G-03 / BR-012: Approve with Conditions (strategy or budget)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BR-012: CTO may approve a strategy or budget submission "with conditions",
 * which still releases it for the next stage but records explicit conditions
 * that must be met. The decision_comments are mandatory.
 */
export async function approveWithConditions(
  payload: ApproveWithConditionsPayload,
): Promise<{ ok: true; entity_id: string; approval_id: string } | { ok: false; error: string }> {
  const { entity_type, entity_id, master_trace_id, approver_user_id, conditions } = payload

  const gate_code = entity_type === 'STRATEGY' ? 'G-S1' : 'G-B1'
  const rbac = await requireGateRole(gate_code)
  if (rbac) return rbac

  if (!conditions?.trim() || conditions.trim().length < 20) {
    return {
      ok: false,
      error: 'BR-012: Conditions text is mandatory for Approved-with-Conditions decisions (min. 20 chars).',
    }
  }

  try {
    const approval_id = await prisma.$transaction(async (tx) => {
      const now = new Date()
      const hashPayload = { entity_type, entity_id, master_trace_id, approved_at: now.toISOString() }
      const version_hash = versionHash(hashPayload)

      if (entity_type === 'STRATEGY') {
        const strategy = await tx.strategy.findUnique({ where: { strategy_id: entity_id } })
        if (!strategy) throw new Error(`Strategy not found: ${entity_id}`)

        await tx.strategy.update({
          where: { strategy_id: entity_id },
          data: {
            record_status: 'APPROVED',
            approval_status: 'APPROVED_COND',
            is_locked: true,
            modified_by: approver_user_id,
          },
        })
      } else {
        const budget = await tx.budgetSubmission.findUnique({
          where: { budget_submission_id: entity_id },
        })
        if (!budget) throw new Error(`BudgetSubmission not found: ${entity_id}`)

        await tx.budgetSubmission.update({
          where: { budget_submission_id: entity_id },
          data: {
            record_status: 'APPROVED',
            approval_status: 'APPROVED_COND',
            is_locked: true,
            modified_by: approver_user_id,
          },
        })
      }

      // BR-012: record the conditions as a comment
      await tx.comment.create({
        data: {
          comment_id: generateId('CMT'),
          master_trace_id,
          linked_entity: { entity_type, entity_id },
          comment_type: 'APPROVAL_COMMENT',
          comment_text: `APPROVED WITH CONDITIONS: ${conditions.trim()}`,
          resolution_status: ResolutionStatus.OPEN,
          uploaded_by: approver_user_id,
          created_by: approver_user_id,
          is_locked: false,
        },
      })

      const aprId = generateId('APR')
      await tx.approvalTransaction.create({
        data: {
          approval_id: aprId,
          entity_type,
          entity_id,
          entity_version: 1,
          version_number: 1,
          version_hash,
          gate_code,
          approval_sequence: 1,
          approver_role: 'CTO',
          approver_user_id,
          authority_basis: `${gate_code} Conditional Approval Policy`,
          assigned_at: now,
          sla_due_at: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          decision_at: now,
          decision: DecisionEnum.APPROVED_COND,
          decision_comments: conditions.trim(),
          lock_release_action: 'RELEASE_FOR_NEXT_STAGE',
          notification_status: 'PENDING',
          created_by: approver_user_id,
          master_trace_id,
          is_locked: true,
        },
      })

      return aprId
    })

    revalidatePortfolioDashboards()
    auditLog({
      action_type: 'APPROVE_WITH_CONDITIONS',
      master_trace_id,
      active_user_id: approver_user_id,
      entity_type,
      entity_id,
      outcome: 'success',
    })

    return { ok: true, entity_id, approval_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to approve with conditions'
    captureException(err, {
      action_type: 'APPROVE_WITH_CONDITIONS',
      entity_type,
      entity_id,
      active_user_id: approver_user_id,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// G-08 / BR-028: Targeted budget line return
// ─────────────────────────────────────────────────────────────────────────────

export type ReturnBudgetLinesPayload = {
  budget_submission_id: string
  master_trace_id: string
  returned_by: string
  /** One or more budget_line_id values to target for revision */
  targeted_line_ids: string[]
  return_reason: string
}

export type ReturnBudgetLinesResult =
  | { ok: true; budget_submission_id: string; lines_returned: number }
  | { ok: false; error: string }

/**
 * BR-028: G-B1 CTO may target specific budget lines for revision without
 * returning the entire submission. Returns only the named lines and adds a
 * comment per line explaining the issue.
 */
export async function returnBudgetLines(
  payload: ReturnBudgetLinesPayload,
): Promise<ReturnBudgetLinesResult> {
  const { budget_submission_id, master_trace_id, returned_by, targeted_line_ids, return_reason } =
    payload

  // RBAC: only CTO Office can return budget lines
  const rbac = await requireGateRole('G-B1')
  if (rbac) return rbac

  if (!targeted_line_ids?.length) {
    return { ok: false, error: 'At least one budget_line_id must be specified.' }
  }
  if (!return_reason?.trim() || return_reason.trim().length < 10) {
    return { ok: false, error: 'A return reason of at least 10 characters is required.' }
  }

  try {
    const linesReturned = await prisma.$transaction(async (tx) => {
      // Validate budget submission exists and belongs to master trace
      const budget = await tx.budgetSubmission.findUnique({
        where: { budget_submission_id },
        select: { master_trace_id: true, record_status: true },
      })
      if (!budget) throw new Error(`BudgetSubmission not found: ${budget_submission_id}`)
      if (budget.master_trace_id !== master_trace_id) {
        throw new Error('budget_submission_id does not belong to the provided master_trace_id.')
      }

      // Mark targeted lines as RETURNED and add per-line comments
      let count = 0
      for (const line_id of targeted_line_ids) {
        const line = await tx.budgetLine.findFirst({
          where: { budget_line_id: line_id, budget_submission_id },
          select: { budget_line_id: true, line_description: true },
        })
        if (!line) continue

        await tx.budgetLine.update({
          where: { budget_line_id: line_id },
          data: { record_status: 'RETURNED', modified_by: returned_by },
        })

        await tx.comment.create({
          data: {
            comment_id: generateId('CMT'),
            master_trace_id,
            linked_entity: {
              entity_type: 'BUDGET_LINE',
              entity_id: line_id,
              budget_submission_id,
            },
            comment_type: 'RETURN_INSTRUCTION',
            comment_text: `BR-028 targeted return — Line: ${line.line_description ?? line_id}. Reason: ${return_reason.trim()}`,
            resolution_status: ResolutionStatus.OPEN,
            uploaded_by: returned_by,
            created_by: returned_by,
            is_locked: false,
          },
        })
        count++
      }

      // If all lines are returned, put the whole submission back to RETURNED
      const activeLines = await tx.budgetLine.count({
        where: {
          budget_submission_id,
          record_status: { not: 'RETURNED' },
        },
      })
      if (activeLines === 0) {
        await tx.budgetSubmission.update({
          where: { budget_submission_id },
          data: {
            record_status: 'RETURNED',
            approval_status: 'RETURNED',
            is_locked: false,
            modified_by: returned_by,
          },
        })
      }

      return count
    })

    revalidatePortfolioDashboards()
    auditLog({
      action_type: 'RETURN_BUDGET_LINES',
      master_trace_id,
      active_user_id: returned_by,
      entity_type: 'BUDGET_SUBMISSION',
      entity_id: budget_submission_id,
      outcome: 'success',
      lines_returned: linesReturned,
    })

    return { ok: true, budget_submission_id, lines_returned: linesReturned }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to return budget lines'
    captureException(err, {
      action_type: 'RETURN_BUDGET_LINES',
      entity_type: 'BUDGET_SUBMISSION',
      entity_id: budget_submission_id,
      active_user_id: returned_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate queue loaders
// ─────────────────────────────────────────────────────────────────────────────

/** G-S1: Load all strategies pending CTO Strategy Gate review. */
export async function getStrategyGateQueue() {
  return prisma.strategy.findMany({
    where: { record_status: 'SUBMITTED', approval_status: 'PENDING' },
    select: {
      strategy_id: true,
      strategy_title: true,
      master_trace_id: true,
      entry_route: true,
      submitted_by: true,
      submitted_at: true,
      funding_envelope: true,
      executive_summary: true,
      horizon_start_date: true,
      horizon_end_date: true,
      _count: { select: { objectives: true } },
    },
    orderBy: { submitted_at: 'asc' },
  })
}

/** G-B1: Load all budget submissions pending CTO Budget Gate review. */
export async function getBudgetGateQueue() {
  return prisma.budgetSubmission.findMany({
    where: { record_status: 'SUBMITTED', approval_status: 'PENDING' },
    select: {
      budget_submission_id: true,
      master_trace_id: true,
      budget_cycle: true,
      total_requested_sar: true,
      total_validated_sar: true,
      capex_total_sar: true,
      opex_total_sar: true,
      strategy_id: true,
      submitted_by: true,
      submitted_at: true,
      _count: { select: { budget_lines: true } },
    },
    orderBy: { submitted_at: 'asc' },
  })
}

/**
 * G-PMO1: Load all procurement items in DELIVERED stage that do not yet
 * have a project registration — these are awaiting PMO gate activation.
 */
export async function getGatePmoQueue() {
  return prisma.procurementItem.findMany({
    where: {
      procurement_stage: { in: ['DELIVERED', 'ACCEPTANCE', 'COMPLETED'] },
      project_registration: null,
      is_active: true,
    },
    select: {
      procurement_item_id: true,
      procurement_item_title: true,
      master_trace_id: true,
      procurement_stage: true,
      planned_value_sar: true,
      approved_budget_sar: true,
      procurement_category: true,
      created_by: true,
      created_at: true,
      demand: { select: { demand_id: true, demand_title: true } },
    },
    orderBy: { created_at: 'desc' },
  })
}


