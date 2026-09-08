import { notFound } from 'next/navigation'
import { getDemandValidationDetail } from '@/src/actions/demand-validation'
import { DemandValidationWorkspace } from '@/components/atlas/demand/DemandValidationWorkspace'

type Props = {
  params: Promise<{ id: string }>
}

export default async function DemandValidateDetailPage({ params }: Props) {
  const { id } = await params
  const detail = await getDemandValidationDetail(id)
  if (!detail) notFound()

  return <DemandValidationWorkspace detail={detail} />
}
