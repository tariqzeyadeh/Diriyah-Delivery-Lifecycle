'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/src/i18n/navigation'
import { RotateCcw, XCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  rejectDemand,
  resubmitDemand,
  rejectStrategy,
  resubmitStrategy,
  rejectBudget,
  resubmitBudget,
} from '@/src/actions/lifecycle'
import { approveStrategyGate } from '@/src/actions/gates'
import { useAuth } from '@/src/providers/AuthProvider'
import { cn } from '@/lib/utils'

type EntityType = 'demand' | 'strategy' | 'budget'
type RecordStatus = string | null | undefined

const PENDING_GATE_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'UNDER_VALIDATION']

export function LifecycleActionsPanel({
  entityType,
  entityId,
  recordStatus,
  versionNumber,
  masterTraceId,
}: {
  entityType: EntityType
  entityId: string
  recordStatus: RecordStatus
  versionNumber?: number | null
  masterTraceId?: string | null
}) {
  const { currentUser, isRole, canDecideGate } = useAuth()
  const t = useTranslations('lifecycle')
  const tc = useTranslations('common')
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [showReject, setShowReject] = useState(false)

  // Determine what actions are available
  const status = recordStatus ?? ''
  const canResubmit = ['RETURNED', 'DRAFT'].includes(status)
  const canReject =
    [...PENDING_GATE_STATUSES, 'RETURNED'].includes(status) &&
    isRole('CTO Office', 'Strategy & Governance')
  const canApprove =
    entityType === 'strategy' &&
    PENDING_GATE_STATUSES.includes(status) &&
    canDecideGate('G-S1') &&
    Boolean(masterTraceId)

  if (!canResubmit && !canReject && !canApprove) return null

  function doResubmit() {
    startTransition(async () => {
      setResult(null)
      let res
      if (entityType === 'demand') res = await resubmitDemand(entityId, currentUser.email)
      else if (entityType === 'strategy') res = await resubmitStrategy(entityId, currentUser.email)
      else res = await resubmitBudget(entityId, currentUser.email)

      if (res.ok) {
        setResult({
          ok: true,
          message: `Re-submitted as version ${res.new_version ?? '—'}. Awaiting CTO review.`,
        })
        router.refresh()
      } else {
        setResult({ ok: false, message: res.error })
      }
    })
  }

  function doApprove() {
    if (!masterTraceId || entityType !== 'strategy') return
    startTransition(async () => {
      setResult(null)
      const res = await approveStrategyGate({
        strategy_id: entityId,
        master_trace_id: masterTraceId,
        created_by: currentUser.id,
      })
      if (res.ok) {
        setResult({ ok: true, message: 'Strategy approved at G-S1. Create a Demand and link this strategy when you are ready.' })
        router.refresh()
      } else {
        setResult({ ok: false, message: res.error })
      }
    })
  }

  function doReject() {
    if (!reason.trim()) {
      setResult({ ok: false, message: 'Please provide a rejection reason.' })
      return
    }
    startTransition(async () => {
      setResult(null)
      let res
      if (entityType === 'demand') res = await rejectDemand(entityId, reason, currentUser.email)
      else if (entityType === 'strategy') res = await rejectStrategy(entityId, reason, currentUser.email)
      else res = await rejectBudget(entityId, reason, currentUser.email)

      if (res.ok) {
        setResult({ ok: true, message: `${entityType} rejected and archived.` })
        router.refresh()
      } else {
        setResult({ ok: false, message: res.error })
      }
    })
  }

  return (
    <div className="rounded-md border border-border bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">Lifecycle Actions</p>
          <p className="text-xs text-text-muted">
            {t('currentStage')}: <span className="font-semibold text-diriyah-primary">{status}</span>
            {versionNumber != null && (
              <> · {t('versionLabel')} <span className="font-semibold">{versionNumber}</span></>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canResubmit && (
            <button
              type="button"
              onClick={doResubmit}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-diriyah-primary px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {pending ? 'Submitting…' : 'Re-Submit (Bump Version)'}
            </button>
          )}
          {canReject && (
            <button
              type="button"
              onClick={() => setShowReject((v) => !v)}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Reject & Archive
            </button>
          )}
          {canApprove && (
            <button
              type="button"
              onClick={doApprove}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--diriyah-green)' }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {pending ? 'Working…' : tc('approve')}
            </button>
          )}
        </div>
      </div>

      {/* Inline reject form */}
      {showReject && canReject && (
        <div className="space-y-3 rounded-md border border-red-200 bg-red-50/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-red-700">
            Rejection reason (BR-011)
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Provide a clear reason for rejection. This will be stored as a comment and cannot be undone."
            className="w-full resize-none rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted/60 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={doReject}
              disabled={pending || !reason.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              {pending ? 'Rejecting…' : 'Confirm Rejection'}
            </button>
            <button
              type="button"
              onClick={() => { setShowReject(false); setReason('') }}
              className="inline-flex h-9 items-center rounded-md border border-border bg-white px-4 text-sm text-text-muted hover:bg-diriyah-bg-alt"
            >
              Cancel
            </button>
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
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          )}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  )
}
