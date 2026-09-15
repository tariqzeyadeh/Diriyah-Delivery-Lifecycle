'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Loader2, X, FileText, Target } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { EntryRoute } from '@prisma/client'
import { useRouter } from '@/src/i18n/navigation'
import { initiatePortfolioRecord } from '@/src/actions/portfolio-initiation'
import { useAuth } from '@/src/providers/AuthProvider'
import { cn } from '@/lib/utils'

type RecordIntent = 'chooser' | 'strategy' | 'demand'
type RouteChoice = 'strategy' | 'demand'

export function NewRecordButton({
  compact = false,
  intent = 'chooser',
  preselectStrategyId,
  label,
}: {
  compact?: boolean
  intent?: RecordIntent
  preselectStrategyId?: string
  label?: string
}) {
  const t = useTranslations('common')
  const router = useRouter()
  const { currentUser } = useAuth()
  const [pending, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [selected, setSelected] = useState<RouteChoice>('strategy')
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function closeModal() {
    if (pending) return
    setOpen(false)
  }

  function createRecord(kind: RouteChoice) {
    startTransition(async () => {
      setError(null)
      const isStrategy = kind === 'strategy'
      const result = await initiatePortfolioRecord({
        entry_route: isStrategy ? EntryRoute.STRATEGIC : EntryRoute.ADHOC,
        created_by: currentUser.email,
        title: isStrategy ? 'New Strategy' : 'New Demand',
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setOpen(false)
      if (result.workspace === 'strategy') {
        router.push(`/strategy/${encodeURIComponent(result.child_id)}`)
      } else {
        const qs = preselectStrategyId
          ? `?strategy=${encodeURIComponent(preselectStrategyId)}`
          : ''
        router.push(`/demand/${encodeURIComponent(result.child_id)}${qs}`)
      }
      router.refresh()
    })
  }

  function handleTrigger() {
    setError(null)
    if (intent === 'strategy' || intent === 'demand') {
      createRecord(intent)
      return
    }
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        data-tour="tour-new-record"
        onClick={handleTrigger}
        disabled={pending}
        className={cn(
          'btn btn-primary inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap disabled:opacity-60',
          compact ? 'h-9 px-3 text-xs' : 'h-11 px-4 text-sm',
        )}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {pending ? t('creating') : (label ?? t('newRecord'))}
      </button>

      {mounted &&
        open &&
        intent === 'chooser' &&
        createPortal(
          <div className="fixed inset-0 z-200 flex items-center justify-center p-4 sm:p-6">
            <button
              type="button"
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              aria-label={t('close')}
              onClick={closeModal}
            />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="entry-route-title"
              className="relative z-10 flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-xl"
            >
            <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-5">
              <div>
                <h2
                  id="entry-route-title"
                  className="text-lg font-semibold text-text"
                >
                  {t('chooseEntryRoute')}
                </h2>
                <p className="mt-0.5 text-sm text-text-muted">
                  {t('chooseEntryRouteSubtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="ml-4 rounded-lg p-1.5 text-text-muted hover:bg-diriyah-bg-alt"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-6 py-5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSelected('strategy')}
                className={cn(
                  'flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
                  selected === 'strategy'
                    ? 'border-diriyah-primary bg-diriyah-primary/5'
                    : 'border-border bg-diriyah-bg-alt/50 hover:border-diriyah-primary/40',
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    selected === 'strategy'
                      ? 'bg-diriyah-primary text-white'
                      : 'bg-diriyah-bg-secondary text-diriyah-primary',
                  )}
                >
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <p
                    className={cn(
                      'font-semibold',
                      selected === 'strategy' ? 'text-diriyah-primary' : 'text-text',
                    )}
                  >
                    {t('strategicRouteTitle')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    {t('strategicRouteDesc')}
                  </p>
                </div>
                {selected === 'strategy' && (
                  <span className="rounded-full bg-diriyah-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Selected
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelected('demand')}
                className={cn(
                  'flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
                  selected === 'demand'
                    ? 'border-diriyah-amber bg-diriyah-amber/5'
                    : 'border-border bg-diriyah-bg-alt/50 hover:border-diriyah-amber/40',
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    selected === 'demand'
                      ? 'bg-diriyah-amber text-white'
                      : 'bg-diriyah-bg-secondary text-diriyah-amber',
                  )}
                >
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p
                    className={cn(
                      'font-semibold',
                      selected === 'demand' ? 'text-diriyah-amber' : 'text-text',
                    )}
                  >
                    {t('adhocRouteTitle')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    {t('adhocRouteDesc')}
                  </p>
                </div>
                {selected === 'demand' && (
                  <span className="rounded-full bg-diriyah-amber px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Selected
                  </span>
                )}
              </button>
            </div>

            {error ? (
              <p className="border-t border-diriyah-red/20 bg-diriyah-red/10 px-6 py-3 text-sm text-diriyah-red">
                {error}
              </p>
            ) : null}

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="btn h-10 border-border bg-white px-4 text-sm"
                disabled={pending}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => createRecord(selected)}
                disabled={pending}
                className={cn(
                  'btn h-10 px-5 text-sm font-semibold text-white disabled:opacity-60',
                  selected === 'demand'
                    ? 'bg-diriyah-amber hover:opacity-90'
                    : 'btn-primary',
                )}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {pending ? t('creating') : t('continueWith')}
              </button>
            </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
