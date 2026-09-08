import { PmoRegistrationGate } from '@/components/atlas/pmo/PmoRegistrationGate'
import { getPmoHandoff } from '@/src/actions/gates'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ stage?: string }>
}

export default async function PmoHandoffPage({ params, searchParams }: Props) {
  const { id } = await params
  const { stage: stageParam } = await searchParams
  const procurementItemId = decodeURIComponent(id)
  const item = await getPmoHandoff(procurementItemId)

  if (item) {
    return (
      <PmoRegistrationGate
        procurementItemId={item.procurement_item_id}
        masterTraceId={item.master_trace_id}
        itemTitle={item.procurement_item_title}
        stage={item.procurement_stage || 'PLANNED'}
        demandTitle={item.demand?.demand_title}
        alreadyRegistered={Boolean(item.project_registration)}
        existingProjectId={item.project_registration?.project_id}
        approvedBudgetSar={item.approved_budget_sar ? Number(item.approved_budget_sar) : null}
        derivedReadiness={item.derived_readiness}
      />
    )
  }

  // Demo mode — use ?stage=DELIVERED to unlock
  const stage = (stageParam || 'IN_SOURCING').toUpperCase()
  return (
    <PmoRegistrationGate
      procurementItemId={procurementItemId}
      masterTraceId={`TECH-${new Date().getFullYear()}-DEMO`}
      itemTitle="Demo Procurement Package"
      stage={stage}
      demandTitle="Demo Demand Case"
    />
  )
}
