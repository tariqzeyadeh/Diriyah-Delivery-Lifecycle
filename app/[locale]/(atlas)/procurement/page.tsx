import { Link } from '@/src/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { listProcurementItems } from '@/src/actions/portfolio'
import { OfficialTag, PageIntro, RegisterTable } from '@/components/atlas/records'
import { sentenceCaseLabel, stageTagTone } from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'

function fmtSar(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(n)
}

export default async function ProcurementIndexPage() {
  const t = await getTranslations('procurementIndex')
  const tc = await getTranslations('common')
  const items = await listProcurementItems(40)

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={`PI-07 · ${tc('module')}`}
        title={t('pageTitle')}
        description={t('pageDesc')}
      />

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-12 text-center">
          <p className="text-sm text-text-muted">{t('noRecords')}</p>
        </div>
      ) : (
        <RegisterTable caption={t('registerCaption')} count={items.length}>
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-4 py-3 font-semibold">{t('tableTitle')}</th>
              <th className="px-4 py-3 font-semibold">{t('tableStage')}</th>
              <th className="px-4 py-3 text-end font-semibold">{t('tablePlanned')}</th>
              <th className="px-4 py-3 font-semibold">{t('tableCreated')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const href = item.budget_submission_id
                ? `/procurement/${encodeURIComponent(item.budget_submission_id)}/board`
                : `/pmo/${encodeURIComponent(item.procurement_item_id)}`
              return (
                <tr
                  key={item.procurement_item_id}
                  className={cn(
                    'relative border-b border-border/60 last:border-0',
                    idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/20',
                  )}
                >
                  <th scope="row" className="px-4 py-3 text-start font-normal">
                    <Link
                      href={href}
                      className="text-text no-underline after:absolute after:inset-0 hover:underline"
                    >
                      <span className="block font-mono text-xs text-diriyah-accent">
                        {item.procurement_item_id}
                      </span>
                      <span className="block font-semibold">{item.procurement_item_title}</span>
                      <span className="sr-only">{t('openBoard')}</span>
                    </Link>
                    <p className="mt-0.5 font-mono text-xs text-text-muted">{item.master_trace_id}</p>
                    {item.has_project ? (
                      <p className="relative mt-1">
                        <OfficialTag tone="success">{t('activated')}</OfficialTag>
                      </p>
                    ) : null}
                  </th>
                  <td className="px-4 py-3">
                    <OfficialTag tone={stageTagTone(item.procurement_stage)}>
                      {sentenceCaseLabel(item.procurement_stage)}
                    </OfficialTag>
                  </td>
                  <td className="px-4 py-3 text-end text-sm tabular-nums text-text">
                    {fmtSar(item.planned_value_sar)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{item.created_at}</td>
                </tr>
              )
            })}
          </tbody>
        </RegisterTable>
      )}
    </div>
  )
}
