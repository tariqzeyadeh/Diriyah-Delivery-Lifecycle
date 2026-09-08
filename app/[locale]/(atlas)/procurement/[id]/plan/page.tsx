import { notFound } from 'next/navigation'
import { getProcurementPlanHeader } from '@/src/actions/procurement'
import { ProcurementPlanHeaderForm } from '@/components/atlas/procurement/ProcurementPlanHeaderForm'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ProcurementPlanPage({ params }: Props) {
  const { id } = await params
  const plan = await getProcurementPlanHeader(id)
  if (!plan) notFound()

  return <ProcurementPlanHeaderForm plan={plan} />
}
