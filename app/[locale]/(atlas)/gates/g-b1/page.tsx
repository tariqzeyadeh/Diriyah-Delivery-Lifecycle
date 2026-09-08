import { getTranslations } from 'next-intl/server'
import { getBudgetGateQueue } from '@/src/actions/gates'
import { GateQueuePanel } from '@/components/atlas/gates/GateQueuePanel'
import { PageIntro } from '@/components/atlas/records'

export default async function GateB1Page() {
  const t = await getTranslations('gates')
  const queue = await getBudgetGateQueue()

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={t('pageTitle')}
        title={t('budgetGateTitle')}
        description={t('pageDesc')}
      />

      <GateQueuePanel
        gateCode="G-B1"
        entityType="BUDGET_SUBMISSION"
        items={queue.map((b) => ({
          id: b.budget_submission_id,
          title: `Budget — ${b.budget_cycle ?? ''}`,
          masterTraceId: b.master_trace_id,
          submittedBy: b.submitted_by ?? '—',
          submittedAt: b.submitted_at?.toISOString() ?? null,
          metaA: {
            label: t('budgetLinesLabel'),
            value: String(b._count.budget_lines),
          },
          metaB: b.total_requested_sar
            ? {
                label: t('requestedLabel'),
                value: `SAR ${Number(b.total_requested_sar).toLocaleString()}`,
              }
            : null,
          summary: null,
        }))}
      />
    </div>
  )
}
