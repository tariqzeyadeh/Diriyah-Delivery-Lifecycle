import { getTranslations } from 'next-intl/server'
import { listProcurementItems } from '@/src/actions/portfolio'
import { isPmoReadyStage } from '@/lib/atlas/procurement'
import { OfficialTag, PageIntro, SummaryCard, TaskListRow } from '@/components/atlas/records'
import { sentenceCaseLabel, stageTagTone } from '@/lib/atlas/record-label'

function fmtSar(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(n)
}

export default async function PmoIndexPage() {
  const t = await getTranslations('pmoIndex')
  const tc = await getTranslations('common')
  const items = await listProcurementItems(40)
  const delivered = items.filter((i) => isPmoReadyStage(i.procurement_stage))
  const inProgress = items.filter((i) => !isPmoReadyStage(i.procurement_stage))

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={`PI-08 · ${tc('module')}`}
        title={t('pageTitle')}
        description={t('pageDesc')}
      />

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-12 text-center">
          <p className="text-sm text-text-muted">{t('noItems')}</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="overflow-hidden rounded-md border border-border bg-white">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold text-text">
                {t('awaitingDelivery')}
                <span className="ms-2 text-sm font-medium text-text-muted">· {inProgress.length}</span>
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">{t('awaitingHint')}</p>
            </div>
            {inProgress.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-text-muted">{t('noneYet')}</p>
            ) : (
              <ul>
                {inProgress.map((item) => (
                  <TaskListRow
                    key={item.procurement_item_id}
                    href={`/pmo/${encodeURIComponent(item.procurement_item_id)}`}
                    title={item.procurement_item_title}
                    hint={item.procurement_item_id}
                    status={
                      <OfficialTag tone={stageTagTone(item.procurement_stage)}>
                        {sentenceCaseLabel(item.procurement_stage)}
                      </OfficialTag>
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-text">
                {t('readyForRegistration')}
                <span className="ms-2 text-sm font-medium text-text-muted">· {delivered.length}</span>
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">{t('readyHint')}</p>
            </div>
            {delivered.length === 0 ? (
              <p className="rounded-md border border-border bg-white px-5 py-8 text-center text-sm text-text-muted">
                {t('noneYet')}
              </p>
            ) : (
              <ul className="space-y-3">
                {delivered.map((item) => (
                  <li key={item.procurement_item_id}>
                    <SummaryCard
                      eyebrow={item.procurement_item_id}
                      title={item.procurement_item_title}
                      tag={
                        item.has_project ? (
                          <OfficialTag tone="success">{t('registered')}</OfficialTag>
                        ) : (
                          <OfficialTag tone={stageTagTone(item.procurement_stage)}>
                            {sentenceCaseLabel(item.procurement_stage)}
                          </OfficialTag>
                        )
                      }
                      items={[
                        { label: t('tableStage'), value: sentenceCaseLabel(item.procurement_stage) },
                        { label: t('plannedValue'), value: fmtSar(item.planned_value_sar) },
                      ]}
                      action={{
                        href: `/pmo/${encodeURIComponent(item.procurement_item_id)}`,
                        label: t('registerProject'),
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
