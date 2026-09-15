import { Link } from '@/src/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { listStrategies } from '@/src/actions/portfolio'
import { NewRecordButton } from '@/components/atlas/home/NewRecordButton'
import { OfficialTag, PageIntro, RegisterDeleteButton, RegisterTable } from '@/components/atlas/records'
import { recordStatusTagTone, sentenceCaseLabel } from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'

function formatSar(n: number) {
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(n)
}

export default async function StrategyIndexPage() {
  const t = await getTranslations('strategyIndex')
  const tc = await getTranslations('common')
  const strategies = await listStrategies(40)

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={`PI-01 · ${tc('module')}`}
        title={t('pageTitle')}
        description={t('pageDesc')}
        actions={<NewRecordButton compact intent="strategy" />}
      />

      {strategies.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-12 text-center">
          <p className="text-sm text-text-muted">{t('noRecords')}</p>
        </div>
      ) : (
        <RegisterTable caption={t('registerCaption')} count={strategies.length}>
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-4 py-2.5 font-semibold">{t('tableTitle')}</th>
              <th className="hidden px-4 py-2.5 font-semibold md:table-cell">{t('tableHorizon')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('tableFunding')}</th>
              <th className="px-4 py-2.5 font-semibold">{t('tableStatus')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('tableActions')}</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((s, idx) => (
              <tr
                key={s.strategy_id}
                className={cn(
                  'relative border-b border-border/60 last:border-0',
                  idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/20',
                )}
              >
                <th scope="row" className="px-4 py-2.5 text-start font-normal">
                  <Link
                    href={`/strategy/${encodeURIComponent(s.strategy_id)}`}
                    className="text-text no-underline after:absolute after:inset-0 hover:underline"
                  >
                    <span className="block font-mono text-xs text-diriyah-accent">{s.strategy_id}</span>
                    <span className="block font-semibold">{s.strategy_title}</span>
                    <span className="sr-only">{t('openWorkspace')}</span>
                  </Link>
                  <p className="mt-0.5 font-mono text-xs text-text-muted">{s.master_trace_id}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {s.objective_count} {t('tableObjectives')}
                  </p>
                </th>
                <td className="hidden px-4 py-2.5 text-xs tabular-nums text-text-muted md:table-cell">
                  {s.horizon_start_date ? `${s.horizon_start_date} → ${s.horizon_end_date ?? '…'}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-end text-xs tabular-nums">
                  {s.funding_envelope != null ? formatSar(s.funding_envelope) : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <OfficialTag tone={recordStatusTagTone(s.record_status)}>
                    {sentenceCaseLabel(s.record_status, t('draft'))}
                  </OfficialTag>
                </td>
                <td className="px-4 py-2.5 text-end">
                  <RegisterDeleteButton
                    entityType="STRATEGY"
                    entityId={s.strategy_id}
                    canDelete={s.canDelete}
                    blockedCode={s.deleteBlockedCode}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </RegisterTable>
      )}
    </div>
  )
}
