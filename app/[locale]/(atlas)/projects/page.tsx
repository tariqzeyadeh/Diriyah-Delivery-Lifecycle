import { Link } from '@/src/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { listProcurementItems, listProjectRegistrations } from '@/src/actions/portfolio'
import { isPmoReadyStage } from '@/lib/atlas/procurement'
import { MetricTile, OfficialTag, PageIntro, RegisterDeleteButton, RegisterTable } from '@/components/atlas/records'
import { recordStatusTagTone, sentenceCaseLabel } from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'

export default async function ProjectsPage() {
  const t = await getTranslations('projectsIndex')
  const tc = await getTranslations('common')
  const [projects, procurement] = await Promise.all([
    listProjectRegistrations(40),
    listProcurementItems(40),
  ])
  const pendingPmo = procurement.filter((i) => isPmoReadyStage(i.procurement_stage) && !i.has_project)
  const inDelivery = procurement.filter((i) => !isPmoReadyStage(i.procurement_stage))

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={`PI-09 · ${tc('module')}`}
        title={t('pageTitle')}
        description={t('pageDesc')}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile label={t('metricRegistered')} value={String(projects.length)} />
        <MetricTile label={t('metricPendingPmo')} value={String(pendingPmo.length)} />
        <MetricTile label={t('metricInDelivery')} value={String(inDelivery.length)} />
      </div>

      {projects.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-12 text-center">
          <p className="text-sm text-text-muted">{t('noProjects')}</p>
        </div>
      ) : (
        <RegisterTable caption={t('registerCaption')} count={projects.length}>
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-4 py-3 font-semibold">{t('tableProject')}</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">{t('tableApproach')}</th>
              <th className="px-4 py-3 font-semibold">{t('tableDates')}</th>
              <th className="px-4 py-3 font-semibold">{t('tableStatus')}</th>
              <th className="px-4 py-3 text-end font-semibold">{t('tableActions')}</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, idx) => (
              <tr
                key={p.project_id}
                className={cn(
                  'relative border-b border-border/60 last:border-0',
                  idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/20',
                )}
              >
                <th scope="row" className="px-4 py-3 text-start font-normal">
                  <Link
                    href={`/traceability/${encodeURIComponent(p.master_trace_id)}`}
                    className="text-text no-underline after:absolute after:inset-0 hover:underline"
                  >
                    <span className="block font-mono text-xs text-diriyah-accent">{p.project_id}</span>
                    <span className="block font-semibold">{p.project_name}</span>
                    <span className="sr-only">{t('openTrace')}</span>
                  </Link>
                  <p className="mt-0.5 font-mono text-xs text-text-muted">{p.master_trace_id}</p>
                </th>
                <td className="hidden px-4 py-3 md:table-cell">
                  {p.delivery_approach ? (
                    <OfficialTag variant="outlined">{p.delivery_approach}</OfficialTag>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums text-text-muted">
                  {p.planned_start_date ?? '—'} → {p.planned_end_date ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <OfficialTag tone={recordStatusTagTone(p.record_status)}>
                    {sentenceCaseLabel(p.record_status, t('statusActive'))}
                  </OfficialTag>
                </td>
                <td className="px-4 py-3 text-end">
                  <RegisterDeleteButton
                    entityType="PROJECT"
                    entityId={p.project_id}
                    canDelete={p.canDelete}
                    blockedCode={p.deleteBlockedCode}
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
