import { Plus } from 'lucide-react'
import { Link } from '@/src/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { listBudgetSubmissions } from '@/src/actions/portfolio'
import { OfficialTag, PageIntro, RegisterTable } from '@/components/atlas/records'
import { recordStatusTagTone, sentenceCaseLabel } from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'

function fmtSar(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(n)
}

export default async function BudgetIndexPage() {
  const t = await getTranslations('budgetIndex')
  const tc = await getTranslations('common')
  const budgets = await listBudgetSubmissions(40)

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={`PI-05 · ${tc('module')}`}
        title={t('pageTitle')}
        description={t('pageDesc')}
        actions={
          <Link
            href="/budget/new"
            className="btn btn-primary inline-flex h-9 items-center gap-1.5 px-3 text-xs no-underline"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('createBudget')}
          </Link>
        }
      />

      {budgets.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-12 text-center">
          <p className="text-sm text-text-muted">{t('noRecords')}</p>
        </div>
      ) : (
        <RegisterTable caption={t('registerCaption')} count={budgets.length}>
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-4 py-2.5 font-semibold">{t('tableSubmission')}</th>
              <th className="hidden px-4 py-2.5 font-semibold md:table-cell">{t('tableStrategy')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('tableRequested')}</th>
              <th className="px-4 py-2.5 font-semibold">{t('tableStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {budgets.map((b, idx) => (
              <tr
                key={b.budget_submission_id}
                className={cn(
                  'relative border-b border-border/60 last:border-0',
                  idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/20',
                )}
              >
                <th scope="row" className="px-4 py-2.5 text-start font-normal">
                  <Link
                    href={`/budget/${encodeURIComponent(b.budget_submission_id)}/lines`}
                    className="text-text no-underline after:absolute after:inset-0 hover:underline"
                  >
                    <span className="block font-mono text-xs text-diriyah-accent">
                      {b.budget_submission_id}
                    </span>
                    <span className="block font-semibold">{t('openLines')}</span>
                    <span className="sr-only">{t('openLines')}</span>
                  </Link>
                  <p className="mt-0.5 font-mono text-xs text-text-muted">{b.master_trace_id}</p>
                  <p className="relative z-10 mt-1 flex flex-wrap gap-x-3 text-xs">
                    <Link
                      href={`/budget/${encodeURIComponent(b.budget_submission_id)}/consolidation`}
                      className="font-semibold text-diriyah-primary no-underline hover:underline"
                    >
                      {t('openConsolidation')}
                    </Link>
                    <Link
                      href={`/procurement/${encodeURIComponent(b.budget_submission_id)}/board`}
                      className="font-semibold text-diriyah-primary no-underline hover:underline"
                    >
                      {t('openBoard')}
                    </Link>
                    <Link
                      href={`/procurement/${encodeURIComponent(b.budget_submission_id)}/plan`}
                      className="font-semibold text-diriyah-primary no-underline hover:underline"
                    >
                      {t('openPlan')}
                    </Link>
                  </p>
                </th>
                <td className="hidden px-4 py-2.5 text-xs text-text-muted md:table-cell">
                  {b.strategy_title ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-end text-xs tabular-nums">
                  <p>{fmtSar(b.total_requested_sar)}</p>
                  <p className="text-[11px] text-text-muted">
                    {t('tableCapex')} {fmtSar(b.capex_total_sar)} · {t('tableOpex')}{' '}
                    {fmtSar(b.opex_total_sar)}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {b.line_count} {t('tableLines')}
                  </p>
                </td>
                <td className="px-4 py-2.5">
                  <OfficialTag tone={recordStatusTagTone(b.record_status)}>
                    {sentenceCaseLabel(b.record_status)}
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
