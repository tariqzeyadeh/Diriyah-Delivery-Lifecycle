import { getTranslations } from 'next-intl/server'
import { listMasterTraceIds } from '@/lib/atlas/dashboard-data'
import { ExportTraceabilityButton } from '@/components/atlas/export/ExportTraceabilityButton'
import { RiskAlertBadge } from '@/components/atlas/RiskAlertBadge'
import { computePortfolioRiskAlerts, riskForTrace } from '@/src/lib/predictive-risk'
import { Link } from '@/src/i18n/navigation'
import { OfficialTag, PageIntro, RegisterTable } from '@/components/atlas/records'
import { sentenceCaseLabel } from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'

/** Traceability hub — lists spines and full-matrix Excel export for PMO. */
export default async function TraceabilityIndexPage() {
  const t = await getTranslations('common')
  const tIdx = await getTranslations('traceIndex')
  const [traces, riskAlerts] = await Promise.all([
    listMasterTraceIds(40),
    computePortfolioRiskAlerts({ limit: 60 }),
  ])

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={t('masterTraceability')}
        title={tIdx('pageTitle')}
        description={tIdx('pageDesc')}
        actions={<ExportTraceabilityButton />}
      />

      {traces.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-5 py-10 text-center text-sm text-text-muted">
          {tIdx('noRecords')}
        </p>
      ) : (
        <RegisterTable caption={tIdx('registerCaption')} count={traces.length}>
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-4 py-2.5 font-semibold">{tIdx('tableId')}</th>
              <th className="px-4 py-2.5 font-semibold">{tIdx('tableRoute')}</th>
              <th className="px-4 py-2.5 font-semibold">{tIdx('tableCreated')}</th>
              <th className="px-4 py-2.5 font-semibold">{tIdx('exportSpine')}</th>
            </tr>
          </thead>
          <tbody>
            {traces.map((tr, idx) => {
              const risk = riskForTrace(riskAlerts, tr.master_trace_id)
              return (
                <tr
                  key={tr.master_trace_id}
                  className={cn(
                    'relative border-b border-border/60 last:border-0',
                    idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/20',
                  )}
                >
                  <th scope="row" className="px-4 py-2.5 text-start font-normal">
                    <Link
                      href={`/traceability/${encodeURIComponent(tr.master_trace_id)}`}
                      className="text-text no-underline after:absolute after:inset-0 hover:underline"
                    >
                      <span className="block font-mono text-xs text-diriyah-accent">
                        {tr.master_trace_id}
                      </span>
                      <span className="sr-only">{tIdx('openSpine')}</span>
                    </Link>
                    {risk ? (
                      <div className="relative z-10 mt-1">
                        <RiskAlertBadge alert={risk} compact />
                      </div>
                    ) : null}
                  </th>
                  <td className="px-4 py-2.5">
                    <OfficialTag variant="outlined">{sentenceCaseLabel(tr.entry_route)}</OfficialTag>
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-text-muted">
                    {tr.created_at.toISOString().slice(0, 10)}
                  </td>
                  <td className="relative z-10 px-4 py-2.5">
                    <ExportTraceabilityButton
                      masterTraceId={tr.master_trace_id}
                      label={tIdx('exportSpine')}
                      className="h-8 text-xs"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </RegisterTable>
      )}
    </div>
  )
}
