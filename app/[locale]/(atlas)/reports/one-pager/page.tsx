import { Link } from '@/src/i18n/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getAtlasSession } from '@/src/lib/auth/session'
import {
  getExecutiveOnePager,
  fetchFinancialPosition,
  fetchDecisionsRequired,
} from '@/lib/atlas/dashboard-data'
import { getOnePagerPublishState } from '@/src/actions/one-pager'
import {
  PortfolioScorecard,
  ProcessFunnel,
  TraceabilityMatrix,
  FinancialPositionTable,
  DecisionsRequiredPanel,
  DaysInPhaseStats,
} from '@/components/atlas/dashboard/OnePagerWidgets'
import { ExecutiveNarrative } from '@/components/atlas/dashboard/ExecutiveNarrative'
import { ExportTraceabilityButton } from '@/components/atlas/export/ExportTraceabilityButton'
import { PublishGatePanel } from '@/components/atlas/reports/PublishGatePanel'
import { OfficialTag } from '@/components/atlas/records'
import { prisma } from '@/lib/prisma'

export default async function ExecutiveOnePagerPage() {
  const t = await getTranslations('common')
  const locale = await getLocale()
  const [data, publishState, financialPosition, pendingDecisions, session] = await Promise.all([
    getExecutiveOnePager(),
    getOnePagerPublishState(),
    fetchFinancialPosition(),
    fetchDecisionsRequired(3),
    getAtlasSession(),
  ])

  // G-13: Phase stats — use earliest master trace created_at as phase start
  const earliestTrace = await prisma.masterTrace.findFirst({
    where: { is_active: true },
    orderBy: { created_at: 'asc' },
    select: { created_at: true },
  })

  // G-15: Latest scorecard for executive narrative
  const latestScorecard = await prisma.balancedScorecard.findFirst({
    orderBy: { created_at: 'desc' },
    select: { scorecard_id: true, executive_narrative: true },
  })

  // BR-043: use server-computed data-as-of / reporting period, fallback to now()
  const dataAsOf = data.dataAsOf ?? new Date()
  const reportingPeriod = data.reportingPeriod ?? publishState.reporting_period
  const generatedAt = dataAsOf.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="space-y-6 rounded-md border border-border bg-white p-4 md:p-5">
      <header className="flex flex-col gap-4 border-b border-diriyah-bg-secondary pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-diriyah-accent">
            PI-11 · {t('atlasLiveView')}
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-diriyah-primary">
            {t('executiveOnePager')}
          </h1>
          <p className="max-w-xl text-sm text-text-muted">{t('onePagerLiveDesc')}</p>
          {/* BR-043: reporting period badge */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <OfficialTag tone="info">{reportingPeriod}</OfficialTag>
            <span className="text-xs text-text-muted">
              Data as of {generatedAt}
            </span>
            <OfficialTag tone="success">Approved versions only (BR-042)</OfficialTag>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <p className="text-end text-xs font-semibold text-diriyah-primary">
            {t('confidentialCto')}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <ExportTraceabilityButton label={t('exportToExcel')} />
            <Link
              href="/reports"
              className="btn h-11 border-border bg-white px-4 text-sm no-underline"
            >
              {t('allReports')}
            </Link>
          </div>
        </div>
      </header>

      {/* BR-044: Publish / Hold quality gate panel */}
      <PublishGatePanel
        publishState={publishState}
        reportingPeriod={reportingPeriod}
        dataAsOf={dataAsOf}
      />

      {/* G-13: Days in Phase + Phase Status */}
      {earliestTrace && (
        <DaysInPhaseStats
          createdAt={earliestTrace.created_at}
          hasOverdueApprovals={publishState.quality_status === 'FAIL' && publishState.quality_block_reasons.some((r: string) => r.includes('QC-2'))}
          ragStatus={null}
        />
      )}

      <PortfolioScorecard {...data.scorecard} />

      <section className="rounded-md border border-border bg-white p-4">
        <h2 className="text-sm font-semibold text-diriyah-primary">{t('processFunnel')}</h2>
        <p className="mb-4 text-xs text-text-muted">{t('funnelDesc')}</p>
        <ProcessFunnel steps={data.funnel} />
      </section>

      {/* G-35: Financial Position Table */}
      <section className="rounded-md border border-border bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-diriyah-primary">Financial Position</h2>
        <p className="mb-3 text-xs text-text-muted">
          Portfolio financial waterfall from strategy envelope to delivered value (G-35).
        </p>
        <FinancialPositionTable rows={financialPosition} />
      </section>

      {/* G-35: Decisions Required Panel */}
      <section className="rounded-md border border-border bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-diriyah-primary">Decisions Required</h2>
        <p className="mb-3 text-xs text-text-muted">
          Oldest pending approval transactions requiring executive action (G-35).
        </p>
        <DecisionsRequiredPanel decisions={pendingDecisions} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-diriyah-primary">{t('traceabilityMatrix')}</h2>
            <p className="text-xs text-text-muted">{t('matrixDesc')}</p>
          </div>
          <ExportTraceabilityButton label={t('exportMatrix')} className="h-10 text-xs" />
        </div>
        <TraceabilityMatrix rows={data.matrix} />
      </section>

      {/* G-15: Executive Narrative — only shown when published */}
      {latestScorecard && publishState.is_published && (
        <ExecutiveNarrative
          scorecardId={latestScorecard.scorecard_id}
          initialNarrative={latestScorecard.executive_narrative as Record<string, string> | null}
          isPublished={publishState.is_published}
          currentUserEmail={session?.user?.email ?? 'system'}
        />
      )}

      <footer className="border-t border-diriyah-bg-secondary pt-4 text-center text-[11px] text-text-muted">
        {t('footerConfidential')}
      </footer>
    </div>
  )
}
