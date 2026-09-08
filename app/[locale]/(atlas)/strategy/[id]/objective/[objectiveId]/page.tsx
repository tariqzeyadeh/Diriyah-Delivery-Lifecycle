import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getObjectiveDetail } from '@/src/actions/strategy'
import { ObjectiveDetailWorkspace } from '@/components/atlas/strategy/ObjectiveDetailWorkspace'

type Props = {
  params: Promise<{ id: string; objectiveId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { objectiveId } = await params
  const obj = await getObjectiveDetail(decodeURIComponent(objectiveId))
  return {
    title: obj ? `${obj.objective_name} — Strategic Objective` : 'Strategic Objective',
  }
}

export default async function ObjectiveDetailPage({ params }: Props) {
  const { id, objectiveId } = await params
  const strategyId = decodeURIComponent(id)
  const objId = decodeURIComponent(objectiveId)

  const objective = await getObjectiveDetail(objId)
  if (!objective) notFound()

  return (
    <ObjectiveDetailWorkspace
      strategyId={strategyId}
      objective={objective}
    />
  )
}
