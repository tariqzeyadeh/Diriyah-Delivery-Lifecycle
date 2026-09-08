'use server'

import { randomInt } from 'crypto'
import { Prisma } from '@prisma/client'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'
import type {
  ConsolidationSummary,
  DecisionItem,
  ConsolidationRisk,
  ProposedCondition,
} from '@/lib/atlas/consolidation'

// Re-export types so pages can import from here
export type { ConsolidationSummary, DecisionItem, ConsolidationRisk, ProposedCondition } from '@/lib/atlas/consolidation'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 10000)}`
}

function j(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue
}

function parseJson<T>(v: Prisma.JsonValue | null | undefined, fallback: T): T {
  if (!v) return fallback
  try {
    return (Array.isArray(v) || typeof v === 'object' ? v : JSON.parse(String(v))) as T
  } catch {
    return fallback
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getConsolidationPack
// ─────────────────────────────────────────────────────────────────────────────

export async function getConsolidationPack(
  budgetSubmissionId: string,
): Promise<ConsolidationSummary | null> {
  const submission = await prisma.budgetSubmission.findUnique({
    where: { budget_submission_id: budgetSubmissionId },
    select: {
      budget_submission_id: true,
      master_trace_id: true,
      total_requested_sar: true,
      entry_route: true,
      record_status: true,
      budget_lines: {
        select: { budget_line_id: true },
      },
      consolidation: {
        select: {
          consolidation_id: true,
          requested_amount_sar: true,
          recommended_amount_sar: true,
          funding_ceiling_sar: true,
          funding_gap_sar: true,
          included_demand_count: true,
          excluded_demand_count: true,
          line_phasing_reconciliation: true,
          accounting_dimensions_check: true,
          unresolved_findings_count: true,
          funding_recommendation_summary: true,
          specific_decision_items: true,
          consolidation_risks: true,
          proposed_conditions: true,
          record_status: true,
          is_locked: true,
        },
      },
    },
  })

  if (!submission) return null

  const con = submission.consolidation

  return {
    consolidation_id: con?.consolidation_id ?? null,
    budget_submission_id: budgetSubmissionId,
    requested_amount_sar: con?.requested_amount_sar
      ? Number(con.requested_amount_sar)
      : submission.total_requested_sar
        ? Number(submission.total_requested_sar)
        : null,
    recommended_amount_sar: con?.recommended_amount_sar
      ? Number(con.recommended_amount_sar)
      : null,
    funding_ceiling_sar: con ? Number(con.funding_ceiling_sar) : 0,
    funding_gap_sar: con ? Number(con.funding_gap_sar) : 0,
    included_demand_count: con?.included_demand_count ?? submission.budget_lines.length,
    excluded_demand_count: con?.excluded_demand_count ?? 0,
    line_phasing_reconciliation: con?.line_phasing_reconciliation ?? null,
    accounting_dimensions_check: con?.accounting_dimensions_check ?? null,
    unresolved_findings_count: con?.unresolved_findings_count ?? 0,
    funding_recommendation_summary: con?.funding_recommendation_summary ?? null,
    specific_decision_items: parseJson<DecisionItem[]>(
      con?.specific_decision_items ?? null,
      [],
    ),
    consolidation_risks: parseJson<ConsolidationRisk[]>(
      con?.consolidation_risks ?? null,
      [],
    ),
    proposed_conditions: parseJson<ProposedCondition[]>(
      con?.proposed_conditions ?? null,
      [],
    ),
    record_status: con?.record_status ?? submission.record_status,
    is_locked: con?.is_locked ?? false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// saveConsolidationPack
// ─────────────────────────────────────────────────────────────────────────────

export type SaveConsolidationPayload = {
  budget_submission_id: string
  funding_recommendation_summary: string
  specific_decision_items: DecisionItem[]
  consolidation_risks: ConsolidationRisk[]
  proposed_conditions: ProposedCondition[]
  recommended_amount_sar?: number | null
  modified_by: string
}

export type SaveConsolidationResult =
  | { ok: true; consolidation_id: string }
  | { ok: false; error: string; code?: string }

/**
 * Upsert CON-018–021 for the given budget submission (PI-03).
 *
 * Creates the BudgetConsolidation row if it does not yet exist.
 * The funding_recommendation_summary (CON-018) is mandatory to save.
 */
export async function saveConsolidationPack(
  payload: SaveConsolidationPayload,
): Promise<SaveConsolidationResult> {
  const { budget_submission_id, modified_by } = payload
  const summary = payload.funding_recommendation_summary?.trim() ?? ''

  if (!budget_submission_id?.trim()) return { ok: false, error: 'budget_submission_id is required.' }
  if (summary.length < 20) {
    return {
      ok: false,
      error: 'Funding recommendation summary (CON-018) is required (minimum 20 characters).',
      code: 'CON-018',
    }
  }

  try {
    const consolidation_id = await prisma.$transaction(async (tx) => {
      const submission = await tx.budgetSubmission.findUnique({
        where: { budget_submission_id },
        select: {
          budget_submission_id: true,
          master_trace_id: true,
          total_requested_sar: true,
          entry_route: true,
          record_status: true,
          is_locked: true,
          consolidation: {
            select: {
              consolidation_id: true,
              is_locked: true,
              funding_ceiling_sar: true,
              funding_gap_sar: true,
              demand_line_reconciliation: true,
            },
          },
        },
      })
      if (!submission) throw new Error(`BudgetSubmission not found: ${budget_submission_id}`)
      if (submission.consolidation?.is_locked) {
        throw new Error('Consolidation pack is locked — budget has been approved at G-B1.')
      }

      const sharedData = {
        funding_recommendation_summary: summary,
        specific_decision_items: j(payload.specific_decision_items),
        consolidation_risks: j(payload.consolidation_risks),
        proposed_conditions: j(payload.proposed_conditions),
        recommended_amount_sar:
          payload.recommended_amount_sar != null
            ? payload.recommended_amount_sar
            : undefined,
        record_status: 'DRAFT',
        modified_by,
      }

      if (submission.consolidation) {
        await tx.budgetConsolidation.update({
          where: { budget_submission_id },
          data: sharedData,
        })
        return submission.consolidation.consolidation_id
      }

      // Create skeleton consolidation
      const consolidation_id = generateId('CON')
      const requested = submission.total_requested_sar
        ? Number(submission.total_requested_sar)
        : 0
      await tx.budgetConsolidation.create({
        data: {
          consolidation_id,
          budget_submission_id,
          master_trace_id: submission.master_trace_id,
          entity_type: 'BUDGET_CONSOLIDATION',
          entry_route: submission.entry_route,
          funding_ceiling_sar: 0,
          funding_gap_sar: 0,
          requested_amount_sar: requested,
          demand_line_reconciliation: 'Pending',
          created_by: modified_by,
          ...sharedData,
        },
      })
      return consolidation_id
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'SAVE_CONSOLIDATION_PACK',
      entity_type: 'BUDGET_CONSOLIDATION',
      entity_id: budget_submission_id,
      active_user_id: modified_by,
      outcome: 'success',
    })

    return { ok: true, consolidation_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save consolidation pack'
    captureException(err, {
      action_type: 'SAVE_CONSOLIDATION_PACK',
      entity_id: budget_submission_id,
      active_user_id: modified_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}
