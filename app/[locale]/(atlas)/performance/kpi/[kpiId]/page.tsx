import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getKpiDefinition, getKpiUpdateHistory } from '@/src/actions/kpi'
import { KpiDefinitionWorkspace } from '@/components/atlas/dashboard/KpiDefinitionWorkspace'

type Props = {
  params: Promise<{ kpiId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kpiId } = await params
  const kpi = await getKpiDefinition(decodeURIComponent(kpiId))
  return {
    title: kpi ? `${kpi.kpi_name} — KPI Definition` : 'KPI Definition',
  }
}

export default async function KpiDefinitionPage({ params }: Props) {
  const { kpiId } = await params
  const id = decodeURIComponent(kpiId)

  const [kpi, historyResult] = await Promise.all([
    getKpiDefinition(id),
    getKpiUpdateHistory(id, 12),
  ])

  if (!kpi) notFound()

  return (
    <KpiDefinitionWorkspace
      kpi={kpi}
      history={historyResult?.updates ?? []}
    />
  )
}
