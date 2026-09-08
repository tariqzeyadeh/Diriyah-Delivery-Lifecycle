'use client'

import { useState, useTransition } from 'react'
import { useRouter } from '@/src/i18n/navigation'
import {
  ShieldCheck,
  ShieldAlert,
  PauseCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
} from 'lucide-react'
import {
  publishOnePager,
  holdOnePager,
  type OnePagerPublishState,
  type QualityCheck,
} from '@/src/actions/one-pager'
import { useAuth } from '@/src/providers/AuthProvider'
import { cn } from '@/lib/utils'

function QualityRow({ check }: { check: QualityCheck }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {check.passed ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      )}
      <div className="min-w-0">
        <span className="text-xs font-bold text-text-muted">{check.check_id} — </span>
        <span className="text-xs font-semibold text-text">{check.label}</span>
        <p className="mt-0.5 text-xs text-text-muted">{check.detail}</p>
      </div>
    </div>
  )
}

export function PublishGatePanel({
  publishState,
  reportingPeriod,
  dataAsOf,
}: {
  publishState: OnePagerPublishState
  reportingPeriod: string
  dataAsOf: Date
}) {
  const router = useRouter()
  const { currentUser } = useAuth()
  const [pending, startTransition] = useTransition()
  const [checks, setChecks] = useState<QualityCheck[]>([])
  const [result, setResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  function runPublish() {
    startTransition(async () => {
      setResult(null)
      const res = await publishOnePager(currentUser.email)
      if (res.ok) {
        setChecks(res.checks)
        setResult({ ok: true, message: 'One-pager published. All quality checks passed.' })
        router.refresh()
      } else {
        setChecks(res.checks ?? [])
        setResult({ ok: false, message: res.error })
      }
    })
  }

  function runHold() {
    startTransition(async () => {
      setResult(null)
      setChecks([])
      const res = await holdOnePager(currentUser.email)
      if (res.ok) {
        setResult({ ok: true, message: 'One-pager placed on hold. Publication retracted.' })
        router.refresh()
      } else {
        setResult({ ok: false, message: res.error })
      }
    })
  }

  const statusBg = publishState.is_published
    ? 'bg-green-50 border-green-200'
    : publishState.quality_status === 'FAIL'
      ? 'bg-red-50 border-red-200'
      : 'bg-diriyah-bg-alt border-border'

  return (
    <div className={cn('overflow-hidden rounded-md border', statusBg)}>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          {publishState.is_published ? (
            <Globe className="h-5 w-5 text-green-600" />
          ) : publishState.quality_status === 'FAIL' ? (
            <ShieldAlert className="h-5 w-5 text-red-600" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-diriyah-primary" />
          )}
          <div>
            <p className="text-sm font-semibold text-text">
              {publishState.is_published
                ? 'Published'
                : publishState.quality_status === 'FAIL'
                  ? 'Quality Gate Failed — On Hold'
                  : 'Quality Gate — Not Yet Published'}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span>
                <span className="font-semibold">Period:</span> {reportingPeriod}
              </span>
              <span>
                <span className="font-semibold">Data as of:</span>{' '}
                {new Date(dataAsOf).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
              {publishState.is_published && publishState.published_at && (
                <span>
                  <span className="font-semibold">Published:</span>{' '}
                  {new Date(publishState.published_at).toLocaleString('en-GB', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}{' '}
                  by {publishState.published_by}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {!publishState.is_published && (
            <button
              type="button"
              onClick={runPublish}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-diriyah-primary px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Globe className="h-4 w-4" />
              {pending ? 'Checking…' : 'Publish'}
            </button>
          )}
          {publishState.is_published && (
            <button
              type="button"
              onClick={runHold}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              <PauseCircle className="h-4 w-4" />
              {pending ? '…' : 'Place on Hold'}
            </button>
          )}
        </div>
      </div>

      {/* Persistent block reasons (from previous check) */}
      {!result &&
        publishState.quality_status === 'FAIL' &&
        publishState.quality_block_reasons.length > 0 && (
          <div className="border-t border-red-200 bg-red-50/50 px-5 pb-4">
            <p className="pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-red-700">
              Quality blocks
            </p>
            <ul className="space-y-1">
              {publishState.quality_block_reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-red-700">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

      {/* Quality check detail (after run) */}
      {checks.length > 0 && (
        <div className="border-t border-border/60 px-5 pb-4">
          <p className="pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-text-muted">
            Quality checks (BR-044)
          </p>
          <div className="divide-y divide-border/30">
            {checks.map((c) => (
              <QualityRow key={c.check_id} check={c} />
            ))}
          </div>
        </div>
      )}

      {/* Result banner */}
      {result && (
        <div
          className={cn(
            'mx-5 mb-4 flex items-start gap-2.5 rounded-md px-4 py-3 text-sm',
            result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800',
          )}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          )}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  )
}
