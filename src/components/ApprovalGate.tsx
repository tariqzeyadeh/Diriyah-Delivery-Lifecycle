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
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/src/providers/AuthProvider'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/src/i18n/navigation'
import {
  createAttachmentRecord,
  createCommentRecord,
  deleteAttachmentRecord,
  listGateApprovals,
  listGateAttachments,
  listGateComments,
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
  alreadyDecided?: boolean
}

type LocalAttachment = {
  attachment_id: string
  file_name: string
  file_size_bytes: number
  virus_scan_status: string
  uploaded_by?: string
  uploaded_at?: string
  has_download: boolean
}

type LocalComment = {
  comment_id: string
  comment_text: string
  requires_resolution: boolean
  created_at: string
  uploaded_by?: string
}

const MAX_INLINE_BYTES = 2 * 1024 * 1024

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result ?? '')
      const comma = raw.indexOf(',')
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
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
  alreadyDecided = false,
}: ApprovalGateProps) {
  const t = useTranslations('common')
  const router = useRouter()
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
  const [localClosed, setLocalClosed] = useState(alreadyDecided)
  const blobUrls = useRef(new Map<string, string>())

  useEffect(() => {
    const blobs = blobUrls.current
    return () => {
      for (const url of blobs.values()) URL.revokeObjectURL(url)
      blobs.clear()
    }
  }, [])

  useEffect(() => {
    if (alreadyDecided) setLocalClosed(true)
  }, [alreadyDecided])

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

  const refreshEvidence = useCallback(async () => {
    const [files, notes] = await Promise.all([
      listGateAttachments(entityId, masterTraceId),
      listGateComments(entityId, masterTraceId),
    ])
    setAttachments(
      files.map((a) => ({
        attachment_id: a.attachment_id,
        file_name: a.file_name,
        file_size_bytes: a.file_size_bytes,
        virus_scan_status: String(a.virus_scan_status),
        uploaded_by: a.uploaded_by,
        uploaded_at: a.uploaded_at ? new Date(a.uploaded_at).toISOString() : undefined,
        has_download: a.has_download,
      })),
    )
    setComments(
      notes.map((c) => ({
        comment_id: c.comment_id,
        comment_text: c.comment_text,
        requires_resolution: c.comment_type === 'VALIDATION_FINDING',
        created_at: new Date(c.created_at).toISOString(),
        uploaded_by: c.uploaded_by,
      })),
    )
  }, [entityId, masterTraceId])

  useEffect(() => {
    void refreshHistory()
    void refreshEvidence()
  }, [refreshHistory, refreshEvidence])

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return
      const file = files[0]
      startTransition(async () => {
        setError(null)
        let file_content_base64: string | undefined
        if (file.size <= MAX_INLINE_BYTES) {
          try {
            file_content_base64 = await fileToBase64(file)
          } catch {
            setError('Could not read the selected file.')
            return
          }
        }
        const result = await createAttachmentRecord({
          entity_type: entityType,
          entity_id: entityId,
          master_trace_id: masterTraceId,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || 'application/octet-stream',
          uploaded_by: actorId,
          file_content_base64,
        })
        if (!result.ok) {
          setError(result.error)
          return
        }
        const blobUrl = URL.createObjectURL(file)
        blobUrls.current.set(result.attachment.attachment_id, blobUrl)
        setAttachments((prev) => [
          {
            attachment_id: result.attachment.attachment_id,
            file_name: result.attachment.file_name,
            file_size_bytes: result.attachment.file_size_bytes,
            virus_scan_status: result.attachment.virus_scan_status,
            uploaded_by: actorId,
            uploaded_at: new Date().toISOString(),
            has_download: true,
          },
          ...prev,
        ])
        setMessage(`Uploaded ${file.name} — virus scan PASSED`)
      })
    },
    [actorId, entityId, entityType, masterTraceId],
  )

  function downloadAttachment(a: LocalAttachment) {
    const blobUrl = blobUrls.current.get(a.attachment_id)
    if (blobUrl) {
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = a.file_name
      link.click()
      return
    }
    if (!a.has_download) {
      setError('This attachment has no stored file to download.')
      return
    }
    window.location.href = `/api/storage/attachment/${encodeURIComponent(a.attachment_id)}`
  }

  function removeAttachment(a: LocalAttachment) {
    startTransition(async () => {
      setError(null)
      const result = await deleteAttachmentRecord(a.attachment_id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const blobUrl = blobUrls.current.get(a.attachment_id)
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        blobUrls.current.delete(a.attachment_id)
      }
      setAttachments((prev) => prev.filter((row) => row.attachment_id !== a.attachment_id))
      setMessage(`Removed ${a.file_name}`)
    })
  }

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
          uploaded_by: actorId,
        },
        ...prev,
      ])
      setCommentText('')
      setRequiresResolution(false)
      setMessage('Comment recorded')
    })
  }

  const gateClosed =
    alreadyDecided ||
    localClosed ||
    history.some(
      (h) =>
        h.gate_code === gateCode &&
        (h.decision === 'APPROVED' || h.decision === 'APPROVED_COND'),
    )

  function approve() {
    if (gateClosed) return
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
      setLocalClosed(true)
      setMessage('Approved — ApprovalTransaction recorded (BR-008)')
      await refreshHistory()
      onDecisionComplete?.('APPROVED')
      router.refresh()
    })
  }

  function submitReturn() {
    if (gateClosed) return
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
            {attachments.length === 0 ? (
              <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-muted">
                No attachments yet.
              </li>
            ) : (
              attachments.map((a) => (
                <li
                  key={a.attachment_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-diriyah-bg-alt/40 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text">{a.file_name}</p>
                    <p className="truncate text-[11px] text-text-muted">
                      {a.virus_scan_status}
                      {a.uploaded_by ? ` · ${a.uploaded_by}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => downloadAttachment(a)}
                      disabled={pending || (!a.has_download && !blobUrls.current.has(a.attachment_id))}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-2 text-[11px] font-semibold text-diriyah-primary hover:border-diriyah-accent disabled:opacity-50"
                      title="Download attachment"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a)}
                      disabled={pending}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      title="Delete attachment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </li>
              ))
            )}
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
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
              Submitted comments
            </p>
            {comments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-muted">
                No comments submitted yet.
              </p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {comments.map((c) => (
                  <li key={c.comment_id} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <p className="text-text">{c.comment_text}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {c.uploaded_by ?? 'Unknown'}
                      {c.created_at
                        ? ` · ${new Date(c.created_at).toLocaleString('en-GB')}`
                        : ''}
                    </p>
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
            )}
          </div>
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
        {gateClosed ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-diriyah-green/40 bg-diriyah-green/10 px-3 py-1.5 text-sm font-semibold text-diriyah-green">
            <CheckCircle2 className="h-4 w-4" />
            Already approved at this gate
          </div>
        ) : !canDecide ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-diriyah-amber/40 bg-diriyah-amber/10 px-3 py-1.5 text-sm font-semibold text-diriyah-primary">
            <Lock className="h-4 w-4" />
            Awaiting {awaitingRole} Approval
          </div>
        ) : (
          <p className="text-xs text-text-muted">
            Acting as {currentUser.name} · {currentUser.role}
          </p>
        )}
        {canDecide && !gateClosed ? (
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
