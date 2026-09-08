'use server'

import { revalidateTag } from 'next/cache'
import { randomInt } from 'crypto'
import { VersionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'
import { requireRole } from '@/src/lib/auth/server-guard'
import { checkDocumentPack } from '@/lib/atlas/document-pack'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 10000)}`
}

function n(v: unknown): number {
  if (v === null || v === undefined) return 0
  return typeof v === 'number' ? v : Number(v)
}

function round2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BudgetLineInput = {
  /** Existing DB id — omit to create a new row */
  budget_line_id?: string
  demand_id?: string
  line_description?: string
  cost_classification?: string      // CAPEX | OPEX | MIXED
  line_category?: string            // License | Services | Hardware | etc.
  cost_subcategory?: string
  quantity?: number
  unit_cost?: number
  gross_amount?: number
  discount_amount?: number
  contingency_pct?: number
  contingency_amount?: number
  net_before_tax?: number
  tax_rate_pct?: number
  tax_amount?: number
  requested_total_sar?: number
  company_code?: string
  cost_center_code?: string
  gl_account_code?: string
  wbs_internal_order?: string
  funding_source?: string
  is_recurring?: boolean
  recurrence_frequency?: string
  commitment_type?: string
  estimate_confidence?: string
}

export type BudgetHeaderInput = {
  budget_cycle?: string
  budget_scenario?: string
  planning_start_fy?: number
  planning_end_fy?: number
  funding_ceiling_sar?: number
  base_currency?: string
  budget_owner_user_id?: string
}

export type SaveBudgetLinesPayload = {
  budget_submission_id: string
  lines: BudgetLineInput[]
  header?: BudgetHeaderInput
  modified_by: string
}

export type SaveBudgetLinesResult =
  | { ok: true; budget_submission_id: string; line_count: number; line_ids: string[] }
  | { ok: false; error: string }

export type SubmitBudgetPayload = {
  budget_submission_id: string
  submitted_by: string
}

export type SubmitBudgetResult =
  | { ok: true; budget_submission_id: string }
  | { ok: false; error: string; code?: string }

// ─────────────────────────────────────────────────────────────────────────────
// saveBudgetLines
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Batch-upsert BudgetLine rows and recalculate BudgetSubmission header totals.
 * This is the "auto-save" action for the budget lines spreadsheet.
 */
export async function saveBudgetLines(
  payload: SaveBudgetLinesPayload,
): Promise<SaveBudgetLinesResult> {
  const { budget_submission_id, modified_by } = payload

  if (!budget_submission_id?.trim()) return { ok: false, error: 'budget_submission_id is required.' }
  if (!payload.lines?.length) return { ok: false, error: 'At least one budget line is required.' }

  try {
    const line_ids = await prisma.$transaction(async (tx) => {
      const submission = await tx.budgetSubmission.findUnique({
        where: { budget_submission_id },
        include: {
          master_trace: {
            include: { demands: { select: { demand_id: true }, take: 1 } },
          },
        },
      })
      if (!submission) throw new Error(`BudgetSubmission not found: ${budget_submission_id}`)
      if (submission.is_locked) throw new Error('Budget is locked — cannot edit after submission.')

      // BudgetLine.demand_id is a required FK — use the first demand on this MasterTrace
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const masterTraceWithDemands = submission.master_trace as any
      const fallbackDemandId: string | undefined =
        masterTraceWithDemands?.demands?.[0]?.demand_id ?? undefined

      let totalRequested = 0
      let totalCapex = 0
      let totalOpex = 0
      let totalContingency = 0
      let totalTax = 0
      const line_ids: string[] = []

      for (const line of payload.lines) {
        const demand_id = line.demand_id ?? fallbackDemandId
        // If there's no demand linked yet, skip this line — budget lines require a demand
        if (!demand_id) continue

        // BR-021: Only VALIDATED or VALIDATED_COND demands can be linked to budget lines
        if (line.demand_id) {
          const linkedDemand = await tx.demand.findUnique({
            where: { demand_id },
            select: { record_status: true },
          })
          if (
            linkedDemand &&
            !['VALIDATED', 'VALIDATED_COND'].includes(linkedDemand.record_status ?? '')
          ) {
            throw new Error(
              `BR-021: Demand ${demand_id} has not been commercially validated. Only validated demands can be linked to budget lines.`,
            )
          }
        }

        const budget_line_id = line.budget_line_id ?? generateId('BLN')
        const quantity = n(line.quantity) || 1
        const unit_cost = n(line.unit_cost)
        const discount = n(line.discount_amount)
        const tax_rate_pct = n(line.tax_rate_pct)
        const gross = n(line.gross_amount) || quantity * unit_cost
        const contingency_amount = n(line.contingency_amount)
        const net_before_tax = n(line.net_before_tax) || Math.max(0, gross - discount + contingency_amount)
        const tax_amount = n(line.tax_amount) || round2(net_before_tax * (tax_rate_pct / 100))
        const requested_total = n(line.requested_total_sar) || net_before_tax + tax_amount

        totalRequested += requested_total
        totalContingency += contingency_amount
        totalTax += tax_amount

        const isCapex = (line.cost_classification ?? 'OPEX').toUpperCase() === 'CAPEX'
        if (isCapex) totalCapex += requested_total
        else totalOpex += requested_total

        const sharedLine = {
          line_description: line.line_description ?? undefined,
          cost_classification: line.cost_classification ?? 'OPEX',
          cost_category: line.line_category ?? undefined,
          cost_subcategory: line.cost_subcategory ?? undefined,
          quantity,
          unit_cost,
          gross_amount: gross,
          discount_amount: discount || undefined,
          contingency_amount,
          contingency_basis: line.contingency_pct !== undefined && line.contingency_pct !== null ? `${line.contingency_pct}%` : undefined,
          net_before_tax,
          tax_rate_pct: tax_rate_pct || undefined,
          tax_amount,
          requested_total_sar: requested_total,
          company_code: line.company_code ?? undefined,
          cost_center_code: line.cost_center_code ?? undefined,
          gl_account_code: line.gl_account_code ?? undefined,
          wbs_internal_order: line.wbs_internal_order ?? undefined,
          funding_source: line.funding_source ?? undefined,
          is_recurring: line.is_recurring ?? undefined,
          recurrence_frequency: line.recurrence_frequency ?? undefined,
          commitment_type: line.commitment_type ?? undefined,
          estimate_confidence: line.estimate_confidence ?? undefined,
        }

        await tx.budgetLine.upsert({
          where: { budget_line_id },
          create: {
            budget_line_id,
            budget_submission_id,
            master_trace_id: submission.master_trace_id,
            entity_type: 'BUDGET_LINE',
            entry_route: submission.entry_route,
            demand_id,
            created_by: modified_by,
            ...sharedLine,
          },
          update: {
            ...sharedLine,
            modified_by,
          },
        })
        line_ids.push(budget_line_id)
      }

      const ceiling = payload.header?.funding_ceiling_sar ?? n(submission.funding_ceiling_sar)
      const fundingGap = ceiling > 0 ? totalRequested - ceiling : 0

      // Recalculate BudgetSubmission header totals
      await tx.budgetSubmission.update({
        where: { budget_submission_id },
        data: {
          budget_cycle: payload.header?.budget_cycle ?? submission.budget_cycle,
          budget_scenario: payload.header?.budget_scenario ?? submission.budget_scenario,
          planning_start_fy: payload.header?.planning_start_fy ?? submission.planning_start_fy,
          planning_end_fy: payload.header?.planning_end_fy ?? submission.planning_end_fy,
          funding_ceiling_sar: payload.header?.funding_ceiling_sar ?? submission.funding_ceiling_sar,
          base_currency: payload.header?.base_currency ?? submission.base_currency,
          budget_owner_user_id: payload.header?.budget_owner_user_id ?? submission.budget_owner_user_id,
          total_requested_sar: totalRequested,
          capex_total_sar: totalCapex,
          opex_total_sar: totalOpex,
          contingency_total_sar: totalContingency,
          tax_total_sar: totalTax,
          funding_gap_sar: fundingGap,
          modified_by,
          record_status:
            submission.record_status === 'RETURNED' ? 'DRAFT' : submission.record_status,
        },
      })

      return line_ids
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'SAVE_BUDGET_LINES',
      entity_type: 'BUDGET_SUBMISSION',
      entity_id: budget_submission_id,
      active_user_id: modified_by,
      outcome: 'success',
    })

    return { ok: true, budget_submission_id, line_count: payload.lines.length, line_ids }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save budget lines'
    captureException(err, {
      action_type: 'SAVE_BUDGET_LINES',
      entity_id: budget_submission_id,
      active_user_id: modified_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// submitBudget
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submits a BudgetSubmission for CTO Gate G-B1 review.
 *
 * Enforces:
 *   BR-022 — at least one budget line must exist
 *   BR-023 — total_requested_sar must be > 0
 */
export async function submitBudget(
  payload: SubmitBudgetPayload,
): Promise<SubmitBudgetResult> {
  // RBAC: only Commercial & Budgeting can submit to CTO gate
  const rbac = await requireRole('Commercial & Budgeting', 'CTO Office')
  if (rbac) return rbac

  const { budget_submission_id, submitted_by } = payload

  if (!budget_submission_id?.trim()) return { ok: false, error: 'budget_submission_id is required.' }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.budgetSubmission.findUnique({
        where: { budget_submission_id },
        include: {
          budget_lines: { select: { budget_line_id: true } },
          consolidation: {
            select: { funding_recommendation_summary: true },
          },
        },
      })

      if (!submission) throw new Error(`BudgetSubmission not found: ${budget_submission_id}`)
      if (submission.is_locked) throw new Error('Budget is already submitted / locked.')
      if (submission.record_status === 'APPROVED') throw new Error('Budget is already APPROVED.')

      // BR-022: at least one line
      if (!submission.budget_lines.length) {
        throw Object.assign(
          new Error('BR-022: Budget must have at least one cost line before submission.'),
          { code: 'BR-022' },
        )
      }

      // BR-023: total > 0
      if (n(submission.total_requested_sar) <= 0) {
        throw Object.assign(
          new Error('BR-023: Total requested budget must be greater than zero.'),
          { code: 'BR-023' },
        )
      }

      // BR-027 (partial): Funding recommendation summary required before G-B1 submission
      if (!submission.consolidation?.funding_recommendation_summary?.trim()) {
        throw Object.assign(
          new Error(
            'BR-027: Funding Recommendation Summary (CON-018) is required before submitting to the CTO gate. Please complete the Consolidation Pack.',
          ),
          { code: 'BR-027' },
        )
      }

      // G-17: mandatory document pack check
      const attachedTypes = await tx.attachment.findMany({
        where: { master_trace_id: submission.master_trace_id ?? '' },
        select: { document_type: true },
      })
      const docError = checkDocumentPack('BUDGET', 'SUBMIT', attachedTypes.map((a) => a.document_type))
      if (docError) {
        throw Object.assign(new Error(docError), { code: 'BR-017' })
      }

      const now = new Date()
      await tx.budgetSubmission.update({
        where: { budget_submission_id },
        data: {
          record_status: 'SUBMITTED',
          approval_status: 'PENDING',
          version_status: VersionStatus.SUBMITTED,
          is_locked: true,
          submitted_by,
          submitted_at: now,
          modified_by: submitted_by,
        },
      })

      return { budget_submission_id }
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'SUBMIT_BUDGET',
      entity_type: 'BUDGET_SUBMISSION',
      entity_id: budget_submission_id,
      active_user_id: submitted_by,
      outcome: 'success',
      gate_code: 'G-B1',
    })

    return { ok: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit budget'
    const code = (err as { code?: string }).code
    captureException(err, {
      action_type: 'SUBMIT_BUDGET',
      entity_id: budget_submission_id,
      active_user_id: submitted_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message, code }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getBudgetLines  (read-only loader)
// ─────────────────────────────────────────────────────────────────────────────

export type BudgetLinesData = {
  budget_submission_id: string
  master_trace_id: string
  record_status: string | null
  version_number: number | null
  is_locked: boolean
  budget_cycle: string | null
  budget_scenario: string | null
  planning_start_fy: number | null
  planning_end_fy: number | null
  funding_ceiling_sar: number | null
  base_currency: string | null
  budget_owner_user_id: string | null
  strategy: { strategy_id: string; strategy_title: string } | null
  budget_lines: {
    budget_line_id: string
    line_description: string | null
    cost_classification: string | null
    line_category: string | null
    cost_subcategory: string | null
    quantity: number | null
    unit_cost: number | null
    discount_amount: number | null
    contingency_pct: number | null
    tax_rate_pct: number | null
    company_code: string | null
    cost_center_code: string | null
    gl_account_code: string | null
    wbs_internal_order: string | null
    funding_source: string | null
    is_recurring: boolean | null
    recurrence_frequency: string | null
    commitment_type: string | null
    estimate_confidence: string | null
  }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// saveBudgetGovernance  (BUD-029 / BUD-030 / BUD-031 / BUD-032)
// ─────────────────────────────────────────────────────────────────────────────

export type SaveBudgetGovernancePayload = {
  budget_submission_id: string
  budget_assumptions?: { statement: string; owner?: string; source?: string }[]
  budget_risks?: { risk: string; owner?: string; rating?: string; response?: string }[]
  management_recommendations?: string
  excluded_deferred_demands?: { demand_title: string; disposition?: string; reason?: string }[]
  modified_by: string
}

export type SaveBudgetGovernanceResult =
  | { ok: true; budget_submission_id: string }
  | { ok: false; error: string }

/**
 * Persists budget governance metadata (assumptions, risks, management narrative,
 * excluded demands) on the BudgetSubmission record as JSON fields.
 */
export async function saveBudgetGovernance(
  payload: SaveBudgetGovernancePayload,
): Promise<SaveBudgetGovernanceResult> {
  const { budget_submission_id, modified_by } = payload

  if (!budget_submission_id?.trim()) return { ok: false, error: 'budget_submission_id is required.' }

  try {
    await prisma.budgetSubmission.update({
      where: { budget_submission_id },
      data: {
        budget_assumptions: payload.budget_assumptions?.length
          ? (payload.budget_assumptions as object[])
          : undefined,
        budget_risks: payload.budget_risks?.length
          ? (payload.budget_risks as object[])
          : undefined,
        management_recommendations: payload.management_recommendations ?? undefined,
        excluded_deferred_demands: payload.excluded_deferred_demands?.length
          ? (payload.excluded_deferred_demands as object[])
          : undefined,
        modified_by,
      },
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'SAVE_BUDGET_GOVERNANCE',
      entity_type: 'BUDGET_SUBMISSION',
      entity_id: budget_submission_id,
      active_user_id: modified_by,
      outcome: 'success',
    })

    return { ok: true, budget_submission_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save budget governance'
    captureException(err, {
      action_type: 'SAVE_BUDGET_GOVERNANCE',
      entity_id: budget_submission_id,
      active_user_id: modified_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

export async function getBudgetLines(
  budgetSubmissionId: string,
): Promise<BudgetLinesData | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await prisma.budgetSubmission.findUnique({
    where: { budget_submission_id: budgetSubmissionId },
    include: {
      strategy: { select: { strategy_id: true, strategy_title: true } },
      budget_lines: {
        orderBy: { created_at: 'asc' },
        select: {
          budget_line_id: true,
          line_description: true,
          cost_classification: true,
          cost_category: true,
          cost_subcategory: true,
          quantity: true,
          unit_cost: true,
          discount_amount: true,
          contingency_amount: true,
          tax_rate_pct: true,
          company_code: true,
          cost_center_code: true,
          gl_account_code: true,
          wbs_internal_order: true,
          funding_source: true,
          is_recurring: true,
          recurrence_frequency: true,
          commitment_type: true,
          estimate_confidence: true,
        },
      },
    },
  })

  if (!raw) return null

  return {
    budget_submission_id: raw.budget_submission_id as string,
    master_trace_id: raw.master_trace_id as string,
    record_status: (raw.record_status as string | null) ?? null,
    version_number: raw.version_number !== null && raw.version_number !== undefined ? Number(raw.version_number) : null,
    is_locked: raw.is_locked as boolean,
    budget_cycle: (raw.budget_cycle as string | null) ?? null,
    budget_scenario: (raw.budget_scenario as string | null) ?? null,
    planning_start_fy: raw.planning_start_fy !== null && raw.planning_start_fy !== undefined ? Number(raw.planning_start_fy) : null,
    planning_end_fy: raw.planning_end_fy !== null && raw.planning_end_fy !== undefined ? Number(raw.planning_end_fy) : null,
    funding_ceiling_sar: raw.funding_ceiling_sar !== null && raw.funding_ceiling_sar !== undefined ? Number(raw.funding_ceiling_sar) : null,
    base_currency: (raw.base_currency as string | null) ?? null,
    budget_owner_user_id: (raw.budget_owner_user_id as string | null) ?? null,
    strategy: raw.strategy
      ? { strategy_id: raw.strategy.strategy_id as string, strategy_title: raw.strategy.strategy_title as string }
      : null,
    budget_lines: (raw.budget_lines as unknown[]).map((l: unknown) => {
      const line = l as Record<string, unknown>
      const quantity = line.quantity ? Number(line.quantity) : 0
      const unitCost = line.unit_cost ? Number(line.unit_cost) : 0
      const discount = line.discount_amount ? Number(line.discount_amount) : 0
      const contingencyAmt = line.contingency_amount ? Number(line.contingency_amount) : 0
      const gross = Math.max(0, quantity * unitCost - discount)
      const contingencyPct = gross > 0 ? round2((contingencyAmt / gross) * 100) : 0
      return {
        budget_line_id: line.budget_line_id as string,
        line_description: (line.line_description as string | null) ?? null,
        cost_classification: (line.cost_classification as string | null) ?? null,
        line_category: (line.cost_category as string | null) ?? null,
        cost_subcategory: (line.cost_subcategory as string | null) ?? null,
        quantity: quantity || null,
        unit_cost: unitCost || null,
        discount_amount: discount || null,
        contingency_pct: contingencyPct || null,
        tax_rate_pct: line.tax_rate_pct ? Number(line.tax_rate_pct) : null,
        company_code: (line.company_code as string | null) ?? null,
        cost_center_code: (line.cost_center_code as string | null) ?? null,
        gl_account_code: (line.gl_account_code as string | null) ?? null,
        wbs_internal_order: (line.wbs_internal_order as string | null) ?? null,
        funding_source: (line.funding_source as string | null) ?? null,
        is_recurring: (line.is_recurring as boolean | null) ?? null,
        recurrence_frequency: (line.recurrence_frequency as string | null) ?? null,
        commitment_type: (line.commitment_type as string | null) ?? null,
        estimate_confidence: (line.estimate_confidence as string | null) ?? null,
      }
    }),
  }
}


