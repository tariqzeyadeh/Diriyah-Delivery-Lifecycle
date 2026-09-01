'use client'

import { use } from 'react'
import { LifecycleWorkspace } from '@/components/tdl/lifecycle-workspace'
import { assertLifecycleNumber } from '@/lib/tdl/ids'
import { useLifecycleRecord } from '@/lib/tdl/hooks'
import { useI18n } from '@/lib/i18n/use-i18n'

export default function LifecycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const record = useLifecycleRecord()
  const { t } = useI18n()

  try {
    assertLifecycleNumber(id)
  } catch {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        {t('lifecycle.invalidId')}
      </div>
    )
  }

  if (id !== record.lifecycleNumber) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        {t('lifecycle.onlySeeded', { id: record.lifecycleNumber })}
      </div>
    )
  }

  return <LifecycleWorkspace />
}
