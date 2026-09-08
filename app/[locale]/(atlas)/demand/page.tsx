import { Link } from '@/src/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { listDemands } from '@/src/actions/portfolio'
import { NewRecordButton } from '@/components/atlas/home/NewRecordButton'
import { OfficialTag, PageIntro, RegisterTable } from '@/components/atlas/records'
import {
  recordStatusTagTone,
  sentenceCaseLabel,
  urgencyTagTone,
} from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'

export default async function DemandIndexPage() {
  const t = await getTranslations('demandIndex')
  const tc = await getTranslations('common')
  const demands = await listDemands(40)

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={`PI-04 · ${tc('module')}`}
        title={t('pageTitle')}
        description={t('pageDesc')}
        actions={
          <>
            <Link
              href="/demand/reviews"
              className="btn h-9 border-border bg-white px-3 text-xs no-underline"
            >
              {t('reviewsLink')}
            </Link>
            <Link
              href="/demand/validate"
              className="btn h-9 border-border bg-white px-3 text-xs no-underline"
            >
              {t('validateLink')}
            </Link>
            <NewRecordButton />
          </>
        }
      />

      {demands.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-12 text-center">
          <p className="text-sm text-text-muted">{t('noRecords')}</p>
        </div>
      ) : (
        <RegisterTable caption={t('registerCaption')} count={demands.length}>
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-4 py-2.5 font-semibold">{t('tableTitle')}</th>
              <th className="px-4 py-2.5 font-semibold">{t('tableRoute')}</th>
              <th className="hidden px-4 py-2.5 font-semibold md:table-cell">{t('tableUrgency')}</th>
              <th className="px-4 py-2.5 font-semibold">{t('tableStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {demands.map((d, idx) => (
              <tr
                key={d.demand_id}
                className={cn(
                  'relative border-b border-border/60 last:border-0',
                  idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/20',
                )}
              >
                <th scope="row" className="px-4 py-2.5 text-start font-normal">
                  <Link
                    href={`/demand/${encodeURIComponent(d.demand_id)}`}
                    className="text-text no-underline after:absolute after:inset-0 hover:underline"
                  >
                    <span className="block font-mono text-xs text-diriyah-accent">{d.demand_id}</span>
                    <span className="block font-semibold">{d.demand_title}</span>
                    <span className="sr-only">{t('openWorkspace')}</span>
                  </Link>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {d.created_at} · {d.option_count} {t('tableOptions')}
                  </p>
                </th>
                <td className="px-4 py-2.5">
                  <OfficialTag variant="outlined">
                    {d.entry_route === 'STRATEGIC' ? t('strategic') : t('adhoc')}
                  </OfficialTag>
                </td>
                <td className="hidden px-4 py-2.5 md:table-cell">
                  {d.urgency ? (
                    <OfficialTag tone={urgencyTagTone(d.urgency)}>
                      {sentenceCaseLabel(d.urgency)}
                    </OfficialTag>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <OfficialTag tone={recordStatusTagTone(d.record_status)}>
                    {sentenceCaseLabel(d.record_status)}
                  </OfficialTag>
                </td>
              </tr>
            ))}
          </tbody>
        </RegisterTable>
      )}
    </div>
  )
}
