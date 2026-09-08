/**
 * Client-safe types for the Budget Consolidation Pack (PI-03 / CON-018–021).
 * No server imports.
 */

// ── Repeatable item shapes ────────────────────────────────────────────────────

export type DecisionItem = {
  item_id: string
  description: string
  amount_impact_sar: number | null
  status: 'PENDING' | 'APPROVED' | 'DEFERRED' | 'REJECTED'
}

export type ConsolidationRisk = {
  risk_id: string
  description: string
  probability: 'Low' | 'Medium' | 'High'
  impact: 'Low' | 'Medium' | 'High'
  mitigation: string
}

export type ProposedCondition = {
  condition_id: string
  condition_text: string
  owner: string
  due_date: string | null // ISO date string
}

// ── Summary (CON-002–017, read-only) ─────────────────────────────────────────

export type ConsolidationSummary = {
  consolidation_id: string | null
  budget_submission_id: string
  requested_amount_sar: number | null
  recommended_amount_sar: number | null
  funding_ceiling_sar: number
  funding_gap_sar: number
  included_demand_count: number
  excluded_demand_count: number
  line_phasing_reconciliation: string | null // Pass | Fail
  accounting_dimensions_check: string | null // Pass | Warning | Fail
  unresolved_findings_count: number
  // CON-018–021
  funding_recommendation_summary: string | null
  specific_decision_items: DecisionItem[]
  consolidation_risks: ConsolidationRisk[]
  proposed_conditions: ProposedCondition[]
  // meta
  record_status: string | null
  is_locked: boolean
}
