import { Link } from '@/src/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { getValueRealizationDashboard, formatSar } from '@/lib/atlas/value-realization'
import { MetricTile, OfficialTag, PageIntro, RegisterTable } from '@/components/atlas/records'
import { cn } from '@/lib/utils'

function VarianceBadge({ variance, variancePct }: { variance: number; variancePct: number }) {
  const positive = variance >= 0
  return (
    <OfficialTag tone={positive ? 'success' : 'danger'}>
      {positive ? '+' : ''}
      {variancePct.toFixed(1)}%
    </OfficialTag>
  )
}

function RoiBar({ pct }: { pct: number }) {
  const width = Math.min(100, Math.max(0, pct))
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full max-w-[140px] overflow-hidden rounded-sm bg-diriyah-bg-secondary">
        <div
          className="h-full rounded-sm"
          style={{
            width: `${width}%`,
            backgroundColor: 'var(--diriyah-primary)',
          }}
        />
      </div>
      <span className="min-w-[3.5rem] text-xs font-semibold tabular-nums text-diriyah-primary">
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

/**
 * Phase 2 — Value Realization Dashboard
 * Planned vs Realized strategic impact over 12–24 month horizons.
 */
export default async function ValueRealizationPage() {
  const t = await getTranslations('common')
  const tp = await getTranslations('pages')
  const data = await getValueRealizationDashboard()

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={t('phase2Benefits')}
        title={tp('valueTitle')}
        description={tp('valueDesc')}
        actions={
          <Link href="/performance" className="btn h-9 border-border bg-white px-3 text-xs no-underline">
            {tp('performanceCta')}
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile
          label={t('plannedImpact')}
          value={formatImpact(data.totals.plannedImpact)}
          hint={t('sumTargetBaseline')}
        />
        <MetricTile
          label={t('realizedImpact')}
          value={formatImpact(data.totals.realizedImpact)}
          hint={t('sumRealizedBaseline')}
        />
        <MetricTile
          label={t('portfolioVariance')}
          value={formatImpact(data.totals.variance)}
          hint={t('realizedMinusPlanned')}
        />
        <MetricTile
          label={t('avgRoiProgress')}
          value={`${data.totals.avgRoiProgressPct.toFixed(0)}%`}
          hint={t('measurements', { count: data.totals.measurementCount })}
        />
      </div>

      <RegisterTable caption={t('plannedVsRealized')} count={data.rows.length}>
        <thead>
          <tr className="border-b border-border text-start text-xs text-text-muted">
            <th className="px-4 py-2.5 font-semibold">{t('projectBenefit')}</th>
            <th className="hidden px-4 py-2.5 font-semibold md:table-cell">{t('objective')}</th>
            <th className="px-4 py-2.5 font-semibold">{t('baseline')}</th>
            <th className="px-4 py-2.5 font-semibold">{t('target')}</th>
            <th className="px-4 py-2.5 font-semibold">{t('realized')}</th>
            <th className="px-4 py-2.5 font-semibold">{t('variance')}</th>
            <th className="px-4 py-2.5 font-semibold">{t('roiProgress')}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-text-muted">
                {t('noBenefitMeasurements')}
              </td>
            </tr>
          ) : (
            data.rows.map((row, idx) => (
              <tr
                key={row.realization_id}
                className={cn(
                  'border-b border-border/60 last:border-0',
                  idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/20',
                )}
              >
                <th scope="row" className="px-4 py-2.5 text-start font-normal">
                  <span className="block font-mono text-xs text-diriyah-accent">{row.project_id}</span>
                  <span className="block font-semibold">{row.project_name}</span>
                  <span className="block text-xs text-text-muted">{row.benefit_name}</span>
                </th>
                <td className="hidden px-4 py-2.5 md:table-cell">
                  <p className="text-text">{row.objective_name}</p>
                  <p className="text-[11px] text-text-muted">
                    {row.horizon_months} mo · {row.measurement_date}
                  </p>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-text-muted">
                  {fmtVal(row.baseline_value, row.benefit_unit)}
                </td>
                <td className="px-4 py-2.5 tabular-nums font-medium">
                  {fmtVal(row.target_value, row.benefit_unit)}
                </td>
                <td className="px-4 py-2.5 tabular-nums font-semibold text-diriyah-primary">
                  {fmtVal(row.realized_value, row.benefit_unit)}
                </td>
                <td className="px-4 py-2.5">
                  <VarianceBadge variance={row.variance} variancePct={row.variance_pct} />
                </td>
                <td className="px-4 py-2.5">
                  <RoiBar pct={row.roi_progress_pct} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </RegisterTable>
    </div>
  )
}

function formatImpact(n: number): string {
  if (Math.abs(n) >= 1000) return formatSar(n)
  return n.toLocaleString('en-SA', { maximumFractionDigits: 1 })
}

function fmtVal(n: number, unit: string | null): string {
  if (unit?.toUpperCase() === 'SAR') return formatSar(n)
  return `${n.toLocaleString('en-SA', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
}
