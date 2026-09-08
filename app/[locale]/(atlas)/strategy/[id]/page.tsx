import { notFound } from 'next/navigation'
import { StrategyWorkspace } from '@/components/atlas/strategy/StrategyWorkspace'
import { getStrategyWorkspace } from '@/src/actions/strategy'
import { LifecycleActionsPanel } from '@/components/atlas/lifecycle/LifecycleActionsPanel'
import { OfficialTag, SummaryCard } from '@/components/atlas/records'
import { recordStatusTagTone, sentenceCaseLabel } from '@/lib/atlas/record-label'

type StrategyWorkspacePageProps = {
  params: Promise<{ id: string }>
}

export default async function StrategyWorkspacePage({ params }: StrategyWorkspacePageProps) {
  const { id } = await params
  const strategyId = decodeURIComponent(id)

  if (!strategyId) notFound()

  // Load live DB data
  const data = await getStrategyWorkspace(strategyId)

  if (data) {
    return (
      <div className="space-y-6">
      <LifecycleActionsPanel
        entityType="strategy"
        entityId={data.strategy_id}
        recordStatus={data.record_status}
        versionNumber={data.version_number}
      />
      {/* G-05: Parallel-branch tracker — shows Demand + Budget cards once G-S1 fires */}
      {(data.record_status === 'APPROVED' || data.record_status === 'RETURNED') && (
        data.demands.length > 0 || data.budget_submissions.length > 0
      ) && (
        <div className="rounded-md border border-border bg-white p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-diriyah-accent">
            G-S1 approved — parallel tracks active
          </p>
          <p className="mb-3 text-xs text-text-muted">
            Demand Case and Budget Envelope were released simultaneously after CTO approval.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.demands.map((d) => (
              <li key={d.demand_id}>
                <SummaryCard
                  eyebrow={d.demand_id}
                  title={d.demand_title}
                  tag={
                    <OfficialTag tone={recordStatusTagTone(d.record_status)}>
                      {sentenceCaseLabel(d.record_status)}
                    </OfficialTag>
                  }
                  items={[
                    {
                      label: 'Track A · Demand',
                      value:
                        d.completeness_score_pct != null
                          ? `${Number(d.completeness_score_pct)}% complete`
                          : '—',
                    },
                  ]}
                  action={{
                    href: `/demand/${encodeURIComponent(d.demand_id)}`,
                    label: 'Open demand',
                  }}
                />
              </li>
            ))}
            {data.budget_submissions.map((b) => (
              <li key={b.budget_submission_id}>
                <SummaryCard
                  eyebrow={b.budget_submission_id}
                  title={b.budget_cycle ?? 'Annual plan'}
                  tag={
                    <OfficialTag tone={recordStatusTagTone(b.record_status)}>
                      {sentenceCaseLabel(b.record_status)}
                    </OfficialTag>
                  }
                  items={[
                    {
                      label: 'Track B · Budget',
                      value:
                        b.total_requested_sar != null
                          ? `SAR ${Number(b.total_requested_sar).toLocaleString('en-SA')}`
                          : '—',
                    },
                  ]}
                  action={{
                    href: `/budget/${encodeURIComponent(b.budget_submission_id)}/lines`,
                    label: 'Open lines',
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <StrategyWorkspace
        strategyId={data.strategy_id}
        masterTraceId={data.master_trace_id}
        initialData={{
          strategyId: data.strategy_id,
          masterTraceId: data.master_trace_id,
          // General
          strategy_title: data.strategy_title,
          strategy_type: data.strategy_type,
          baseline_fiscal_year: data.baseline_fiscal_year,
          horizon_start_date: data.horizon_start_date?.toISOString() ?? null,
          horizon_end_date: data.horizon_end_date?.toISOString() ?? null,
          review_frequency: data.review_frequency,
          requested_effective_date: data.requested_effective_date?.toISOString() ?? null,
          executive_sponsor_user_id: data.executive_sponsor_user_id,
          strategy_owner_user_id: data.strategy_owner_user_id,
          performance_manager_user_id: data.performance_manager_user_id,
          // Context
          mandate_statement: data.mandate_statement,
          vision_statement: data.vision_statement,
          mission_statement: data.mission_statement,
          executive_summary: data.executive_summary,
          strategic_drivers: data.strategic_drivers,
          current_state_summary: data.current_state_summary,
          trend_summary: data.trend_summary,
          swot_summary: data.swot_summary,
          target_state_description: data.target_state_description,
          // Scope
          scope_in: data.scope_in,
          scope_out: data.scope_out,
          target_beneficiaries: data.target_beneficiaries,
          strategic_priorities: data.strategic_priorities,
          key_outcomes: data.key_outcomes,
          // Finance
          funding_envelope: data.funding_envelope ? Number(data.funding_envelope) : null,
          currency_code: data.currency_code,
          indicative_capex: data.indicative_capex ? Number(data.indicative_capex) : null,
          indicative_opex: data.indicative_opex ? Number(data.indicative_opex) : null,
          funding_source: data.funding_source,
          // Governance
          performance_reporting_frequency: data.performance_reporting_frequency,
          decision_forums: data.decision_forums,
          key_assumptions: data.key_assumptions,
          key_constraints: data.key_constraints,
          strategic_risks: data.strategic_risks,
          // Status
          record_status: data.record_status,
          is_locked: data.is_locked,
          // Objectives
          objectives: data.objectives.map((o) => ({
            objective_id: o.objective_id,
            objective_name: o.objective_name,
            bsc_perspective: o.bsc_perspective,
            objective_priority: o.objective_priority,
            objective_weight_pct: o.objective_weight_pct ? Number(o.objective_weight_pct) : null,
            objective_description: o.objective_description,
            intended_outcome: o.intended_outcome,
            objective_start_date: o.objective_start_date?.toISOString() ?? null,
            objective_end_date: o.objective_end_date?.toISOString() ?? null,
            objective_owner_user_id: o.objective_owner_user_id,
            baseline_narrative: o.baseline_narrative,
            kpis: o.kpis.map((k) => ({
              kpi_id: k.kpi_id,
              kpi_name: k.kpi_name,
              unit_of_measure: k.unit_of_measure,
              kpi_type: k.kpi_type,
              kpi_weight_pct: k.kpi_weight_pct ? Number(k.kpi_weight_pct) : null,
              green_threshold: k.green_threshold,
              amber_threshold: k.amber_threshold,
            })),
          })),
        }}
      />
      </div>
    )
  }

  // Strategy ID exists in URL but not yet in DB (race on first render after creation)
  return (
    <StrategyWorkspace
      strategyId={strategyId}
      masterTraceId=""
    />
  )
}
