'use client'

import { useState, useTransition } from 'react'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { saveExecutiveNarrative } from '@/src/actions/one-pager'

export type NarrativeFields = {
  top_achievements: string
  key_concerns: string
  decisions_actions_required: string
  next_steps: string
}

type Props = {
  scorecardId: string
  initialNarrative?: Partial<NarrativeFields> | null
  isPublished?: boolean
  currentUserEmail: string
}

const BLOCKS: { key: keyof NarrativeFields; label: string; hint: string }[] = [
  { key: 'top_achievements', label: 'Top Achievements', hint: 'Key milestones delivered this period' },
  { key: 'key_concerns', label: 'Key Concerns', hint: 'Issues that need executive attention' },
  { key: 'decisions_actions_required', label: 'Decisions / Actions Required', hint: 'Specific decisions or actions needed from leadership' },
  { key: 'next_steps', label: 'Next Steps', hint: 'Planned actions for the coming period' },
]

const MAX_CHARS = 500

export function ExecutiveNarrative({ scorecardId, initialNarrative, isPublished, currentUserEmail }: Props) {
  const t = useTranslations('onePager')
  const [narrative, setNarrative] = useState<NarrativeFields>({
    top_achievements: initialNarrative?.top_achievements ?? '',
    key_concerns: initialNarrative?.key_concerns ?? '',
    decisions_actions_required: initialNarrative?.decisions_actions_required ?? '',
    next_steps: initialNarrative?.next_steps ?? '',
  })
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [pending, startSave] = useTransition()

  if (!isPublished) return null

  function handleSave() {
    if (pending) return
    setNotification(null)
    startSave(async () => {
      const result = await saveExecutiveNarrative({
        scorecard_id: scorecardId,
        narrative,
        modified_by: currentUserEmail,
      })
      if (result.ok) {
        setNotification({ type: 'success', message: 'Executive narrative saved.' })
      } else {
        setNotification({ type: 'error', message: result.error })
      }
    })
  }

  return (
    <section className="space-y-4 rounded-md border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-diriyah-primary">{t('narrative')}</h2>
          <p className="text-sm text-text-muted">
            CTO-level commentary published with the one-pager (G-15).
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="btn btn-primary inline-flex h-10 items-center gap-2 px-5 text-sm disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {pending ? t('saving') : t('saveNarrative')}
        </button>
      </div>

      {notification && (
        <div
          role="alert"
          className={cn(
            'flex items-start gap-3 rounded-md border px-4 py-3 text-sm',
            notification.type === 'success'
              ? 'border-diriyah-green/30 bg-diriyah-green/10 text-diriyah-green'
              : 'border-diriyah-red/30 bg-diriyah-red/10 text-diriyah-red',
          )}
        >
          {notification.type === 'success'
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <p>{notification.message}</p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {BLOCKS.map((block) => (
          <div key={block.key} className="space-y-1.5">
            <label className="block text-sm font-medium text-text">{block.label}</label>
            <p className="text-xs text-text-muted">{block.hint}</p>
            <textarea
              className="input-base min-h-28 w-full py-3"
              value={narrative[block.key]}
              onChange={(e) => setNarrative((n) => ({ ...n, [block.key]: e.target.value.slice(0, MAX_CHARS) }))}
              placeholder={`${block.hint}…`}
              maxLength={MAX_CHARS}
            />
            <p className="text-right text-[10px] text-text-muted">
              {narrative[block.key].length} / {MAX_CHARS}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
