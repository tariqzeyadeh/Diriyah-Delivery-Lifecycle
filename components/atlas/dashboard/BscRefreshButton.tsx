'use client'

import { useState, useTransition } from 'react'
import { useRouter } from '@/src/i18n/navigation'
import { RefreshCw, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react'
import { computeBscSnapshot, type BscSnapshotSummary } from '@/src/actions/kpi'
import { useAuth } from '@/src/providers/AuthProvider'
import { cn } from '@/lib/utils'

function ragColor(rag: string | null) {
  switch (rag) {
    case 'GREEN':  return 'text-green-600'
    case 'AMBER':  return 'text-amber-600'
    case 'RED':    return 'text-red-600'
    default:       return 'text-text-muted'
  }
}

export function BscRefreshButton({
  latestSnapshot,
  strategyId,
}: {
  latestSnapshot: BscSnapshotSummary | null
  strategyId?: string
}) {
  const router = useRouter()
  const { currentUser } = useAuth()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{
    ok: boolean
    message: string
    score?: number
    rag?: string
  } | null>(null)

  const currentPeriod = (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })()

  function refresh() {
    startTransition(async () => {
      setResult(null)
      const res = await computeBscSnapshot(
        strategyId ?? null,
        currentPeriod,
        currentUser.email,
      )
      if (res.ok) {
        setResult({
          ok: true,
          message: `Snapshot computed — ${res.objectives_updated} objective(s) updated across ${res.perspectives_computed} perspective(s).`,
          score: res.overall_score,
          rag: res.overall_rag,
        })
        router.refresh()
      } else {
        setResult({ ok: false, message: res.error })
      }
    })
  }

  return (
    <div className="rounded-md border border-border bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-diriyah-primary" />
          <div>
            <p className="text-sm font-semibold text-text">BSC Snapshot Engine</p>
            <p className="text-xs text-text-muted">
              Computes 70% KPI + 20% project + 10% budget composite per objective (BR-039).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-diriyah-primary px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} />
          {pending ? 'Computing…' : 'Refresh Snapshot'}
        </button>
      </div>

      {/* Last snapshot stats */}
      {!result && latestSnapshot && (
        <div className="flex flex-wrap items-center gap-5 rounded-md border border-border bg-diriyah-bg-alt/50 px-4 py-3 text-sm">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Last computed</span>
            <p className="mt-0.5 text-xs text-text-muted">
              {latestSnapshot.computed_at.toLocaleString()} · {latestSnapshot.reporting_period}
            </p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Overall score</span>
            <p className={cn('mt-0.5 text-lg font-bold tabular-nums', ragColor(latestSnapshot.overall_rag))}>
              {latestSnapshot.overall_score != null ? `${latestSnapshot.overall_score}%` : '—'}
            </p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Quality</span>
            <p className={cn('mt-0.5 text-xs font-semibold', latestSnapshot.data_quality_status === 'PASS' ? 'text-green-600' : 'text-red-600')}>
              {latestSnapshot.data_quality_status ?? '—'}
            </p>
          </div>
        </div>
      )}

      {/* Result banner */}
      {result && (
        <div
          className={cn(
            'flex items-start gap-2.5 rounded-md px-4 py-3 text-sm',
            result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800',
          )}
        >
          {result.ok ? (
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          )}
          <div>
            <p>{result.message}</p>
            {result.score != null && (
              <p className={cn('mt-1 text-base font-bold', ragColor(result.rag ?? null))}>
                Overall strategy score: {result.score}%
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
