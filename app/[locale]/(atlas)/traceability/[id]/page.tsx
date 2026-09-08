import { Link } from '@/src/i18n/navigation'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getTraceabilityTree, listMasterTraceIds } from '@/lib/atlas/dashboard-data'
import { TraceabilityTreeView } from '@/components/atlas/dashboard/TraceabilityTreeView'
import { ExportTraceabilityButton } from '@/components/atlas/export/ExportTraceabilityButton'
import { PageIntro } from '@/components/atlas/records'

type Props = {
  params: Promise<{ id: string }>
}

export default async function TraceabilityExplorerPage({ params }: Props) {
  const { id } = await params
  const masterTraceId = decodeURIComponent(id)
  const t = await getTranslations('pages')
  const tc = await getTranslations('common')
  const td = await getTranslations('traceDetail')
  const tree = await getTraceabilityTree(masterTraceId)

  if (!tree) {
    const recent = await listMasterTraceIds(5)
    return (
      <div className="space-y-6">
        <PageIntro
          eyebrow={tc('traceabilityExplorer')}
          title={t('notFoundTrace')}
          description={masterTraceId}
        />
        {recent.length > 0 ? (
          <ul className="space-y-2 rounded-md border border-border bg-white p-4">
            {recent.map((row) => (
              <li key={row.master_trace_id}>
                <Link
                  href={`/traceability/${encodeURIComponent(row.master_trace_id)}`}
                  className="font-mono text-sm text-diriyah-primary"
                >
                  {row.master_trace_id}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          notFound()
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageIntro
          eyebrow={tc('traceabilityExplorer')}
          title={t('lifecycleMap')}
          description={t('lifecycleMapDesc')}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ExportTraceabilityButton masterTraceId={masterTraceId} />
          <Link
            href={`/traceability/${encodeURIComponent(masterTraceId)}/evidence`}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-text no-underline hover:bg-diriyah-bg-alt"
          >
            {td('openEvidence')}
          </Link>
          <Link
            href="/traceability"
            className="text-sm font-semibold text-diriyah-accent no-underline hover:underline"
          >
            {tc('allSpines')}
          </Link>
          <Link
            href="/home"
            className="text-sm font-semibold text-diriyah-accent no-underline hover:underline"
          >
            ← {tc('cockpit')}
          </Link>
        </div>
      </div>

      <TraceabilityTreeView tree={tree} />
    </div>
  )
}
