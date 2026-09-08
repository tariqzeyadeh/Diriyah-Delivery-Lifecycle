import { getTranslations } from 'next-intl/server'
import { getPortfolioKpis, getBscPerspectives, getLatestBscSnapshot, getStrategyExecutionDrivers } from '@/src/actions/kpi'
import { PerformanceTabs } from '@/components/atlas/dashboard/PerformanceTabs'
import { BscRefreshButton } from '@/components/atlas/dashboard/BscRefreshButton'
import { PageIntro } from '@/components/atlas/records'

export default async function PerformancePage() {
  const t = await getTranslations('common')
  const tn = await getTranslations('nav')

  const [kpis, bscPerspectives, latestSnapshot, executionDrivers] = await Promise.all([
    getPortfolioKpis(100),
    getBscPerspectives(),
    getLatestBscSnapshot(),
    getStrategyExecutionDrivers(),
  ])

  const currentPeriod = (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })()

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={`PI-10 · ${t('module')}`}
        title={tn('performance')}
        description={t('performanceDesc')}
      />

      <BscRefreshButton latestSnapshot={latestSnapshot} />

      <PerformanceTabs
        kpis={kpis}
        bscPerspectives={bscPerspectives}
        defaultPeriod={currentPeriod}
        latestSnapshot={latestSnapshot}
        executionDrivers={executionDrivers}
      />
    </div>
  )
}
