import { getTranslations } from 'next-intl/server'
import { getStrategyGateQueue } from '@/src/actions/gates'
import { GateQueuePanel } from '@/components/atlas/gates/GateQueuePanel'
import { PageIntro } from '@/components/atlas/records'

export default async function GateS1Page() {
  const t = await getTranslations('gates')
  const queue = await getStrategyGateQueue()

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={t('pageTitle')}
        title={t('strategyGateTitle')}
        description={t('pageDesc')}
      />

      <GateQueuePanel
        gateCode="G-S1"
        entityType="STRATEGY"
        items={queue.map((s) => ({
          id: s.strategy_id,
          title: s.strategy_title,
          masterTraceId: s.master_trace_id,
          submittedBy: s.submitted_by ?? '—',
          submittedAt: s.submitted_at?.toISOString() ?? null,
          metaA: {
            label: t('objectivesLabel'),
            value: String(s._count.objectives),
          },
          metaB: s.funding_envelope
            ? {
                label: t('fundingLabel'),
                value: `SAR ${Number(s.funding_envelope).toLocaleString()}`,
              }
            : null,
          summary: s.executive_summary ?? null,
        }))}
      />
    </div>
  )
}
