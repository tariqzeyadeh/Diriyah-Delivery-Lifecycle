import { notFound } from 'next/navigation'
import { DemandWorkspace } from '@/components/atlas/demand/DemandWorkspace'
import { getDemandWorkspace } from '@/src/actions/gates'
import { LifecycleActionsPanel } from '@/components/atlas/lifecycle/LifecycleActionsPanel'

type DemandWorkspacePageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ route?: string; strategy?: string }>
}

function fmtDate(d?: Date | null): string {
  if (!d) return ''
  return d.toISOString().substring(0, 10)
}

function jsonToLines(val: unknown): string {
  if (!val) return ''
  if (Array.isArray(val)) return val.filter(Boolean).join('\n')
  if (typeof val === 'string') return val
  return ''
}

export default async function DemandWorkspacePage({
  params,
  searchParams,
}: DemandWorkspacePageProps) {
  const { id } = await params
  const { route, strategy: strategyFromQuery } = await searchParams
  const demandId = decodeURIComponent(id)

  if (!demandId) notFound()

  const data = await getDemandWorkspace(demandId)

  // Live DB record
  if (data) {
    const { demand, entry_route, strategies } = data
    const objectiveIds = Array.isArray(demand.objective_ids)
      ? (demand.objective_ids as string[])
      : []
    const kpiIds = Array.isArray(demand.kpi_ids) ? (demand.kpi_ids as string[]) : []
    const queriedStrategy =
      strategyFromQuery && strategies.some((s) => s.strategy_id === strategyFromQuery)
        ? strategyFromQuery
        : ''

    return (
      <div className="space-y-6">
      <LifecycleActionsPanel
        entityType="demand"
        entityId={demand.demand_id}
        recordStatus={demand.record_status}
        versionNumber={demand.version_number}
      />
      <DemandWorkspace
        demandId={demand.demand_id}
        masterTraceId={demand.master_trace_id}
        entryRoute={entry_route}
        recordStatus={demand.record_status}
        isLocked={demand.is_locked}
        submittedBy={demand.submitted_by}
        strategies={strategies}
        initialForm={{
          // Identity
          demand_title: demand.demand_title,
          demand_type: demand.demand_type ?? '',
          demand_category: demand.demand_category ?? '',
          demand_subcategory: demand.demand_subcategory ?? '',
          requesting_department_id: demand.requesting_department_id ?? '',
          requester_user_id: demand.requester_user_id ?? '',
          business_owner_user_id: demand.business_owner_user_id ?? '',
          executive_sponsor_user_id: demand.executive_sponsor_user_id ?? '',
          strategic_classification: demand.strategic_classification ?? '',
          origin_channel: demand.origin_channel ?? '',
          mandatory_driver: demand.mandatory_driver ?? '',
          // Business Case
          problem_opportunity_statement: demand.problem_opportunity_statement ?? demand.current_state_description ?? '',
          current_state_description: demand.current_state_description ?? '',
          urgency: demand.urgency ?? 'Medium',
          business_impact: demand.business_impact ?? '',
          do_nothing_impact: demand.do_nothing_impact ?? '',
          business_objectives: jsonToLines(demand.business_objectives),
          expected_outcomes: jsonToLines(demand.expected_outcomes),
          success_criteria: jsonToLines(demand.success_criteria),
          beneficiary_groups: jsonToLines(demand.beneficiary_groups),
          scope_in: demand.scope_in ?? '',
          scope_out: demand.scope_out ?? '',
          high_level_deliverables: jsonToLines(demand.high_level_deliverables),
          // Alignment
          ad_hoc_justification: demand.ad_hoc_justification ?? '',
          strategy_id: demand.strategy_id || queriedStrategy,
          objective_ids: objectiveIds,
          kpi_ids: kpiIds,
          strategic_contribution_statement: demand.strategic_contribution_statement ?? '',
          // Technical
          architecture_impact: demand.architecture_impact ?? false,
          architecture_assessment_summary: demand.architecture_assessment_summary ?? '',
          security_privacy_impact: demand.security_privacy_impact ?? false,
          security_requirements: demand.security_requirements ?? '',
          data_governance_impact: demand.data_governance_impact ?? false,
          hosting_requirement: demand.hosting_requirement ?? '',
          continuity_criticality: demand.continuity_criticality ?? '',
          recovery_time_objective: demand.recovery_time_objective ?? '',
          recovery_point_objective: demand.recovery_point_objective ?? '',
          // Financial
          indicative_one_time_cost_sar: demand.indicative_one_time_cost_sar ? String(demand.indicative_one_time_cost_sar) : '',
          indicative_recurring_cost_sar: demand.indicative_recurring_cost_sar ? String(demand.indicative_recurring_cost_sar) : '',
          tco_sar: demand.tco_sar ? String(demand.tco_sar) : '',
          cost_estimate_basis: demand.cost_estimate_basis ?? '',
          estimate_confidence: demand.estimate_confidence ?? '',
          financial_evaluation_years: demand.financial_evaluation_years ? String(demand.financial_evaluation_years) : '',
          discount_rate_pct: demand.discount_rate_pct ? String(demand.discount_rate_pct) : '',
          npv_sar: demand.npv_sar ? String(demand.npv_sar) : '',
          irr_pct: demand.irr_pct ? String(demand.irr_pct) : '',
          roi_pct: demand.roi_pct ? String(demand.roi_pct) : '',
          payback_period_months: demand.payback_period_months ? String(demand.payback_period_months) : '',
          // Delivery
          requested_start_date: fmtDate(demand.requested_start_date),
          required_by_date: fmtDate(demand.required_by_date),
          delivery_mode: demand.delivery_mode ?? '',
          operating_owner_unit_id: demand.operating_owner_unit_id ?? '',
          support_model: demand.support_model ?? '',
          procurement_required: demand.procurement_required ?? false,
          indicative_sourcing_route: demand.indicative_sourcing_route ?? '',
          preferred_option_id: demand.preferred_option_id ?? '',
          preferred_option_rationale: demand.preferred_option_rationale ?? '',
        }}
        initialOptions={demand.options.map((o) => ({
          local_id: o.option_id,
          option_description: o.option_description ?? o.option_name,
          three_year_cost: o.option_estimated_cost_sar ? Number(o.option_estimated_cost_sar) : 0,
          delivery_time: o.option_delivery_duration ?? '',
          risk_score: o.option_risk_score ? Number(o.option_risk_score) : 0,
          weighted_score: o.option_weighted_score ? Number(o.option_weighted_score) : 0,
          is_do_nothing: o.is_do_nothing ?? false,
        }))}
        initialBenefits={demand.benefits.map((b) => ({
          local_id: b.benefit_id,
          benefit_type: b.benefit_type ?? '',
          benefit_description: b.benefit_description ?? '',
          benefit_baseline: b.benefit_baseline ?? '',
          benefit_target: b.benefit_target ?? '',
          annual_financial_benefit_sar: b.annual_financial_benefit_sar ? Number(b.annual_financial_benefit_sar) : 0,
          benefit_realization_start: fmtDate(b.benefit_realization_start),
          benefit_owner_user_id: b.benefit_owner_user_id ?? '',
          benefit_kpi_id: b.benefit_kpi_id ?? '',
        }))}
        initialRaidc={demand.raidc_items.map((r) => ({
          local_id: r.demand_item_id,
          type: r.type,
          description: r.description,
          owner: r.owner ?? '',
          probability: r.probability ?? 'Medium',
          impact: r.impact ?? 'Medium',
          exposure_score: r.exposure_score ?? '',
          response: r.response ?? '',
          status: r.status ?? 'Open',
          due_date: fmtDate(r.due_date),
        }))}
      />
      </div>
    )
  }

  // Demo / scaffold mode when id is not yet in DB
  const entryRoute = route === 'ADHOC' ? 'ADHOC' : 'STRATEGIC'

  return (
    <DemandWorkspace
      demandId={demandId}
      masterTraceId={`TECH-${new Date().getFullYear()}-DEMO`}
      entryRoute={entryRoute}
      strategies={
        entryRoute === 'STRATEGIC'
          ? [
              {
                strategy_id: 'STR-2027-0001',
                strategy_title: 'Diriyah Digital Operating Model',
                objectives: [
                  {
                    objective_id: 'OBJ-01',
                    objective_name: 'Improve citizen experience',
                    kpis: [
                      { kpi_id: 'KPI-01', kpi_name: 'NPS score' },
                      { kpi_id: 'KPI-02', kpi_name: 'Service cycle time' },
                    ],
                  },
                  {
                    objective_id: 'OBJ-02',
                    objective_name: 'Reduce operating cost',
                    kpis: [{ kpi_id: 'KPI-03', kpi_name: 'Cost per transaction' }],
                  },
                ],
              },
            ]
          : []
      }
      initialForm={{
        demand_title: '',
        demand_type: '',
        demand_category: '',
        demand_subcategory: '',
        requesting_department_id: '',
        requester_user_id: '',
        business_owner_user_id: '',
        executive_sponsor_user_id: '',
        strategic_classification: '',
        origin_channel: '',
        mandatory_driver: '',
        problem_opportunity_statement: '',
        current_state_description: '',
        urgency: 'Medium',
        business_impact: '',
        do_nothing_impact: '',
        business_objectives: '',
        expected_outcomes: '',
        success_criteria: '',
        beneficiary_groups: '',
        scope_in: '',
        scope_out: '',
        high_level_deliverables: '',
        ad_hoc_justification: '',
        strategy_id: entryRoute === 'STRATEGIC' ? 'STR-2027-0001' : '',
        objective_ids: [],
        kpi_ids: [],
        strategic_contribution_statement: '',
        architecture_impact: false,
        architecture_assessment_summary: '',
        security_privacy_impact: false,
        security_requirements: '',
        data_governance_impact: false,
        hosting_requirement: '',
        continuity_criticality: '',
        recovery_time_objective: '',
        recovery_point_objective: '',
        indicative_one_time_cost_sar: '',
        indicative_recurring_cost_sar: '',
        tco_sar: '',
        cost_estimate_basis: '',
        estimate_confidence: '',
        financial_evaluation_years: '',
        discount_rate_pct: '',
        npv_sar: '',
        irr_pct: '',
        roi_pct: '',
        payback_period_months: '',
        requested_start_date: '',
        required_by_date: '',
        delivery_mode: '',
        operating_owner_unit_id: '',
        support_model: '',
        procurement_required: false,
        indicative_sourcing_route: '',
        preferred_option_id: '',
        preferred_option_rationale: '',
      }}
    />
  )
}
