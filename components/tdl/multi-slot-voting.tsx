'use client'

import type { CabVote } from '@/lib/tdl/types'
import { useI18n } from '@/lib/i18n/use-i18n'

export function MultiSlotVoting({
  votes,
  onVote,
}: {
  votes: CabVote[]
  onVote: (slotId: CabVote['slotId'], decision: 'Approved' | 'Returned') => void
}) {
  const { t, statusLabel } = useI18n()

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">{t('cab.hint')}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {votes.map((v) => (
          <div
            key={v.slotId}
            className={`rounded-lg border p-4 ${
              v.state === 'Approved'
                ? 'border-green-300 bg-green-50'
                : v.state === 'Returned'
                  ? 'border-red-300 bg-red-50'
                  : v.state === 'Cancelled'
                    ? 'border-border bg-surface opacity-60'
                    : 'border-border bg-surface-elevated'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-text">{v.label}</p>
                <p className="text-xs text-text-muted">
                  {t('cab.state', { state: statusLabel(v.state) })}
                  {v.voterId ? ` · ${v.voterId}` : ''}
                </p>
              </div>
              <span className="font-mono text-[10px] text-text-muted">v{v.input_version}</span>
            </div>
            {v.state === 'Pending' && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white"
                  onClick={() => onVote(v.slotId, 'Approved')}
                >
                  {t('common.approve')}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                  onClick={() => onVote(v.slotId, 'Returned')}
                >
                  {t('common.return')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
