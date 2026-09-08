import { BudgetLinesWorkspace } from '@/components/atlas/budget/BudgetLinesWorkspace'
import { getBudgetLines } from '@/src/actions/budget'
import { LifecycleActionsPanel } from '@/components/atlas/lifecycle/LifecycleActionsPanel'

type BudgetLinesPageProps = {
  params: Promise<{ id: string }>
}

export default async function BudgetLinesPage({ params }: BudgetLinesPageProps) {
  const { id } = await params
  const budgetSubmissionId = decodeURIComponent(id)
  const submission = await getBudgetLines(budgetSubmissionId)

  return (
    <div className="space-y-6">
    <LifecycleActionsPanel
      entityType="budget"
      entityId={budgetSubmissionId}
      recordStatus={submission?.record_status}
      versionNumber={submission?.version_number}
    />
    <BudgetLinesWorkspace
      budgetSubmissionId={budgetSubmissionId}
      masterTraceId={submission?.master_trace_id ?? `TECH-${new Date().getFullYear()}-DEMO`}
      strategyTitle={submission?.strategy?.strategy_title ?? null}
      recordStatus={submission?.record_status ?? null}
      isLocked={submission?.is_locked ?? false}
      initialHeader={
        submission
          ? {
              budget_cycle: submission.budget_cycle ?? '',
              budget_scenario: submission.budget_scenario ?? 'Baseline',
              planning_start_fy: submission.planning_start_fy ? String(submission.planning_start_fy) : '',
              planning_end_fy: submission.planning_end_fy ? String(submission.planning_end_fy) : '',
              funding_ceiling_sar: submission.funding_ceiling_sar ? String(submission.funding_ceiling_sar) : '',
              base_currency: submission.base_currency ?? 'SAR',
              budget_owner_user_id: submission.budget_owner_user_id ?? '',
            }
          : undefined
      }
      initialLines={submission?.budget_lines}
    />
    </div>
  )
}
