import { Link } from '@/src/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import {
  emptyCockpitMetrics,
  formatSar,
  getCockpitMetrics,
  listMasterTraceIds,
} from '@/lib/atlas/dashboard-data'
import { settleDatabase } from '@/lib/atlas/db-fallback'
import { SlaWorkloadDonut } from '@/components/atlas/dashboard/SlaWorkloadDonut'
import { StageHealthBars } from '@/components/atlas/dashboard/StageHealthBars'
import { NewRecordButton } from '@/components/atlas/home/NewRecordButton'
import { GuidedTour } from '@/components/atlas/GuidedTour'
import { RiskAlertBadge, RiskAlertsPanel } from '@/components/atlas/RiskAlertBadge'
import { computePortfolioRiskAlerts, riskForTrace } from '@/src/lib/predictive-risk'
import { MetricTile, PageIntro, RecordNotice, RegisterTable } from '@/components/atlas/records'
import { sentenceCaseLabel } from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'

export default async function HomeCockpitPage() {
  const t = await getTranslations('common')
  const th = await getTranslations('home')
  const [metricsSettled, tracesSettled, riskSettled] = await Promise.all([
    settleDatabase(() => getCockpitMetrics(), emptyCockpitMetrics()),
    settleDatabase(() => listMasterTraceIds(8), []),
    settleDatabase(() => computePortfolioRiskAlerts({ limit: 24 }), []),
  ])
  const metrics = metricsSettled.value
  const traces = tracesSettled.value
  const riskAlerts = riskSettled.value
  const databaseUnreachable =
    metricsSettled.unreachable || tracesSettled.unreachable || riskSettled.unreachable

  return (
    <div className="space-y-6">
      <GuidedTour />

      {databaseUnreachable ? (
        <RecordNotice title={t('databaseUnreachable')} tone="warning" role="alert">
          {t('databaseUnreachableHint')}
        </RecordNotice>
      ) : null}

      <PageIntro
        eyebrow={th('greeting')}
        title={th('subtitle')}
        description={t('cockpitSubtitle')}
        actions={
          <>
            <Link
              href="/value-realization"
              className="btn h-9 shrink-0 whitespace-nowrap border-border bg-white px-3 text-xs no-underline"
            >
              {t('valueRealization')}
            </Link>
            <NewRecordButton compact />
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div data-tour="tour-master-records">
          <MetricTile label={t('openMasterRecords')} value={String(metrics.kpi.openMasterRecords)} />
        </div>
        <MetricTile label={t('pendingApprovals')} value={String(metrics.kpi.pendingApprovals)} />
        <MetricTile
          label={t('totalApprovedBudget')}
          value={formatSar(metrics.kpi.totalApprovedBudget)}
          hint={t('budgetHint')}
        />
      </div>

      <section className="rounded-md border border-border bg-white p-4" data-testid="predictive-risk-panel">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text">{t('predictiveRiskAlerts')}</h2>
            <p className="text-xs text-text-muted">{t('riskSubtitle')}</p>
          </div>
          <Link
            href="/traceability"
            className="text-xs font-semibold text-diriyah-accent no-underline hover:underline"
          >
            {t('openTraceability')} →
          </Link>
        </div>
        <RiskAlertsPanel alerts={riskAlerts} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-white p-4">
          <h2 className="text-sm font-semibold text-text">{t('stageHealth')}</h2>
          <p className="mb-4 text-xs text-text-muted">{t('stageHealthDesc')}</p>
          <StageHealthBars stages={metrics.stageHealth} />
        </section>

        <section className="rounded-md border border-border bg-white p-4" data-tour="tour-sla-workload">
          <h2 className="text-sm font-semibold text-text">{t('slaWorkload')}</h2>
          <p className="mb-4 text-xs text-text-muted">{t('slaWorkloadDesc')}</p>
          <SlaWorkloadDonut
            withinSla={metrics.sla.withinSla}
            dueSoon={metrics.sla.dueSoon}
            overdue={metrics.sla.overdue}
            empty={metrics.sla.empty}
          />
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text">{th('recentActivity')}</h2>
            <p className="text-xs text-text-muted">{t('openSpineAudit')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/help" className="btn h-9 border-border bg-white px-3 text-xs no-underline">
              {t('helpCenter')}
            </Link>
            <Link href="/reports/one-pager" className="btn btn-primary h-9 px-3 text-xs no-underline">
              {t('openOnePager')}
            </Link>
          </div>
        </div>
        {traces.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-4 py-8 text-center text-xs text-text-muted">
            {th('noActivity')}
          </p>
        ) : (
          <RegisterTable caption={th('recentActivity')} count={traces.length}>
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-muted">
                <th className="px-4 py-2.5 font-semibold">{t('masterTraceability')}</th>
                <th className="px-4 py-2.5 font-semibold">
                  <span className="sr-only">{t('predictiveRiskAlerts')}</span>
                </th>
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
                        <span className="block text-xs text-text-muted">
                          {sentenceCaseLabel(tr.entry_route)}
                        </span>
                      </Link>
                    </th>
                    <td className="relative z-10 px-4 py-2.5">
                      {risk ? <RiskAlertBadge alert={risk} compact /> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </RegisterTable>
        )}
      </section>
    </div>
  )
}
