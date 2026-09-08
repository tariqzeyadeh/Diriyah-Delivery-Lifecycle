'use server'

import { randomInt } from 'crypto'
import { revalidatePath } from 'next/cache'
import { ResolutionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auditLog, captureException } from '@/src/lib/logger'

function generateId(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 99999)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// addComment
// ─────────────────────────────────────────────────────────────────────────────

export type AddCommentPayload = {
  master_trace_id: string
  comment_text: string
  author_id: string
  parent_id?: string
}

export type AddCommentResult =
  | { ok: true; comment_id: string }
  | { ok: false; error: string }

export async function addComment(
  payload: AddCommentPayload,
): Promise<AddCommentResult> {
  const { master_trace_id, comment_text, author_id, parent_id } = payload

  if (!master_trace_id?.trim()) return { ok: false, error: 'master_trace_id is required.' }
  if (!comment_text?.trim()) return { ok: false, error: 'Comment text cannot be empty.' }

  try {
    const comment_id = generateId('CMT')
    await prisma.comment.create({
      data: {
        comment_id,
        master_trace_id,
        comment_text: comment_text.trim(),
        parent_comment_id: parent_id ?? null,
        uploaded_by: author_id,
        created_by: author_id,
        resolution_status: 'OPEN',
        comment_type: 'GENERAL',
      },
    })

    revalidatePath(`/[locale]/(atlas)/traceability/${encodeURIComponent(master_trace_id)}/evidence`, 'page')
    auditLog({
      action_type: 'CREATE_COMMENT',
      entity_type: 'COMMENT',
      entity_id: comment_id,
      master_trace_id,
      active_user_id: author_id,
      outcome: 'success',
    })

    return { ok: true, comment_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add comment'
    captureException(err, {
      action_type: 'CREATE_COMMENT',
      entity_id: master_trace_id,
      active_user_id: author_id,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// G-18: resolveComment / reopenComment
// ─────────────────────────────────────────────────────────────────────────────

export type ResolveCommentResult =
  | { ok: true; comment_id: string; status: string }
  | { ok: false; error: string }

export async function resolveComment(
  comment_id: string,
  resolved_by: string,
): Promise<ResolveCommentResult> {
  if (!comment_id?.trim()) return { ok: false, error: 'comment_id is required.' }
  try {
    const updated = await prisma.comment.update({
      where: { comment_id },
      data: {
        resolution_status: ResolutionStatus.RESOLVED,
      },
      select: { comment_id: true, master_trace_id: true },
    })
    revalidatePath(`/[locale]/(atlas)/traceability/${encodeURIComponent(updated.master_trace_id ?? '')}/evidence`, 'page')
    auditLog({ action_type: 'RESOLVE_COMMENT', entity_type: 'COMMENT', entity_id: comment_id, active_user_id: resolved_by, outcome: 'success' })
    return { ok: true, comment_id, status: 'RESOLVED' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve comment'
    captureException(err, { action_type: 'RESOLVE_COMMENT', entity_id: comment_id, active_user_id: resolved_by, outcome: 'failure', error: message })
    return { ok: false, error: message }
  }
}

export async function reopenComment(
  comment_id: string,
  reopened_by: string,
): Promise<ResolveCommentResult> {
  if (!comment_id?.trim()) return { ok: false, error: 'comment_id is required.' }
  try {
    const updated = await prisma.comment.update({
      where: { comment_id },
      data: {
        resolution_status: ResolutionStatus.REOPENED,
      },
      select: { comment_id: true, master_trace_id: true },
    })
    revalidatePath(`/[locale]/(atlas)/traceability/${encodeURIComponent(updated.master_trace_id ?? '')}/evidence`, 'page')
    return { ok: true, comment_id, status: 'REOPENED' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reopen comment'
    captureException(err, { action_type: 'REOPEN_COMMENT', entity_id: comment_id, active_user_id: reopened_by, outcome: 'failure', error: message })
    return { ok: false, error: message }
  }
}
