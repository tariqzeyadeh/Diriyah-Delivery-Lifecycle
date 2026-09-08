'use client'

import { useState, useTransition } from 'react'
import {
  CheckCircle2,
  RotateCcw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  GitMerge,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/src/i18n/navigation'
import { approveStrategyGate, approveBudgetGate, returnGate, approveWithConditions } from '@/src/actions/gates'
import { useAuth } from '@/src/providers/AuthProvider'
import { OfficialTag, RecordNotice } from '@/components/atlas/records'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GateQueueItem = {
  id: string
  title: string
  masterTraceId: string
  submittedBy: string
  submittedAt: string | null
  metaA: { label: string; value: string } | null
  metaB: { label: string; value: string } | null
  summary: string | null
}

export type GateQueuePanelProps = {
  gateCode: 'G-S1' | 'G-B1'
  entityType: 'STRATEGY' | 'BUDGET_SUBMISSION'
  items: GateQueueItem[]
}

// ─────────────────────────────────────────────────────────────────────────────
// GateQueuePanel
// ─────────────────────────────────────────────────────────────────────────────

export function GateQueuePanel({ gateCode, entityType, items }: GateQueuePanelProps) {
  const t = useTranslations('gates')
  const router = useRouter()
  const { currentUser } = useAuth()

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-12 text-center">
        <GitMerge className="mx-auto mb-3 h-8 w-8 text-text-muted/40" />
        <p className="text-base font-medium text-text-muted">{t('emptyQueue')}</p>
        <p className="mt-1 text-sm text-text-muted/60">{t('emptyQueueHint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        {t('queueCount', { count: items.length })}
      </p>
      {items.map((item) => (
        <GateItemCard
          key={item.id}
          item={item}
          gateCode={gateCode}
          entityType={entityType}
          actorId={currentUser.email}
          onActionDone={() => router.refresh()}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GateItemCard
// ─────────────────────────────────────────────────────────────────────────────

type GateItemCardProps = {
  item: GateQueueItem
  gateCode: 'G-S1' | 'G-B1'
  entityType: 'STRATEGY' | 'BUDGET_SUBMISSION'
  actorId: string
  onActionDone: () => void
}

function GateItemCard({ item, gateCode, entityType, actorId, onActionDone }: GateItemCardProps) {
  const t = useTranslations('gates')
  const [expanded, setExpanded] = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  const [showConditions, setShowConditions] = useState(false)
  const [returnComment, setReturnComment] = useState('')
  const [conditions, setConditions] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function handleApprove() {
    startTransition(async () => {
      setResult(null)
      let res: { ok: boolean; error?: string }

      if (gateCode === 'G-S1') {
        res = await approveStrategyGate({
          strategy_id: item.id,
          master_trace_id: item.masterTraceId,
          created_by: actorId,
        })
      } else {
        res = await approveBudgetGate({
          budget_id: item.id,
          master_trace_id: item.masterTraceId,
          approver_user_id: actorId,
        })
      }

      if (res.ok) {
        setResult({ ok: true, message: t('approveSuccess') })
        onActionDone()
      } else {
        setResult({ ok: false, message: res.error ?? t('actionFailed') })
      }
    })
  }

  function handleReturn() {
    if (!returnComment.trim() || returnComment.trim().length < 10) {
      setResult({ ok: false, message: t('returnCommentRequired') })
      return
    }
    startTransition(async () => {
      setResult(null)
      const res = await returnGate({
        entity_type: entityType,
        entity_id: item.id,
        master_trace_id: item.masterTraceId,
        gate_code: gateCode,
        return_comment: returnComment,
        returned_by: actorId,
      })
      if (res.ok) {
        setResult({ ok: true, message: t('returnSuccess') })
        onActionDone()
      } else {
        setResult({ ok: false, message: res.error ?? t('actionFailed') })
      }
    })
  }

  function handleApproveWithConditions() {
    if (!conditions.trim() || conditions.trim().length < 20) {
      setResult({ ok: false, message: 'Conditions text must be at least 20 characters (BR-012).' })
      return
    }
    startTransition(async () => {
      setResult(null)
      let res: { ok: boolean; error?: string }

      if (gateCode === 'G-S1') {
        res = await approveStrategyGate({
          strategy_id: item.id,
          master_trace_id: item.masterTraceId,
          created_by: actorId,
          decision: 'APPROVED_COND',
          conditions: conditions.trim(),
        })
      } else {
        res = await approveBudgetGate({
          budget_id: item.id,
          master_trace_id: item.masterTraceId,
          approver_user_id: actorId,
          decision: 'APPROVED_COND',
          conditions: conditions.trim(),
        })
      }

      if (res.ok) {
        setResult({ ok: true, message: t('approveCondSuccess') })
        onActionDone()
      } else {
        setResult({ ok: false, message: res.error ?? t('actionFailed') })
      }
    })
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <OfficialTag tone="info">{gateCode}</OfficialTag>
            <OfficialTag tone="warning">{t('pendingReview')}</OfficialTag>
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-text">{item.title}</p>
          <p className="font-mono text-[10px] text-text-muted">{item.masterTraceId}</p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-diriyah-bg-alt"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? t('collapse') : t('expand')}
        </button>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-4 border-t border-border bg-diriyah-bg-alt/50 px-5 py-3">
        <MetaChip icon={<User className="h-3.5 w-3.5" />} label={t('submittedBy')} value={item.submittedBy} />
        {item.submittedAt && (
          <MetaChip
            icon={<Clock className="h-3.5 w-3.5" />}
            label={t('submittedAt')}
            value={new Date(item.submittedAt).toLocaleDateString()}
          />
        )}
        {item.metaA && <MetaChip label={item.metaA.label} value={item.metaA.value} />}
        {item.metaB && <MetaChip label={item.metaB.label} value={item.metaB.value} />}
      </div>

      {/* Expanded detail */}
      {expanded && item.summary && (
        <div className="border-t border-border px-5 py-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t('executiveSummaryLabel')}
          </p>
          <p className="text-sm leading-relaxed text-text">{item.summary}</p>
        </div>
      )}

      {/* Result banner */}
      {result && (
        <div className="border-t border-border px-4 py-3">
          <RecordNotice tone={result.ok ? 'success' : 'error'} title={result.message} role="alert" />
        </div>
      )}

      {/* Return for revision form */}
      {showReturn && (
        <div className="border-t border-border bg-amber-50/60 px-5 py-4">
          <label className="mb-1.5 block text-sm font-semibold text-text">
            {t('returnReasonLabel')}
            <span className="ml-1 text-red-500">*</span>
          </label>
          <textarea
            value={returnComment}
            onChange={(e) => setReturnComment(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-text shadow-sm focus:outline-none focus:ring-2 focus:ring-diriyah-amber/40"
            placeholder={t('returnReasonPlaceholder')}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleReturn}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {t('confirmReturn')}
            </button>
            <button
              type="button"
              onClick={() => { setShowReturn(false); setReturnComment('') }}
              className="h-9 rounded-lg border border-border bg-white px-4 text-sm text-text-muted hover:bg-diriyah-bg-alt"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Approve with conditions form (BR-012 / G-03) */}
      {showConditions && (
        <div className="border-t border-border bg-blue-50/60 px-5 py-4">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-700">
            {t('approveWithConditionsTitle')}
          </p>
          <label className="mb-1.5 block text-sm font-semibold text-text">
            {t('conditionsLabel')}
            <span className="ml-1 text-red-500">*</span>
          </label>
          <textarea
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-text shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            placeholder={t('conditionsPlaceholder')}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleApproveWithConditions}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {t('confirmApproveWithConditions')}
            </button>
            <button
              type="button"
              onClick={() => { setShowConditions(false); setConditions('') }}
              className="h-9 rounded-lg border border-border bg-white px-4 text-sm text-text-muted hover:bg-diriyah-bg-alt"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Action footer */}
      {!result?.ok && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => { setShowReturn((v) => !v); setShowConditions(false); setResult(null) }}
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" />
            {t('returnForRevision')}
          </button>
          <button
            type="button"
            onClick={() => { setShowConditions((v) => !v); setShowReturn(false); setResult(null) }}
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t('approveWithConditions')}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-diriyah-primary px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {t('approve')}
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MetaChip
// ─────────────────────────────────────────────────────────────────────────────

function MetaChip({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon ? <span className="text-text-muted">{icon}</span> : null}
      <span className="text-xs text-text-muted">{label}:</span>
      <span className="text-xs font-semibold text-text">{value}</span>
    </div>
  )
}
