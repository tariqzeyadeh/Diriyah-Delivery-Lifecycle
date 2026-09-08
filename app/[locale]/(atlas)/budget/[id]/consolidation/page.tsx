import { notFound } from 'next/navigation'
import { getConsolidationPack } from '@/src/actions/consolidation'
import { ConsolidationPackWorkspace } from '@/components/atlas/budget/ConsolidationPackWorkspace'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ConsolidationPackPage({ params }: Props) {
  const { id } = await params
  const pack = await getConsolidationPack(id)
  if (!pack) notFound()

  return <ConsolidationPackWorkspace pack={pack} budgetSubmissionId={id} />
}
