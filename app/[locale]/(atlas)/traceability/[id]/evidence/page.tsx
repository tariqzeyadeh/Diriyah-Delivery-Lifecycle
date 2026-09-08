import { notFound } from 'next/navigation'
import { Link } from '@/src/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { getAtlasSession } from '@/src/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { FileText, FileSpreadsheet, FileIcon, Upload, Download } from 'lucide-react'
import { DiscussionPanel } from '@/components/atlas/evidence/DiscussionPanel'
import { PageIntro } from '@/components/atlas/records'
import { cn } from '@/lib/utils'

type Props = {
  params: Promise<{ id: string }>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(date))
}

function FileTypeIcon({ mime }: { mime: string }) {
  if (mime.includes('pdf')) return <FileText className="h-5 w-5 text-diriyah-red" />
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv'))
    return <FileSpreadsheet className="h-5 w-5 text-diriyah-green" />
  return <FileIcon className="h-5 w-5 text-diriyah-primary" />
}

function auditDotColor(actionType: string): string {
  const at = actionType.toUpperCase()
  if (at.includes('SUBMIT') || at.includes('PUBLISH') || at.includes('APPROVE'))
    return 'bg-diriyah-green'
  if (at.includes('RETURN') || at.includes('REJECT') || at.includes('HOLD'))
    return 'bg-diriyah-red'
  return 'bg-diriyah-amber'
}

function auditLabel(actionType: string): string {
  return actionType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function EvidencePage({ params }: Props) {
  const { id } = await params
  const masterTraceId = decodeURIComponent(id)
  const t = await getTranslations('common')
  const te = await getTranslations('evidencePage')

  // Check master trace exists
  const trace = await prisma.masterTrace.findUnique({
    where: { master_trace_id: masterTraceId },
    select: { master_trace_id: true, entry_route: true },
  })
  if (!trace) notFound()

  const session = await getAtlasSession()
  const currentUserEmail = session?.user?.email ?? 'anonymous'

  // Fetch all three panels in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawAttachments, rawComments, rawAuditEvents] = await Promise.all([
    prisma.attachment.findMany({
      where: { master_trace_id: masterTraceId },
      orderBy: { uploaded_at: 'desc' },
      take: 100,
      select: {
        attachment_id: true,
        file_name: true,
        file_size_bytes: true,
        mime_type: true,
        document_type: true,
        uploaded_at: true,
        uploaded_by: true,
      },
    }),
    prisma.comment.findMany({
      where: { master_trace_id: masterTraceId },
      orderBy: { created_at: 'asc' },
      take: 200,
      select: {
        comment_id: true,
        comment_text: true,
        uploaded_by: true,
        created_at: true,
        parent_comment_id: true,
      },
    }),
    // Use ApprovalTransaction as audit trail source since there's no AuditLog table
    prisma.approvalTransaction.findMany({
      where: { master_trace_id: masterTraceId },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        approval_id: true,
        gate_code: true,
        decision: true,
        approver_user_id: true,
        created_at: true,
        decision_at: true,
      },
    }),
  ])

  // Nest comment replies
  type CommentRow = {
    comment_id: string
    comment_text: string
    uploaded_by: string
    created_at: Date
    parent_comment_id: string | null
    replies: CommentRow[]
  }

  const commentMap = new Map<string, CommentRow>()
  for (const c of rawComments) {
    commentMap.set(c.comment_id, { ...c, replies: [] })
  }
  const topLevelComments: CommentRow[] = []
  for (const c of rawComments) {
    const node = commentMap.get(c.comment_id)!
    if (c.parent_comment_id && commentMap.has(c.parent_comment_id)) {
      commentMap.get(c.parent_comment_id)!.replies.push(node)
    } else {
      topLevelComments.push(node)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageIntro
        eyebrow={`${t('traceabilityExplorer')} · Evidence & Discussion`}
        title={te('pageTitle')}
        description={masterTraceId}
        actions={
          <>
            <Link
              href={`/traceability/${encodeURIComponent(masterTraceId)}`}
              className="text-xs font-semibold text-diriyah-accent no-underline hover:underline"
            >
              ← Lifecycle Map
            </Link>
            <Link
              href="/traceability"
              className="text-xs font-semibold text-diriyah-accent no-underline hover:underline"
            >
              {t('allSpines')}
            </Link>
          </>
        }
      />

      {/* 3-panel layout */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Left: Evidence Library */}
        <div className="xl:col-span-1">
          <div className="rounded-md border border-border bg-white">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-text">{te('evidencePanel')}</h2>
                <p className="text-xs text-text-muted">{rawAttachments.length} file(s)</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-text hover:bg-diriyah-bg-alt"
                title="Upload attachment (connects to Storage API)"
              >
                <Upload className="h-3.5 w-3.5" /> Upload
              </button>
            </div>
            {rawAttachments.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-text-muted">
                {te('noAttachments')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rawAttachments.map((a) => (
                  <li key={a.attachment_id} className="flex items-start gap-3 px-5 py-3">
                    <FileTypeIcon mime={a.mime_type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{a.file_name}</p>
                      <p className="text-xs text-text-muted">
                        {formatBytes(a.file_size_bytes)} · {formatDate(a.uploaded_at)}
                      </p>
                      <p className="text-[11px] text-diriyah-accent">{a.document_type}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Center: Discussion */}
        <div className="xl:col-span-1">
          <div className="rounded-md border border-border bg-white">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-text">{te('discussionPanel')}</h2>
              <p className="text-xs text-text-muted">{rawComments.length} comment(s)</p>
            </div>
            <div className="p-5">
              <DiscussionPanel
                masterTraceId={masterTraceId}
                initialComments={topLevelComments}
                currentUserEmail={currentUserEmail}
              />
            </div>
          </div>
        </div>

        {/* Right: Audit Trail */}
        <div className="xl:col-span-1">
          <div className="rounded-md border border-border bg-white">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-text">{te('auditPanel')}</h2>
                <p className="text-xs text-text-muted">{rawAuditEvents.length} event(s)</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-text hover:bg-diriyah-bg-alt"
                title="Export audit log as CSV"
              >
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>
            {rawAuditEvents.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-text-muted">
                {te('noAudit')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rawAuditEvents.map((e) => {
                  const actionType = `${e.gate_code}_${e.decision}`
                  return (
                    <li key={e.approval_id} className="flex items-start gap-3 px-5 py-3">
                      <span
                        className={cn(
                          'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                          auditDotColor(actionType),
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text">
                          {auditLabel(actionType)}
                        </p>
                        <p className="text-xs text-text-muted">{e.approver_user_id}</p>
                        <p className="text-[11px] text-text-muted/70">
                          {formatDate(e.decision_at ?? e.created_at)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
