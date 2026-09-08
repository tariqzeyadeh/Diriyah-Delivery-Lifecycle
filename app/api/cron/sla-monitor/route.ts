import { NextResponse } from 'next/server'
import { DecisionEnum } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertCronAuthorized } from '@/src/lib/cron-auth'
import { auditLog, captureException } from '@/src/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * CRON — flag pending ApprovalTransaction rows past sla_due_at.
 * Schedule: hourly (see vercel.json).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: Request) {
  const denied = assertCronAuthorized(req)
  if (denied) return denied

  const now = new Date()

  try {
    const pending = await prisma.approvalTransaction.findMany({
      where: {
        decision: DecisionEnum.PENDING,
        OR: [{ is_overdue: false }, { is_overdue: null }],
        sla_due_at: { lt: now },
      },
      select: {
        approval_id: true,
        master_trace_id: true,
        gate_code: true,
        sla_due_at: true,
      },
    })

    if (pending.length === 0) {
      return NextResponse.json({
        ok: true,
        ran_at: now.toISOString(),
        pending_scanned_overdue: 0,
        flagged_overdue: 0,
        approval_ids: [],
      })
    }

    const ids = pending.map((p) => p.approval_id)

    const result = await prisma.approvalTransaction.updateMany({
      where: { approval_id: { in: ids } },
      data: { is_overdue: true },
    })

    auditLog({
      action_type: 'CRON_SLA_MONITOR',
      active_user_id: 'cron',
      outcome: 'success',
      flagged_overdue: result.count,
    })

    return NextResponse.json({
      ok: true,
      ran_at: now.toISOString(),
      pending_scanned_overdue: pending.length,
      flagged_overdue: result.count,
      approval_ids: ids,
      sample: pending.slice(0, 20).map((p) => ({
        approval_id: p.approval_id,
        master_trace_id: p.master_trace_id,
        gate_code: p.gate_code,
        sla_due_at: p.sla_due_at.toISOString(),
      })),
    })
  } catch (err) {
    captureException(err, {
      action_type: 'CRON_SLA_MONITOR',
      active_user_id: 'cron',
      outcome: 'failure',
    })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'SLA monitor failed' },
      { status: 500 },
    )
  }
}

/** Allow POST from Azure Logic Apps / generic schedulers */
export async function POST(req: Request) {
  return GET(req)
}
