import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getKpiUpdateHistory } from '@/src/actions/kpi'
import { KpiUpdateWorkspace } from '@/components/atlas/dashboard/KpiUpdateWorkspace'

type Props = {
  params: Promise<{ kpiId: string; period: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kpiId, period } = await params
  const result = await getKpiUpdateHistory(decodeURIComponent(kpiId), 12)
  return {
    title: result ? `${result.kpi.kpi_name} · ${decodeURIComponent(period)} — KPI Update` : 'KPI Update',
  }
}

export default async function KpiUpdatePage({ params }: Props) {
  const { kpiId, period } = await params
  const id = decodeURIComponent(kpiId)
  const decodedPeriod = decodeURIComponent(period)

  const result = await getKpiUpdateHistory(id, 13)
  if (!result) notFound()

  return (
    <KpiUpdateWorkspace
      kpi={result.kpi}
      history={result.updates}
      activePeriod={decodedPeriod}
    />
  )
}
