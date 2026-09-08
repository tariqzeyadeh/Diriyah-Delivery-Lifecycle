'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  CheckCircle2,
  FileUp,
  Lock,
  MessageSquare,
  RotateCcw,
  X,
  Loader2,
  FileDown,
  ScrollText,
} from 'lucide-react'
import { useAuth } from '@/src/providers/AuthProvider'
import { useTranslations } from 'next-intl'
import {
  createAttachmentRecord,
  createCommentRecord,
  listGateApprovals,
  submitGateDecision,
} from '@/src/actions/gates'

export type ApprovalGateProps = {
  entityType: string
  entityId: string
  masterTraceId?: string
  gateCode: string
  versionNumber?: number
  approverUserId?: string
  title?: string
  onDecisionComplete?: (decision: 'APPROVED' | 'RETURNED') => void
}

type LocalAttachment = {
  attachment_id: string
  file_name: string
  file_size_bytes: number
  virus_scan_status: string
}

type LocalComment = {
  comment_id: string
  comment_text: string
  requires_resolution: boolean
  created_at: string
}

type HistoryRow = {
  approval_id: string
  gate_code: string
  decision: string
  decision_at: string | null
  approver_user_id: string
  version_hash: string
}

export function ApprovalGate({
  entityType,
  entityId,
  masterTraceId,
  gateCode,
  versionNumber = 1,
  approverUserId: _approverUserId = 'mohammed.alnuaimi',
  title = 'Evidence & Approval Center',
  onDecisionComplete,
}: ApprovalGateProps) {
  const t = useTranslations('common')
  const { currentUser, canDecideGate, awaitingRoleForGate } = useAuth()
  const canDecide = canDecideGate(gateCode)
  const awaitingRole = awaitingRoleForGate(gateCode)
  const actorId = currentUser.id
  const inputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [comments, setComments] = useState<LocalComment[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [commentText, setCommentText] = useState('')
  const [requiresResolution, setRequiresResolution] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnComments, setReturnComments] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refreshHistory = useCallback(async () => {
    const rows = await listGateApprovals(entityId, masterTraceId)
    setHistory(
      rows.map((r) => ({
        approval_id: r.approval_id,
        gate_code: r.gate_code,
        decision: String(r.decision),
        decision_at: r.decision_at
          ? typeof r.decision_at === 'string'
            ? r.decision_at
            : r.decision_at.toISOString()
          : null,
        approver_user_id: r.approver_user_id,
        version_hash: r.version_hash,
      })),
    )
  }, [entityId, masterTraceId])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return
      const file = files[0]
      startTransition(async () => {
        setError(null)
        const result = await createAttachmentRecord({
          entity_type: entityType,
          entity_id: entityId,
          master_trace_id: masterTraceId,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || 'application/octet-stream',
          uploaded_by: actorId,
        })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setAttachments((prev) => [
          {
            attachment_id: result.attachment.attachment_id,
            file_name: result.attachment.file_name,
            file_size_bytes: result.attachment.file_size_bytes,
            virus_scan_status: result.attachment.virus_scan_status,
          },
          ...prev,
        ])
        setMessage(`Uploaded ${file.name} — virus scan PASSED`)
      })
    },
    [actorId, entityId, entityType, masterTraceId],
  )

  function addComment() {
    if (!commentText.trim()) return
    startTransition(async () => {
      setError(null)
      const result = await createCommentRecord({
        entity_type: entityType,
        entity_id: entityId,
        master_trace_id: masterTraceId,
        comment_text: commentText.trim(),
        requires_resolution: requiresResolution,
        uploaded_by: actorId,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setComments((prev) => [
        {
          comment_id: result.comment.comment_id,
          comment_text: result.comment.comment_text,
          requires_resolution: requiresResolution,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ])
      setCommentText('')
      setRequiresResolution(false)
      setMessage('Comment recorded')
    })
  }

  function approve() {
    startTransition(async () => {
      setError(null)
      const result = await submitGateDecision({
        entity_type: entityType,
        entity_id: entityId,
        master_trace_id: masterTraceId,
        gate_code: gateCode,
        decision: 'APPROVED',
        approver_user_id: actorId,
        version_number: versionNumber,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage('Approved — ApprovalTransaction recorded (BR-008)')
      await refreshHistory()
      onDecisionComplete?.('APPROVED')
    })
  }

  function submitReturn() {
    if (!returnComments.trim()) {
      setError('Decision comments are mandatory when returning for revision.')
      return
    }
    startTransition(async () => {
      setError(null)
      const result = await submitGateDecision({
        entity_type: entityType,
        entity_id: entityId,
        master_trace_id: masterTraceId,
        gate_code: gateCode,
        decision: 'RETURNED',
        decision_comments: returnComments.trim(),
        approver_user_id: actorId,
        version_number: versionNumber,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setReturnOpen(false)
      setReturnComments('')
      setMessage('Returned for revision — comments recorded')
      await refreshHistory()
      onDecisionComplete?.('RETURNED')
    })
  }

  return (
    <section className="card overflow-hidden bg-white p-0">
      <div className="border-b border-border bg-diriyah-bg-alt/80 px-6 py-4">
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        <p className="text-sm text-text-muted">
          Gate <span className="font-mono text-diriyah-primary">{gateCode}</span> · {entityType} ·{' '}
          <span className="font-mono">{entityId}</span>
        </p>
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <FileUp className="h-4 w-4 text-diriyah-accent" />
            Evidence Vault
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFiles(e.dataTransfer.files)
            }}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-diriyah-bg-secondary bg-diriyah-bg-alt/60 px-4 py-10 text-center transition hover:border-diriyah-accent"
            disabled={pending}
          >
            <FileUp className="h-8 w-8 text-diriyah-primary" />
            <p className="text-sm font-medium text-text">Drop files or click to upload</p>
            <p className="text-xs text-text-muted">
              Simulated upload → Attachment (virus_scan = PASSED)
            </p>
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <ul className="space-y-2">
            {attachments.map((a) => (
              <li
                key={a.attachment_id}
                className="flex items-center justify-between rounded-lg border border-border bg-diriyah-bg-alt/40 px-3 py-2 text-sm"
              >
                <span className="truncate font-medium text-text">{a.file_name}</span>
                <span className="shrink-0 text-xs text-diriyah-green">{a.virus_scan_status}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <MessageSquare className="h-4 w-4 text-diriyah-accent" />
            Comment Thread
          </div>
          <textarea
            className="input-base min-h-24 py-3"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment or validation finding…"
          />
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={requiresResolution}
              onChange={(e) => setRequiresResolution(e.target.checked)}
              className="accent-[var(--diriyah-primary)]"
            />
            Requires Resolution (BR-027 finding)
          </label>
          <button
            type="button"
            className="btn h-10 border-border bg-white text-sm"
            onClick={addComment}
            disabled={pending || !commentText.trim()}
          >
            Add comment
          </button>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {comments.map((c) => (
              <li key={c.comment_id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="text-text">{c.comment_text}</p>
                {c.requires_resolution ? (
                  <p className="mt-1 text-xs font-semibold text-diriyah-red">
                    Requires resolution · OPEN
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-text-muted">General note</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Decision history + PDF receipts */}
      <div className="border-t border-border px-6 py-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
          <ScrollText className="h-4 w-4 text-diriyah-accent" />
          Decision History · BR-008 Receipts
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-text-muted">
            No decided transactions yet for this gate context.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {history.map((h) => {
              const canReceipt =
                h.decision === 'APPROVED' ||
                h.decision === 'RETURNED' ||
                h.decision === 'APPROVED_COND' ||
                h.decision === 'REJECTED'
              return (
                <li
                  key={h.approval_id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-text">
                      <span className="font-mono text-diriyah-primary">{h.gate_code}</span>
                      {' · '}
                      <span className="font-semibold">{h.decision}</span>
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {h.approver_user_id}
                      {h.decision_at ? ` · ${new Date(h.decision_at).toLocaleString('en-GB')}` : ''}
                      {' · '}
                      <span className="font-mono">{h.approval_id}</span>
                    </p>
                  </div>
                  {canReceipt ? (
                    <a
                      href={`/api/export/certificate/${encodeURIComponent(h.approval_id)}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-diriyah-primary no-underline hover:border-diriyah-accent"
                      title="Download PDF Receipt"
                      aria-label={`Download PDF receipt for ${h.approval_id}`}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      PDF Receipt
                    </a>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {(message || error) && (
        <div className="px-6 pb-2">
          {error ? (
            <p
              className="rounded-lg px-3 py-2 text-sm text-white"
              style={{ background: 'var(--diriyah-red)' }}
            >
              {error}
            </p>
          ) : (
            <p className="rounded-lg bg-diriyah-green/10 px-3 py-2 text-sm text-diriyah-green">
              {message}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border bg-diriyah-bg-alt/50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        {!canDecide ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-diriyah-amber/40 bg-diriyah-amber/10 px-3 py-1.5 text-sm font-semibold text-diriyah-primary">
            <Lock className="h-4 w-4" />
            Awaiting {awaitingRole} Approval
          </div>
        ) : (
          <p className="text-xs text-text-muted">
            Acting as {currentUser.name} · {currentUser.role}
          </p>
        )}
        {canDecide ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn h-11 px-5 text-sm text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--diriyah-amber)', borderColor: 'transparent' }}
              onClick={() => setReturnOpen(true)}
              disabled={pending}
              data-testid="gate-return"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {t('returnForRevision')}
            </button>
            <button
              type="button"
              className="btn h-11 px-5 text-sm text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--diriyah-green)', borderColor: 'transparent' }}
              onClick={approve}
              disabled={pending}
              data-testid="gate-approve"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {pending ? 'Working…' : t('approve')}
            </button>
          </div>
        ) : null}
      </div>

      {returnOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold text-text">{t('returnForRevision')}</h3>
              <button type="button" onClick={() => setReturnOpen(false)} aria-label="Close">
                <X className="h-5 w-5 text-text-muted" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-text-muted">
                Decision comments are mandatory when returning a record (BR-008).
              </p>
              <textarea
                className="input-base min-h-28 py-3"
                value={returnComments}
                onChange={(e) => setReturnComments(e.target.value)}
                placeholder="Describe what must be corrected…"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn h-10 border-border bg-white text-sm"
                  onClick={() => setReturnOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn h-10 px-4 text-sm text-white"
                  style={{ backgroundColor: 'var(--diriyah-amber)', borderColor: 'transparent' }}
                  onClick={submitReturn}
                  disabled={pending || !returnComments.trim()}
                >
                  {t('confirmReturn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default ApprovalGate
