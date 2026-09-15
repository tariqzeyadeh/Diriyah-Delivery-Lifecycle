'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/src/i18n/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { deletePortfolioRecord, type DeletableEntity } from '@/src/actions/records-delete'
import type { DeleteBlockCode } from '@/lib/atlas/record-delete'
import { cn } from '@/lib/utils'

export function RegisterDeleteButton({
  entityType,
  entityId,
  canDelete,
  blockedCode,
}: {
  entityType: DeletableEntity
  entityId: string
  canDelete: boolean
  blockedCode?: DeleteBlockCode | null
}) {
  const t = useTranslations('common')
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const blockedHint = blockedCode ? t(`deleteBlocked.${blockedCode}`) : t('deleteBlocked.not_draft')

  function handleDelete() {
    startTransition(async () => {
      setError(null)
      const res = await deletePortfolioRecord({ entityType, entityId })
      if (!res.ok) {
        setError(res.code ? t(`deleteBlocked.${res.code}`) : res.error)
        setConfirming(false)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="relative z-10 flex flex-col items-end gap-1">
      {canDelete && confirming ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="btn h-8 border-border bg-white px-2.5 text-xs disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleDelete}
            className="btn inline-flex h-8 items-center gap-1 border-diriyah-red/40 bg-white px-2.5 text-xs font-semibold text-diriyah-red disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {pending ? t('deleting') : t('confirmDelete')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!canDelete || pending}
          title={canDelete ? t('deleteConfirm') : blockedHint}
          onClick={() => canDelete && setConfirming(true)}
          className={cn(
            'btn inline-flex h-8 items-center gap-1 border-border bg-white px-2.5 text-xs',
            canDelete ? 'text-diriyah-red hover:border-diriyah-red/40' : 'cursor-not-allowed text-text-muted',
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('delete')}
        </button>
      )}
      {error ? <p className="max-w-[12rem] text-end text-[11px] text-diriyah-red">{error}</p> : null}
    </div>
  )
}
