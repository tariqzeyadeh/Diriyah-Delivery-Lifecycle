'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export type FormStep = {
  id: string
  label: string
}

export function RequiredMark() {
  return <span className="text-diriyah-red">*</span>
}

export function useFormSteps(stepIds: string[], initialId?: string, allReachable = false) {
  const first = stepIds[0] ?? ''
  const [currentId, setCurrentId] = useState(initialId && stepIds.includes(initialId) ? initialId : first)
  const [maxReached, setMaxReached] = useState(allReachable ? Math.max(0, stepIds.length - 1) : 0)

  useEffect(() => {
    if (stepIds.length === 0) return
    const last = stepIds.length - 1
    if (!stepIds.includes(currentId)) {
      setCurrentId(stepIds[0])
      setMaxReached(allReachable ? last : 0)
      return
    }
    if (allReachable) {
      setMaxReached(last)
      return
    }
    const idx = stepIds.indexOf(currentId)
    setMaxReached((m) => Math.min(Math.max(m, idx), last))
  }, [stepIds, currentId, allReachable])

  const currentIndex = Math.max(0, stepIds.indexOf(currentId))
  const isFirst = currentIndex <= 0
  const isLast = stepIds.length === 0 || currentIndex >= stepIds.length - 1

  function select(id: string) {
    const i = stepIds.indexOf(id)
    const cap = allReachable ? stepIds.length - 1 : maxReached
    if (i >= 0 && i <= cap) setCurrentId(id)
  }

  function goBack() {
    if (currentIndex > 0) setCurrentId(stepIds[currentIndex - 1])
  }

  function advance() {
    const next = currentIndex + 1
    setMaxReached((m) => Math.max(m, next, currentIndex))
    if (next < stepIds.length) setCurrentId(stepIds[next])
  }

  return {
    currentId,
    currentIndex,
    maxReached,
    isFirst,
    isLast,
    select,
    goBack,
    advance,
  }
}

export function FormStepRail({
  steps,
  currentId,
  maxReached,
  onSelect,
}: {
  steps: FormStep[]
  currentId: string
  maxReached: number
  onSelect: (id: string) => void
}) {
  const t = useTranslations('common')
  const currentIndex = Math.max(0, steps.findIndex((s) => s.id === currentId))

  return (
    <nav
      aria-label={t('stepOf', { current: currentIndex + 1, total: steps.length })}
      className="overflow-x-auto rounded-md border border-border bg-white px-3 py-4 sm:px-5"
    >
      <ol className="flex min-w-max">
        {steps.map((step, i) => {
          const current = step.id === currentId
          const reachable = i <= maxReached
          const done = i < currentIndex && i <= maxReached
          const lineComplete = i < currentIndex
          const prevLineComplete = i <= currentIndex
          return (
            <li
              key={step.id}
              className="relative flex min-w-[5.75rem] flex-1 flex-col items-center px-1"
            >
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute start-0 end-1/2 top-[11px] h-0.5',
                    prevLineComplete ? 'bg-diriyah-primary' : 'bg-border',
                  )}
                />
              ) : null}
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute start-1/2 end-0 top-[11px] h-0.5',
                    lineComplete ? 'bg-diriyah-primary' : 'bg-border',
                  )}
                />
              ) : null}
              <button
                type="button"
                onClick={() => reachable && onSelect(step.id)}
                disabled={!reachable}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'group relative z-10 flex w-full flex-col items-center gap-2 rounded-md px-1 transition',
                  reachable ? 'cursor-pointer' : 'cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border-2',
                    done
                      ? 'border-diriyah-green bg-diriyah-green text-white'
                      : current
                        ? 'border-diriyah-primary bg-white'
                        : reachable
                          ? 'border-diriyah-primary/45 bg-white'
                          : 'border-border bg-white',
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : current ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-diriyah-primary" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    'max-w-[7.5rem] text-center text-xs font-semibold leading-tight',
                    current
                      ? 'text-diriyah-primary'
                      : done
                        ? 'text-text'
                        : reachable
                          ? 'text-text-muted group-hover:text-text'
                          : 'text-text-muted/40',
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function FormStepActions({
  isFirst,
  isLast,
  onBack,
  onNext,
  nextDisabled,
  nextPending,
  hideNext,
  children,
}: {
  isFirst: boolean
  isLast: boolean
  onBack: () => void
  onNext?: () => void
  nextDisabled?: boolean
  nextPending?: boolean
  hideNext?: boolean
  children?: React.ReactNode
}) {
  const t = useTranslations('common')
  const showNext = !hideNext && !isLast && onNext

  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onBack}
        disabled={isFirst || nextPending}
        className="btn h-11 inline-flex items-center gap-1.5 border-border bg-white px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('back')}
      </button>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {children}
        {showNext ? (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || nextPending}
            className="btn btn-primary inline-flex h-11 items-center gap-1.5 px-6 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {nextPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {nextPending ? t('saving') : t('next')}
            {nextPending ? null : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    </div>
  )
}
