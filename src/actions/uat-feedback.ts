'use server'

import { randomInt } from 'crypto'
import { UatIssueType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auditLog, captureException } from '@/src/lib/logger'

export type SubmitUatFeedbackPayload = {
  issue_type: 'BUG' | 'UI_UX' | 'FEATURE_REQUEST'
  description: string
  page_path: string
  master_trace_id?: string | null
  submitted_by?: string
  submitted_by_role?: string
  user_agent?: string
}

export type SubmitUatFeedbackResult =
  { ok: true; feedback_id: string } | { ok: false; error: string }

const ISSUE_MAP: Record<SubmitUatFeedbackPayload['issue_type'], UatIssueType> = {
  BUG: UatIssueType.BUG,
  UI_UX: UatIssueType.UI_UX,
  FEATURE_REQUEST: UatIssueType.FEATURE_REQUEST,
}

function generateFeedbackId(): string {
  const y = new Date().getFullYear()
  return `UAT-${y}-${String(randomInt(1000, 10000))}`
}

export async function submitUatFeedback(
  payload: SubmitUatFeedbackPayload,
): Promise<SubmitUatFeedbackResult> {
  const description = payload.description?.trim() ?? ''
  const page_path = payload.page_path?.trim() ?? ''
  const issue_type = payload.issue_type

  if (!issue_type || !ISSUE_MAP[issue_type]) {
    return { ok: false, error: 'Invalid issue type.' }
  }
  if (description.length < 10) {
    return { ok: false, error: 'Description must be at least 10 characters.' }
  }
  if (!page_path) {
    return { ok: false, error: 'page_path is required.' }
  }

  const submitted_by = (payload.submitted_by?.trim() || 'anonymous').slice(0, 128)
  const master_trace_id = payload.master_trace_id?.trim() || null
  const feedback_id = generateFeedbackId()

  try {
    await prisma.uatFeedback.create({
      data: {
        feedback_id,
        issue_type: ISSUE_MAP[issue_type],
        description,
        page_path: page_path.slice(0, 512),
        master_trace_id: master_trace_id?.slice(0, 64) || null,
        submitted_by,
        submitted_by_role: payload.submitted_by_role?.slice(0, 128) || null,
        user_agent: payload.user_agent?.slice(0, 512) || null,
        status: 'OPEN',
      },
    })

    auditLog({
      action_type: 'UAT_FEEDBACK',
      master_trace_id,
      active_user_id: submitted_by,
      outcome: 'success',
      entity_type: 'UAT_FEEDBACK',
      entity_id: feedback_id,
      issue_type,
      page_path,
    })

    return { ok: true, feedback_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit UAT feedback'
    captureException(err, {
      action_type: 'UAT_FEEDBACK',
      master_trace_id,
      active_user_id: submitted_by,
      outcome: 'failure',
      error: message,
    })
    return { ok: false, error: message }
  }
}
