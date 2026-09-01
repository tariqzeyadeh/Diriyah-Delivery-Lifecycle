'use client'

import Link from 'next/link'
import { useLifecycleRecord } from '@/lib/tdl/hooks'
import { formatRiyadhDate } from '@/lib/tdl/time'
import { useI18n } from '@/lib/i18n/use-i18n'

export default function LifecycleListPage() {
  const record = useLifecycleRecord()
  const { t, workflowState } = useI18n()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-text">{t('lifecycle.listTitle')}</h1>
      <Link
        href={`/lifecycle/${record.lifecycleNumber}`}
        className="card card-hover block p-5 no-underline"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-sm text-brand">{record.lifecycleNumber}</p>
            <p className="text-base font-semibold text-text">{record.initiativeTitle}</p>
          </div>
          <p className="text-xs text-text-muted">
            {t('lifecycle.goLive', { date: formatRiyadhDate(record.targetGoLiveUtc) })}
          </p>
        </div>
        <p className="mt-2 text-sm text-text-muted">{workflowState(record.currentWorkflowState)}</p>
      </Link>
    </div>
  )
}
