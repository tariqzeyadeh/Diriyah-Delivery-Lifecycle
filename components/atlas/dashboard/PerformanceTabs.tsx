'use client'

import { useState } from 'react'
import { BarChart3, LayoutGrid } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { KpiWithDefinition, BscPerspectiveGroup, BscSnapshotSummary, StrategyExecutionDrivers } from '@/src/actions/kpi'
import { KpiUpdatePanel } from './KpiUpdatePanel'
import { BalancedScorecardPanel } from './BalancedScorecardPanel'

type Tab = 'kpi' | 'bsc'

interface Props {
  kpis: KpiWithDefinition[]
  bscPerspectives: BscPerspectiveGroup[]
  defaultPeriod: string
  latestSnapshot?: BscSnapshotSummary | null
  executionDrivers?: StrategyExecutionDrivers | null
}

export function PerformanceTabs({ kpis, bscPerspectives, defaultPeriod, latestSnapshot, executionDrivers }: Props) {
  const t = useTranslations('performance')
  const [tab, setTab] = useState<Tab>('kpi')

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-4 border-b border-border">
        <TabButton
          active={tab === 'kpi'}
          onClick={() => setTab('kpi')}
          icon={<BarChart3 className="h-4 w-4" />}
          label={t('kpiUpdatesTab')}
        />
        <TabButton
          active={tab === 'bsc'}
          onClick={() => setTab('bsc')}
          icon={<LayoutGrid className="h-4 w-4" />}
          label={t('bscTab')}
        />
      </div>

      {/* Tab content */}
      {tab === 'kpi' && (
        kpis.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-10 text-center">
            <p className="text-sm text-text-muted">
              No KPIs defined yet. Submit a Strategy to Gate G-S1 first to generate KPI definitions.
            </p>
          </div>
        ) : (
          <KpiUpdatePanel kpis={kpis} defaultPeriod={defaultPeriod} />
        )
      )}

      {tab === 'bsc' && (
        <BalancedScorecardPanel
          perspectives={bscPerspectives}
          snapshot={latestSnapshot}
          executionDrivers={executionDrivers}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border-b-2 px-1 py-2 text-xs font-semibold transition-all',
        active
          ? 'border-diriyah-primary text-diriyah-primary'
          : 'border-transparent text-text-muted hover:text-text',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
