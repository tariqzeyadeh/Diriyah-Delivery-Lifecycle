import { Link } from '@/src/i18n/navigation'
import { ProcurementKanban } from '@/components/atlas/procurement/ProcurementKanban'
import { ApprovalGate } from '@/src/components/ApprovalGate'
import { getProcurementBoard } from '@/src/actions/gates'

type Props = {
  params: Promise<{ id: string }>
}

const DEMO_ITEMS = [
  {
    procurement_item_id: 'PIT-2027-0001',
    procurement_item_title: 'Diriyah Platform Licenses',
    procurement_stage: 'PLANNED',
    planned_value_sar: 1200000,
    approved_budget_sar: 1200000,
    vendor_id: null,
  },
  {
    procurement_item_id: 'PIT-2027-0002',
    procurement_item_title: 'Implementation & Integration Services',
    procurement_stage: 'COMPLETED',
    planned_value_sar: 850000,
    approved_budget_sar: 850000,
    vendor_id: 'VND-22',
  },
]

export default async function ProcurementBoardPage({ params }: Props) {
  const { id } = await params
  const budgetSubmissionId = decodeURIComponent(id)
  const board = await getProcurementBoard(budgetSubmissionId)

  const masterTraceId = board?.submission.master_trace_id ?? `TECH-${new Date().getFullYear()}-DEMO`
  const items = board?.items?.length ? board.items : DEMO_ITEMS

  return (
    <div className="space-y-8">
      {/* PI-07 plan header link */}
      <div className="flex justify-end">
        <Link
          href={`/procurement/${encodeURIComponent(budgetSubmissionId)}/plan`}
          className="btn h-9 border-border bg-white px-3 text-xs no-underline"
        >
          Procurement Plan Header →
        </Link>
      </div>
      <ProcurementKanban
        budgetSubmissionId={budgetSubmissionId}
        masterTraceId={masterTraceId}
        initialItems={items}
      />
      <ApprovalGate
        entityType="BUDGET_SUBMISSION"
        entityId={budgetSubmissionId}
        masterTraceId={masterTraceId}
        gateCode="G-B1"
        title="Budget / Procurement Gate — Evidence & Approval"
        approverUserId="mohammed.alnuaimi"
      />
    </div>
  )
}
