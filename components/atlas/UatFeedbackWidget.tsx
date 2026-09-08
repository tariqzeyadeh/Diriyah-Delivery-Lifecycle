'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { MessageSquarePlus, X, Loader2, CheckCircle2 } from 'lucide-react'
import { submitUatFeedback } from '@/src/actions/uat-feedback'
import { useAuth } from '@/src/providers/AuthProvider'
import { cn } from '@/lib/utils'

type IssueType = 'BUG' | 'UI_UX' | 'FEATURE_REQUEST'

const ISSUE_OPTIONS: { value: IssueType; label: string }[] = [
  { value: 'BUG', label: 'Bug' },
  { value: 'UI_UX', label: 'UI/UX' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
]

/** Extract Master Trace ID from path when present (e.g. /traceability/TECH-2027-0001). */
function extractMasterTraceId(pathname: string): string | null {
  const match = pathname.match(/TECH-\d{4}-\d{4}/i)
  return match ? match[0].toUpperCase() : null
}

/**
 * Floating UAT feedback widget for pilot users.
 * Captures issue type, description, current URL, and master_trace_id (when in context).
 */
export function UatFeedbackWidget() {
  const pathname = usePathname()
  const { currentUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [issueType, setIssueType] = useState<IssueType>('BUG')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const masterTraceId = useMemo(() => extractMasterTraceId(pathname || ''), [pathname])

  useEffect(() => {
    if (!open) {
      setMessage(null)
      setError(null)
    }
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)

    startTransition(async () => {
      const result = await submitUatFeedback({
        issue_type: issueType,
        description,
        page_path: pathname || '/',
        master_trace_id: masterTraceId,
        submitted_by: currentUser.email,
        submitted_by_role: currentUser.role,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setMessage(`Thanks — feedback ${result.feedback_id} recorded.`)
      setDescription('')
      setIssueType('BUG')
    })
  }

  return (
    <div className="pointer-events-none fixed bottom-20 end-5 z-[60] flex flex-col items-end gap-3 md:bottom-5">
      {open ? (
        <div className="pointer-events-auto w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-border bg-diriyah-bg-alt/80 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-text">UAT Feedback</p>
              <p className="text-xs text-text-muted">Report an issue from this screen</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1 text-text-muted hover:bg-white"
              onClick={() => setOpen(false)}
              aria-label="Close feedback"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 px-4 py-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Issue Type
              </span>
              <select
                className="input-base h-10 w-full"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value as IssueType)}
                disabled={pending}
              >
                {ISSUE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Description
              </span>
              <textarea
                className="input-base min-h-28 w-full py-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened? What did you expect?"
                disabled={pending}
                required
                minLength={10}
              />
            </label>

            {/* Hidden session context — also shown for transparency */}
            <input type="hidden" name="page_path" value={pathname || '/'} readOnly />
            <input type="hidden" name="master_trace_id" value={masterTraceId ?? ''} readOnly />

            <div className="rounded-lg border border-dashed border-border bg-diriyah-bg-alt/50 px-3 py-2 text-[11px] text-text-muted">
              <p>
                <span className="font-semibold text-text">Path:</span> {pathname || '/'}
              </p>
              <p className="mt-0.5">
                <span className="font-semibold text-text">Master Trace:</span>{' '}
                {masterTraceId ?? '— (not on a spine route)'}
              </p>
              <p className="mt-0.5">
                <span className="font-semibold text-text">User:</span> {currentUser.email}
              </p>
            </div>

            {error ? (
              <p
                className="rounded-lg px-3 py-2 text-xs text-white"
                style={{ background: 'var(--diriyah-red)' }}
              >
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="inline-flex items-center gap-1.5 rounded-lg bg-diriyah-green/10 px-3 py-2 text-xs text-diriyah-green">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              className="btn btn-primary h-10 w-full text-sm disabled:opacity-60"
              disabled={pending || description.trim().length < 10}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? 'Sending…' : 'Submit feedback'}
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        data-tour="tour-uat-feedback"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white shadow-lg transition',
          'bg-[var(--diriyah-primary)] hover:opacity-95',
        )}
        aria-expanded={open}
        aria-label="Open UAT feedback"
      >
        <MessageSquarePlus className="h-5 w-5" />
        Feedback
      </button>
    </div>
  )
}

export default UatFeedbackWidget
