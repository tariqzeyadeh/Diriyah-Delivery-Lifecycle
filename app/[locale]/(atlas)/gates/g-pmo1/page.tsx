import { getTranslations } from 'next-intl/server'
import { getGatePmoQueue } from '@/src/actions/gates'
import { OfficialTag, PageIntro, SummaryCard } from '@/components/atlas/records'
import { sentenceCaseLabel, stageTagTone } from '@/lib/atlas/record-label'

export default async function GatePmo1Page() {
  const t = await getTranslations('gates')
  const queue = await getGatePmoQueue()

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={t('pageTitle')}
        title={t('pmoGateTitle')}
        description={t('pageDesc')}
      />

      {queue.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-16 text-center">
          <p className="text-base font-medium text-text-muted">{t('emptyQueue')}</p>
          <p className="mt-1 text-sm text-text-muted/60">{t('pmo1EmptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">{t('queueCount', { count: queue.length })}</p>
          <ul className="space-y-3">
            {queue.map((item) => {
              const sar = item.planned_value_sar ?? item.approved_budget_sar
              const value =
                sar != null
                  ? `SAR ${Number(sar).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`
                  : '—'
              return (
                <li key={item.procurement_item_id}>
                  <SummaryCard
                    eyebrow={item.procurement_item_id}
                    title={item.procurement_item_title}
                    tag={
                      <OfficialTag tone={stageTagTone(item.procurement_stage)}>
                        {sentenceCaseLabel(item.procurement_stage)}
                      </OfficialTag>
                    }
                    items={[
                      { label: t('submittedAt'), value: new Date(item.created_at).toLocaleDateString() },
                      { label: t('demandLabel'), value: item.demand?.demand_title ?? '—' },
                      { label: t('categoryLabel'), value: item.procurement_category ?? '—' },
                      { label: t('plannedValueLabel'), value },
                    ]}
                    action={{
                      href: `/pmo/${encodeURIComponent(item.procurement_item_id)}`,
                      label: t('registerProject'),
                    }}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
