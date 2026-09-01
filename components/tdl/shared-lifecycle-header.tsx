'use client'

import { formatRiyadhDate } from '@/lib/tdl/time'
import { getPersona } from '@/lib/tdl/store'
import type { Rec001 } from '@/lib/tdl/types'
import { useI18n } from '@/lib/i18n/use-i18n'

export function SharedLifecycleHeader({ record }: { record: Rec001 }) {
  const requestor = getPersona(record.requestorId)
  const { t, isRtl, workflowState } = useI18n()

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface-elevated/95 backdrop-blur-sm">
      <div className="grid gap-3 px-4 py-3 md:grid-cols-5 md:px-6">
        <HeaderCell label={t('header.lifecycleNumber')} value={record.lifecycleNumber} mono />
        <HeaderCell label={t('header.initiativeTitle')} value={record.initiativeTitle} />
        <HeaderCell
          label={t('header.requestor')}
          value={(isRtl ? requestor?.nameAr : requestor?.name) ?? record.requestorId}
        />
        <HeaderCell label={t('header.targetGoLive')} value={formatRiyadhDate(record.targetGoLiveUtc)} />
        <HeaderCell
          label={t('header.workflowState')}
          value={workflowState(record.currentWorkflowState)}
          accent
        />
      </div>
    </header>
  )
}

function HeaderCell({
  label,
  value,
  mono,
  accent,
}: {
  label: string
  value: string
  mono?: boolean
  accent?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={`mt-0.5 truncate text-sm font-semibold ${
          accent ? 'text-brand' : 'text-text'
        } ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}
