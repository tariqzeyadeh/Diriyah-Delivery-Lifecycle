'use client'

import { useState, useTransition } from 'react'
import { Send, Loader2, MessageSquare, CornerDownRight, CheckCircle, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { addComment, resolveComment, reopenComment } from '@/src/actions/evidence'

type CommentRow = {
  comment_id: string
  comment_text: string
  uploaded_by: string
  created_at: Date
  parent_comment_id: string | null
  resolution_status?: string | null
  replies: CommentRow[]
}

type Props = {
  masterTraceId: string
  initialComments: CommentRow[]
  currentUserEmail: string
}

function initials(email: string): string {
  const parts = email.split('@')[0].split('.')
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(date),
  )
}

function CommentItem({
  comment,
  onReply,
  replyTo,
  currentUserEmail,
  onStatusChange,
}: {
  comment: CommentRow
  onReply: (id: string | null) => void
  replyTo: string | null
  currentUserEmail: string
  onStatusChange: (id: string, status: string) => void
}) {
  const t = useTranslations('evidence')
  const [resolving, startResolve] = useTransition()
  const isResolved = comment.resolution_status === 'RESOLVED'

  function handleResolve() {
    startResolve(async () => {
      const res = isResolved
        ? await reopenComment(comment.comment_id, currentUserEmail)
        : await resolveComment(comment.comment_id, currentUserEmail)
      if (res.ok) onStatusChange(comment.comment_id, res.status)
    })
  }

  return (
    <div className={cn('space-y-3 rounded-md p-3', isResolved ? 'bg-green-50/60 opacity-75' : '')}>
      <div className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-diriyah-primary text-xs font-bold text-white">
          {initials(comment.uploaded_by)}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-text">{comment.uploaded_by}</span>
            <span className="text-xs text-text-muted">{formatTime(comment.created_at)}</span>
            {isResolved && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">✓ {t('resolved')}</span>
            )}
          </div>
          <p className={cn('mt-1 text-sm leading-relaxed', isResolved ? 'text-text-muted line-through' : 'text-text')}>
            {comment.comment_text}
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => onReply(replyTo === comment.comment_id ? null : comment.comment_id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-diriyah-accent hover:underline"
            >
              <CornerDownRight className="h-3 w-3" />
              {t('reply')}
            </button>
            {/* G-18: Resolve / Reopen */}
            <button
              type="button"
              disabled={resolving}
              onClick={handleResolve}
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium hover:underline',
                isResolved ? 'text-text-muted' : 'text-green-700',
              )}
            >
              {resolving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isResolved ? (
                <RotateCcw className="h-3 w-3" />
              ) : (
                <CheckCircle className="h-3 w-3" />
              )}
              {isResolved ? t('reopen') : t('resolve')}
            </button>
          </div>
        </div>
      </div>
      {comment.replies.length > 0 && (
        <div className="ml-11 space-y-3 border-l-2 border-diriyah-bg-secondary pl-4">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.comment_id} comment={reply} onReply={onReply} replyTo={replyTo} currentUserEmail={currentUserEmail} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}
    </div>
  )
}

export function DiscussionPanel({ masterTraceId, initialComments, currentUserEmail }: Props) {
  const t = useTranslations('evidence')
  const [comments, setComments] = useState<CommentRow[]>(initialComments)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startSend] = useTransition()

  // G-18: optimistically update resolution status
  function handleStatusChange(id: string, status: string) {
    setComments((prev) =>
      prev.map((c) =>
        c.comment_id === id
          ? { ...c, resolution_status: status }
          : { ...c, replies: c.replies.map((r) => r.comment_id === id ? { ...r, resolution_status: status } : r) }
      )
    )
  }

  const topLevel = comments.filter((c) => !c.parent_comment_id)

  function handleSend() {
    if (!text.trim() || pending) return
    setError(null)
    const draft = text
    setText('')
    startSend(async () => {
      const result = await addComment({
        master_trace_id: masterTraceId,
        comment_text: draft,
        author_id: currentUserEmail,
        parent_id: replyTo ?? undefined,
      })
      if (result.ok) {
        const newComment: CommentRow = {
          comment_id: result.comment_id,
          comment_text: draft,
          uploaded_by: currentUserEmail,
          created_at: new Date(),
          parent_comment_id: replyTo,
          replies: [],
        }
        setComments((prev) => {
          if (!replyTo) return [...prev, newComment]
          return prev.map((c) =>
            c.comment_id === replyTo ? { ...c, replies: [...c.replies, newComment] } : c,
          )
        })
        setReplyTo(null)
      } else {
        setError(result.error)
        setText(draft)
      }
    })
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Thread */}
      <div className="flex-1 space-y-5 overflow-y-auto">
        {topLevel.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <MessageSquare className="h-8 w-8 text-text-muted/40" />
            <p className="text-sm text-text-muted">{t('noComments')}</p>
          </div>
        ) : (
          topLevel.map((c) => (
            <CommentItem key={c.comment_id} comment={c} onReply={setReplyTo} replyTo={replyTo} currentUserEmail={currentUserEmail} onStatusChange={handleStatusChange} />
          ))
        )}
      </div>

      {/* Compose */}
      <div className="rounded-md border border-border bg-diriyah-bg-alt/60 p-3">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 text-xs text-text-muted">
            <CornerDownRight className="h-3 w-3" />
            <span>Replying to comment</span>
            <button type="button" onClick={() => setReplyTo(null)} className="ml-auto text-diriyah-red hover:underline">
              Cancel
            </button>
          </div>
        )}
        {error && <p className="mb-2 text-xs text-diriyah-red">{error}</p>}
        <div className="flex gap-2">
          <textarea
            className="input-base flex-1 resize-none py-2 text-sm"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('addComment')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend()
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || pending}
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-lg',
              'bg-diriyah-primary text-white hover:bg-diriyah-primary/90 disabled:opacity-40',
            )}
            aria-label={t('send')}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-text-muted">Ctrl/⌘+Enter to send</p>
      </div>
    </div>
  )
}
