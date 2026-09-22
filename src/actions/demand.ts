'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { randomInt } from 'crypto'
import { EntryRoute, Prisma, VersionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Coerce a nullable JSON value to Prisma.JsonNull so Json? fields accept it. */
function j<T>(v: T | null | undefined): T | typeof Prisma.JsonNull {
  return v !== null && v !== undefined ? v : Prisma.JsonNull
}
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'
import { triggeredReviewTypes } from '@/lib/atlas/demand-reviews'
import { openDemandReviewTasks } from '@/src/lib/demand-review-ops'
import { getServerRole, requireRole } from '@/src/lib/auth/server-guard'
import { checkDocumentPack } from '@/lib/atlas/document-pack'
import { DEMAND_AWAITING_OWNER, isDemandAwaitingOwner } from '@/lib/atlas/demand-handoff'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DemandOptionInput = {
  option_id?: string
  option_name: string
  option_description?: string
  option_estimated_cost_sar?: number
  option_delivery_duration?: string
  option_benefits_score?: number
  option_risk_score?: number
  option_weighted_score?: number
  recommendation_status?: string
  is_do_nothing?: boolean  // BR-017
}

export type DemandBenefitInput = {
  benefit_id?: string
  benefit_type?: string
  benefit_description?: string
  benefit_baseline?: string
  benefit_target?: string
  annual_financial_benefit_sar?: number
  benefit_realization_start?: string
  benefit_owner_user_id?: string
  benefit_kpi_id?: string
}

export type DemandRaidcInput = {
  demand_item_id?: string
  type: 'RISK' | 'ISSUE' | 'ASSUMPTION' | 'DEPENDENCY' | 'CONSTRAINT'
  description: string
  owner?: string
  probability?: string
  impact?: string
  exposure_score?: string
  response?: string
  status?: string
  due_date?: string
}

export type SaveDemandPayload = {
  demand_id: string
  // Identity
  demand_title: string
  demand_type?: string
  demand_category?: string
  demand_subcategory?: string
  requesting_department_id?: string
  requester_user_id?: string
  business_owner_user_id?: string
  executive_sponsor_user_id?: string
  // Routing
  strategic_classification?: string
  origin_channel?: string
  strategy_id?: string
  objective_ids?: string[]
  kpi_ids?: string[]
  strategic_contribution_statement?: string
  ad_hoc_justification?: string
  mandatory_driver?: string
  // Business Case
  problem_opportunity_statement?: string
  current_state_description?: string
  baseline_evidence?: object[]
  do_nothing_impact?: string
  business_objectives?: string[]
  expected_outcomes?: string[]
  success_criteria?: string[]
  beneficiary_groups?: string[]
  expected_volume?: object
  scope_in?: string
  scope_out?: string
  high_level_deliverables?: string[]
  // Technical requirements
  business_requirements?: object[]
  service_level_requirements?: object[]
  acceptance_criteria?: object[]
  integration_requirements?: object[]
  data_requirements?: object[]
  reporting_requirements?: object[]
  architecture_impact?: boolean
  architecture_assessment_summary?: string
  security_privacy_impact?: boolean
  security_requirements?: string
  data_governance_impact?: boolean
  hosting_requirement?: string
  continuity_criticality?: string
  recovery_time_objective?: string
  recovery_point_objective?: string
  // Financial analysis
  preferred_option_id?: string
  preferred_option_rationale?: string
  indicative_one_time_cost_sar?: number
  indicative_recurring_cost_sar?: number
  tco_sar?: number
  cost_estimate_basis?: string
  estimate_confidence?: string
  financial_evaluation_years?: number
  discount_rate_pct?: number
  npv_sar?: number
  irr_pct?: number
  roi_pct?: number
  payback_period_months?: number
  // Delivery
  requested_start_date?: string
  required_by_date?: string
  key_milestones?: object[]
  urgency?: string
  business_impact?: string
  priority_score?: number
  delivery_mode?: string
  resource_requirements?: object[]
  operating_owner_unit_id?: string
  support_model?: string
  procurement_required?: boolean
  indicative_sourcing_route?: string
  existing_contract_id?: string
  // Social
  stakeholders?: object[]
  // Child entities
  options?: DemandOptionInput[]
  benefits?: DemandBenefitInput[]
  raidc_items?: DemandRaidcInput[]
  // Actor
  modified_by: string
}

export type SaveDemandResult =
  | { ok: true; demand_id: string }
  | { ok: false; error: string }

export type SubmitDemandPayload = {
  demand_id: string
  submitted_by: string
}

export type SubmitDemandResult =
  | { ok: true; demand_id: string; review_gates: string[]; awaiting_owner?: boolean }
  | { ok: false; error: string; code?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 10000)}`
}

function generateMasterTraceId(): string {
  return `TECH-${new Date().getFullYear()}-${randomInt(1000, 10000)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// saveDemand
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upserts a Demand record and its child Options, Benefits, and RAIDC items.
 * Enforces: is_locked check, master_trace_id ownership.
 * Does NOT lock — that happens at submitDemand().
 */
export async function saveDemand(
  payload: SaveDemandPayload,
): Promise<SaveDemandResult> {
  const { demand_id, modified_by } = payload

  if (!demand_id?.trim()) return { ok: false, error: 'demand_id is required.' }
  if (!payload.demand_title?.trim()) return { ok: false, error: 'demand_title is required.' }

  try {
    const role = (await getServerRole()) ?? 'CTO Office'
    await prisma.$transaction(
      async (tx) => {
      const existing = await tx.demand.findUnique({ where: { demand_id } })
      if (!existing) throw new Error(`Demand not found: ${demand_id}`)
      if (existing.is_locked) throw new Error('Demand is locked — submit a revision request.')
      if (isDemandAwaitingOwner(existing.record_status) && role !== 'Business Owner') {
        throw new Error(
          'This demand is with the Business Owner. Only they can add to it and submit.',
        )
      }

      const strategyId = payload.strategy_id?.trim() || null
      const previousTraceId = existing.master_trace_id
      let targetTraceId = previousTraceId
      let entryRoute = strategyId ? EntryRoute.STRATEGIC : EntryRoute.ADHOC

      if (strategyId) {
        const strategy = await tx.strategy.findUnique({
          where: { strategy_id: strategyId },
          select: { master_trace_id: true, record_status: true },
        })
        if (!strategy) throw new Error(`Selected strategy was not found: ${strategyId}`)
        if (strategy.record_status !== 'APPROVED' && strategy.record_status !== 'APPROVED_COND') {
          throw new Error('Linked strategy must be approved at G-S1 before it can be selected.')
        }
        targetTraceId = strategy.master_trace_id
        entryRoute = EntryRoute.STRATEGIC
      } else {
        const previousSpine = await tx.masterTrace.findUnique({
          where: { master_trace_id: previousTraceId },
          select: { strategies: { select: { strategy_id: true }, take: 1 } },
        })
        const onStrategySpine = (previousSpine?.strategies.length ?? 0) > 0
        if (onStrategySpine) {
          let created = generateMasterTraceId()
          for (let attempt = 0; attempt < 8; attempt++) {
            const clash = await tx.masterTrace.findUnique({
              where: { master_trace_id: created },
              select: { master_trace_id: true },
            })
            if (!clash) break
            created = generateMasterTraceId()
          }
          await tx.masterTrace.create({
            data: {
              master_trace_id: created,
              entry_route: EntryRoute.ADHOC,
              created_by: modified_by,
            },
          })
          targetTraceId = created
        } else {
          await tx.masterTrace.update({
            where: { master_trace_id: previousTraceId },
            data: { entry_route: EntryRoute.ADHOC },
          })
        }
        entryRoute = EntryRoute.ADHOC
      }

      if (targetTraceId !== previousTraceId) {
        await tx.demandOption.updateMany({
          where: { demand_id },
          data: { master_trace_id: targetTraceId, entry_route: entryRoute },
        })
        await tx.demandBenefit.updateMany({
          where: { demand_id },
          data: { master_trace_id: targetTraceId, entry_route: entryRoute },
        })
        await tx.demandRaidc.updateMany({
          where: { demand_id },
          data: { master_trace_id: targetTraceId, entry_route: entryRoute },
        })
        await tx.budgetSubmission.updateMany({
          where: { parent_record_id: demand_id },
          data: {
            master_trace_id: targetTraceId,
            entry_route: entryRoute,
            strategy_id: strategyId,
          },
        })

        const leftover = await tx.demand.count({
          where: { master_trace_id: previousTraceId, demand_id: { not: demand_id } },
        })
        const leftoverStrategy = await tx.strategy.count({ where: { master_trace_id: previousTraceId } })
        const leftoverBudget = await tx.budgetSubmission.count({
          where: { master_trace_id: previousTraceId },
        })
        if (leftover === 0 && leftoverStrategy === 0 && leftoverBudget === 0) {
          await tx.masterTrace.update({
            where: { master_trace_id: previousTraceId },
            data: { is_active: false },
          })
        }
      }

      // Update Demand core fields
      await tx.demand.update({
        where: { demand_id },
        data: {
          demand_title: payload.demand_title.slice(0, 255),
          master_trace_id: targetTraceId,
          parent_record_id: strategyId,
          entry_route: entryRoute,
          demand_type: payload.demand_type ?? null,
          demand_category: payload.demand_category ?? null,
          demand_subcategory: payload.demand_subcategory ?? null,
          requesting_department_id: payload.requesting_department_id ?? null,
          requester_user_id: payload.requester_user_id ?? null,
          business_owner_user_id: payload.business_owner_user_id ?? null,
          executive_sponsor_user_id: payload.executive_sponsor_user_id ?? null,
          strategic_classification: payload.strategic_classification ?? null,
          origin_channel: payload.origin_channel ?? null,
          strategy_id: strategyId,
          objective_ids: j(strategyId ? payload.objective_ids : []),
          kpi_ids: j(strategyId ? payload.kpi_ids : []),
          strategic_contribution_statement: payload.strategic_contribution_statement ?? null,
          ad_hoc_justification: payload.ad_hoc_justification ?? null,
          mandatory_driver: payload.mandatory_driver ?? null,
          problem_opportunity_statement: payload.problem_opportunity_statement ?? null,
          current_state_description: payload.current_state_description ?? null,
          baseline_evidence: j(payload.baseline_evidence),
          do_nothing_impact: payload.do_nothing_impact ?? null,
          business_objectives: j(payload.business_objectives),
          expected_outcomes: j(payload.expected_outcomes),
          success_criteria: j(payload.success_criteria),
          beneficiary_groups: j(payload.beneficiary_groups),
          expected_volume: j(payload.expected_volume),
          scope_in: payload.scope_in ?? null,
          scope_out: payload.scope_out ?? null,
          high_level_deliverables: j(payload.high_level_deliverables),
          business_requirements: j(payload.business_requirements),
          service_level_requirements: j(payload.service_level_requirements),
          acceptance_criteria: j(payload.acceptance_criteria),
          integration_requirements: j(payload.integration_requirements),
          data_requirements: j(payload.data_requirements),
          reporting_requirements: j(payload.reporting_requirements),
          architecture_impact: payload.architecture_impact ?? null,
          architecture_assessment_summary: payload.architecture_assessment_summary ?? null,
          security_privacy_impact: payload.security_privacy_impact ?? null,
          security_requirements: payload.security_requirements ?? null,
          data_governance_impact: payload.data_governance_impact ?? null,
          hosting_requirement: payload.hosting_requirement ?? null,
          continuity_criticality: payload.continuity_criticality ?? null,
          recovery_time_objective: payload.recovery_time_objective ?? null,
          recovery_point_objective: payload.recovery_point_objective ?? null,
          preferred_option_id: payload.preferred_option_id ?? null,
          preferred_option_rationale: payload.preferred_option_rationale ?? null,
          indicative_one_time_cost_sar: payload.indicative_one_time_cost_sar ?? null,
          indicative_recurring_cost_sar: payload.indicative_recurring_cost_sar ?? null,
          tco_sar: payload.tco_sar ?? null,
          cost_estimate_basis: payload.cost_estimate_basis ?? null,
          estimate_confidence: payload.estimate_confidence ?? null,
          financial_evaluation_years: payload.financial_evaluation_years ?? null,
          discount_rate_pct: payload.discount_rate_pct ?? null,
          npv_sar: payload.npv_sar ?? null,
          irr_pct: payload.irr_pct ?? null,
          roi_pct: payload.roi_pct ?? null,
          payback_period_months: payload.payback_period_months ?? null,
          requested_start_date: payload.requested_start_date ? new Date(payload.requested_start_date) : null,
          required_by_date: payload.required_by_date ? new Date(payload.required_by_date) : null,
          key_milestones: j(payload.key_milestones),
          urgency: payload.urgency ?? null,
          business_impact: payload.business_impact ?? null,
          priority_score: payload.priority_score ?? null,
          delivery_mode: payload.delivery_mode ?? null,
          resource_requirements: j(payload.resource_requirements),
          operating_owner_unit_id: payload.operating_owner_unit_id ?? null,
          support_model: payload.support_model ?? null,
          procurement_required: payload.procurement_required ?? null,
          indicative_sourcing_route: payload.indicative_sourcing_route ?? null,
          existing_contract_id: payload.existing_contract_id ?? null,
          stakeholders: j(payload.stakeholders),
          record_status: existing.record_status === 'RETURNED' ? 'DRAFT' : existing.record_status,
          modified_by,
        },
      })

      // Sync DemandOptions (empty array clears placeholder rows)
      if (payload.options) {
        const keepIds = new Set<string>()
        for (const opt of payload.options) {
          const option_id = opt.option_id ?? generateId('OPT')
          keepIds.add(option_id)
          await tx.demandOption.upsert({
            where: { option_id },
            create: {
              option_id,
              demand_id,
              option_name: opt.option_name.slice(0, 255),
              option_description: opt.option_description ?? null,
              option_estimated_cost_sar: opt.option_estimated_cost_sar ?? null,
              option_delivery_duration: opt.option_delivery_duration ?? null,
              option_benefits_score: opt.option_benefits_score ?? null,
              option_risk_score: opt.option_risk_score ?? null,
              option_weighted_score: opt.option_weighted_score ?? null,
              recommendation_status: opt.recommendation_status ?? null,
              is_do_nothing: opt.is_do_nothing ?? false,
              master_trace_id: targetTraceId,
              entity_type: 'DEMAND_OPTION',
              entry_route: entryRoute,
              created_by: modified_by,
            },
            update: {
              option_name: opt.option_name.slice(0, 255),
              option_description: opt.option_description ?? null,
              option_estimated_cost_sar: opt.option_estimated_cost_sar ?? null,
              option_delivery_duration: opt.option_delivery_duration ?? null,
              option_benefits_score: opt.option_benefits_score ?? null,
              option_risk_score: opt.option_risk_score ?? null,
              option_weighted_score: opt.option_weighted_score ?? null,
              recommendation_status: opt.recommendation_status ?? null,
              is_do_nothing: opt.is_do_nothing ?? false,
              modified_by,
            },
          })
        }
        await tx.demandOption.deleteMany({
          where: keepIds.size
            ? { demand_id, option_id: { notIn: [...keepIds] } }
            : { demand_id },
        })
      }

      // Upsert DemandBenefits
      if (payload.benefits?.length) {
        for (const ben of payload.benefits) {
          const benefit_id = ben.benefit_id ?? generateId('BEN')
          await tx.demandBenefit.upsert({
            where: { benefit_id },
            create: {
              benefit_id,
              demand_id,
              benefit_type: ben.benefit_type ?? null,
              benefit_description: ben.benefit_description ?? null,
              benefit_baseline: ben.benefit_baseline ?? null,
              benefit_target: ben.benefit_target ?? null,
              annual_financial_benefit_sar: ben.annual_financial_benefit_sar ?? null,
              benefit_realization_start: ben.benefit_realization_start ? new Date(ben.benefit_realization_start) : null,
              benefit_owner_user_id: ben.benefit_owner_user_id ?? null,
              benefit_kpi_id: ben.benefit_kpi_id ?? null,
              master_trace_id: targetTraceId,
              entity_type: 'DEMAND_BENEFIT',
              entry_route: entryRoute,
              created_by: modified_by,
            },
            update: {
              benefit_type: ben.benefit_type ?? null,
              benefit_description: ben.benefit_description ?? null,
              benefit_baseline: ben.benefit_baseline ?? null,
              benefit_target: ben.benefit_target ?? null,
              annual_financial_benefit_sar: ben.annual_financial_benefit_sar ?? null,
              benefit_realization_start: ben.benefit_realization_start ? new Date(ben.benefit_realization_start) : null,
              benefit_owner_user_id: ben.benefit_owner_user_id ?? null,
              benefit_kpi_id: ben.benefit_kpi_id ?? null,
              modified_by,
            },
          })
        }
      }

      // Upsert RAIDC items
      if (payload.raidc_items?.length) {
        for (const item of payload.raidc_items) {
          const demand_item_id = item.demand_item_id ?? generateId('DRD')
          await tx.demandRaidc.upsert({
            where: { demand_item_id },
            create: {
              demand_item_id,
              demand_id,
              type: item.type,
              description: item.description,
              owner: item.owner ?? null,
              probability: item.probability ?? null,
              impact: item.impact ?? null,
              exposure_score: item.exposure_score ?? null,
              response: item.response ?? null,
              status: item.status ?? null,
              due_date: item.due_date ? new Date(item.due_date) : null,
              master_trace_id: targetTraceId,
              entity_type: 'DEMAND_RAIDC',
              entry_route: entryRoute,
              created_by: modified_by,
            },
            update: {
              type: item.type,
              description: item.description,
              owner: item.owner ?? null,
              probability: item.probability ?? null,
              impact: item.impact ?? null,
              exposure_score: item.exposure_score ?? null,
              response: item.response ?? null,
              status: item.status ?? null,
              due_date: item.due_date ? new Date(item.due_date) : null,
              modified_by,
            },
          })
        }
      }
    },
      { maxWait: 15_000, timeout: 60_000 },
    )

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'SAVE_DEMAND',
      entity_type: 'DEMAND',
      entity_id: demand_id,
      active_user_id: modified_by,
      outcome: 'success',
    })

    return { ok: true, demand_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save demand'
    captureException(err, {
      action_type: 'SAVE_DEMAND',
      entity_id: demand_id,
      active_user_id: modified_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// submitDemand
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submits a Demand Business Case.
 *
 * Non–Business Owner creators do a preliminary handoff (AWAITING_OWNER): no BR-017,
 * no record lock, no reviews, no budget. Only the Business Owner then edits and
 * performs the final submit (BR-016 / BR-017, lock, reviews, budget draft).
 */
export async function submitDemand(
  payload: SubmitDemandPayload,
): Promise<SubmitDemandResult> {
  const rbac = await requireRole('Business Owner', 'CTO Office', 'Strategy & Governance')
  if (rbac) return rbac

  const { demand_id, submitted_by } = payload
  const role = (await getServerRole()) ?? 'CTO Office'
  const isOwner = role === 'Business Owner'

  if (!demand_id?.trim()) return { ok: false, error: 'demand_id is required.' }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const demand = await tx.demand.findUnique({
        where: { demand_id },
        include: {
          options: { select: { option_id: true, is_do_nothing: true } },
          master_trace: { select: { entry_route: true } },
        },
      })

      if (!demand) throw new Error(`Demand not found: ${demand_id}`)
      if (demand.is_locked) throw new Error('Demand is locked — submit a revision request.')
      if (
        demand.record_status === 'SUBMITTED' ||
        demand.record_status === 'UNDER_REVIEW' ||
        demand.record_status === 'UNDER_VALIDATION'
      ) {
        throw new Error('Demand is already submitted.')
      }

      if (!demand.demand_title?.trim()) {
        throw Object.assign(new Error('BR-016: demand_title is required.'), { code: 'BR-016' })
      }
      if (!demand.problem_opportunity_statement?.trim()) {
        throw Object.assign(
          new Error('BR-016: Problem / opportunity statement is required before submission.'),
          { code: 'BR-016' },
        )
      }

      const now = new Date()

      if (!isOwner) {
        if (isDemandAwaitingOwner(demand.record_status)) {
          throw new Error('This demand is already with the Business Owner.')
        }
        await tx.demand.update({
          where: { demand_id },
          data: {
            record_status: DEMAND_AWAITING_OWNER,
            current_stage_code: 'PI-04',
            submitted_by,
            submitted_at: now,
            modified_by: submitted_by,
            is_locked: false,
          },
        })
        return { demand_id, review_gates: [] as string[], awaiting_owner: true }
      }

      // G-17: the Demand workspace *is* the business case (Business Case tab).
      const attachedTypes = await tx.attachment.findMany({
        where: { master_trace_id: demand.master_trace_id ?? '' },
        select: { document_type: true },
      })
      const presentTypes = attachedTypes.map((a) => a.document_type)
      if (demand.problem_opportunity_statement?.trim() && !presentTypes.includes('BUSINESS_CASE')) {
        presentTypes.push('BUSINESS_CASE')
      }
      const docError = checkDocumentPack('DEMAND', 'SUBMIT', presentTypes)
      if (docError) {
        throw Object.assign(
          new Error(
            'Complete the Business Case tab (problem / opportunity statement) before submitting.',
          ),
          { code: 'BR-017b' },
        )
      }

      const hasDoNothing = demand.options.some((o) => o.is_do_nothing === true)
      if (!hasDoNothing && demand.options.length > 0) {
        throw Object.assign(
          new Error(
            'BR-017: Business case must include a do-nothing / base-case option. Mark one option as "Do Nothing".',
          ),
          { code: 'BR-017' },
        )
      }

      const reviewTypes = triggeredReviewTypes(demand)
      const hasReviews = reviewTypes.length > 0

      await tx.demand.update({
        where: { demand_id },
        data: {
          record_status: hasReviews ? 'UNDER_REVIEW' : 'SUBMITTED',
          version_status: VersionStatus.SUBMITTED,
          current_stage_code: hasReviews ? 'PI-05' : 'PI-06',
          approval_status: 'PENDING',
          is_locked: true,
          submitted_by,
          submitted_at: now,
          modified_by: submitted_by,
        },
      })

      const opened = hasReviews
        ? await openDemandReviewTasks(
            tx,
            {
              demand_id: demand.demand_id,
              master_trace_id: demand.master_trace_id,
              version_number: demand.version_number,
              architecture_impact: demand.architecture_impact,
              security_privacy_impact: demand.security_privacy_impact,
              data_governance_impact: demand.data_governance_impact,
            },
            submitted_by,
          )
        : []

      const existingBudget = await tx.budgetSubmission.findFirst({
        where: { parent_record_id: demand.demand_id },
        select: { budget_submission_id: true },
      })
      if (!existingBudget) {
        await tx.budgetSubmission.create({
          data: {
            budget_submission_id: generateId('BUD'),
            master_trace_id: demand.master_trace_id,
            strategy_id: demand.strategy_id,
            entity_type: 'BUDGET_SUBMISSION',
            entry_route: demand.entry_route,
            record_status: 'DRAFT',
            parent_record_id: demand.demand_id,
            budget_cycle: 'Annual Plan',
            budget_scenario: 'Requested',
            base_currency: 'SAR',
            is_locked: false,
            created_by: submitted_by,
            version_number: 1,
          },
        })
      }

      return { demand_id, review_gates: opened, awaiting_owner: false }
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    for (const locale of ['en', 'ar'] as const) {
      revalidatePath(`/${locale}/budget`)
      revalidatePath(`/${locale}/demand`)
    }
    auditLog({
      action_type: result.awaiting_owner ? 'HANDOFF_DEMAND' : 'SUBMIT_DEMAND',
      entity_type: 'DEMAND',
      entity_id: demand_id,
      active_user_id: submitted_by,
      outcome: 'success',
    })

    return {
      ok: true,
      demand_id: result.demand_id,
      review_gates: result.review_gates,
      awaiting_owner: result.awaiting_owner,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit demand'
    const code = (err as { code?: string }).code
    captureException(err, {
      action_type: 'SUBMIT_DEMAND',
      entity_id: demand_id,
      active_user_id: submitted_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message, code }
  }
}


