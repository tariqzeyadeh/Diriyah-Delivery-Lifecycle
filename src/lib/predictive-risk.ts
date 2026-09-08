import { createHmac, timingSafeEqual } from 'crypto'
import type { Prisma } from '@prisma/client'
import { DecisionEnum } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type PortfolioRiskAlert = {
  master_trace_id: string
  entity_type: string
  entity_id: string
  risk_score_pct: number
  predicted_delay_days: number
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  drivers: string[]
  label: string
}

function hoursBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 3_600_000)
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n))
}

function severityFromScore(score: number): PortfolioRiskAlert['severity'] {
  if (score >= 80) return 'CRITICAL'
  if (score >= 60) return 'HIGH'
  if (score >= 35) return 'MEDIUM'
  return 'LOW'
}

/**
 * Predictive Portfolio Risk Engine
 *
 * Uses historical ApprovalTransaction cycle times and ProcurementStatusUpdate
 * stage lag to score live Master Traces for bottleneck / overrun probability.
 */
export async function computePortfolioRiskAlerts(
  options: { limit?: number; highRiskOnly?: boolean } = {},
): Promise<PortfolioRiskAlert[]> {
  const limit = options.limit ?? 40
  const highRiskOnly = options.highRiskOnly ?? false

  const [completedApprovals, pendingApprovals, statusUpdates, activeTraces] =
    await Promise.all([
      prisma.approvalTransaction.findMany({
        where: {
          decision: { in: [DecisionEnum.APPROVED, DecisionEnum.RETURNED, DecisionEnum.REJECTED] },
          decision_at: { not: null },
        },
        select: {
          assigned_at: true,
          decision_at: true,
          elapsed_approval_hours: true,
          is_overdue: true,
          gate_code: true,
        },
        take: 500,
        orderBy: { created_at: 'desc' },
      }),
      prisma.approvalTransaction.findMany({
        where: { decision: DecisionEnum.PENDING },
        select: {
          approval_id: true,
          entity_type: true,
          entity_id: true,
          master_trace_id: true,
          assigned_at: true,
          sla_due_at: true,
          is_overdue: true,
          gate_code: true,
          elapsed_approval_hours: true,
        },
        take: 200,
        orderBy: { assigned_at: 'asc' },
      }),
      prisma.procurementStatusUpdate.findMany({
        select: {
          procurement_item_id: true,
          previous_stage: true,
          new_stage: true,
          planned_milestone_date: true,
          actual_milestone_date: true,
        },
        take: 500,
        orderBy: { update_id: 'desc' },
      }),
      prisma.masterTrace.findMany({
        where: { is_active: true },
        select: { master_trace_id: true },
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ])

  // Baseline: median historical approval cycle (hours)
  const histHours = completedApprovals
    .map((a) => {
      if (a.elapsed_approval_hours != null) return Number(a.elapsed_approval_hours)
      if (!a.decision_at) return null
      return hoursBetween(a.assigned_at, a.decision_at)
    })
    .filter((h): h is number => h != null && Number.isFinite(h))
    .sort((a, b) => a - b)

  const medianApprovalHours =
    histHours.length === 0
      ? 48
      : histHours[Math.floor(histHours.length / 2)] ?? 48

  const overdueRate =
    completedApprovals.length === 0
      ? 0.15
      : completedApprovals.filter((a) => a.is_overdue).length / completedApprovals.length

  // Procurement lag: days between planned and actual milestones
  const lagDays = statusUpdates
    .map((u) => {
      if (u.planned_milestone_date && u.actual_milestone_date) {
        return Math.round(
          (u.actual_milestone_date.getTime() - u.planned_milestone_date.getTime()) /
            86_400_000,
        )
      }
      return null
    })
    .filter((d): d is number => d != null && Number.isFinite(d))

  const avgProcLagDays =
    lagDays.length === 0
      ? 5
      : lagDays.reduce((s, d) => s + d, 0) / lagDays.length

  const now = Date.now()
  const byTrace = new Map<string, PortfolioRiskAlert>()

  for (const p of pendingApprovals) {
    const traceId = p.master_trace_id
    if (!traceId) continue

    const openHours = hoursBetween(p.assigned_at, new Date())
    const slaRemainingHours = (p.sla_due_at.getTime() - now) / 3_600_000
    const ratio = openHours / Math.max(medianApprovalHours, 1)

    let score = clamp(ratio * 45 + overdueRate * 40)
    const drivers: string[] = []

    if (p.is_overdue || slaRemainingHours < 0) {
      score = clamp(score + 30)
      drivers.push(`Gate ${p.gate_code} SLA breached`)
    } else if (slaRemainingHours < 24) {
      score = clamp(score + 18)
      drivers.push(`Gate ${p.gate_code} due within 24h`)
    }

    if (ratio > 1.2) {
      drivers.push(
        `Open ${openHours.toFixed(0)}h vs median ${medianApprovalHours.toFixed(0)}h approval cycle`,
      )
    }

    const predictedDelayDays = Math.max(
      0,
      Math.round((openHours - medianApprovalHours) / 24 + Math.max(0, avgProcLagDays) * 0.25),
    )

    if (predictedDelayDays >= 3) {
      score = clamp(score + 12)
      drivers.push(`Predicted delay ≈ ${predictedDelayDays} days`)
    }

    if (drivers.length === 0) {
      drivers.push('Within historical approval envelope')
    }

    const alert: PortfolioRiskAlert = {
      master_trace_id: traceId,
      entity_type: p.entity_type,
      entity_id: p.entity_id,
      risk_score_pct: Math.round(score * 10) / 10,
      predicted_delay_days: predictedDelayDays,
      severity: severityFromScore(score),
      drivers,
      label: `${p.entity_type} ${p.entity_id}`,
    }

    const existing = byTrace.get(traceId)
    if (!existing || existing.risk_score_pct < alert.risk_score_pct) {
      byTrace.set(traceId, alert)
    }
  }

  // Ensure active traces without pending approvals still appear when proc lag is elevated
  for (const t of activeTraces) {
    if (byTrace.has(t.master_trace_id)) continue
    if (avgProcLagDays < 7) continue

    const score = clamp(30 + avgProcLagDays * 2)
    byTrace.set(t.master_trace_id, {
      master_trace_id: t.master_trace_id,
      entity_type: 'MASTER_TRACE',
      entity_id: t.master_trace_id,
      risk_score_pct: Math.round(score * 10) / 10,
      predicted_delay_days: Math.round(avgProcLagDays),
      severity: severityFromScore(score),
      drivers: [`Portfolio procurement lag avg ${avgProcLagDays.toFixed(1)} days`],
      label: t.master_trace_id,
    })
  }

  let alerts = [...byTrace.values()].sort((a, b) => b.risk_score_pct - a.risk_score_pct)

  if (highRiskOnly) {
    alerts = alerts.filter((a) => a.severity === 'HIGH' || a.severity === 'CRITICAL')
  }

  return alerts.slice(0, limit)
}

export function riskForTrace(
  alerts: PortfolioRiskAlert[],
  masterTraceId: string,
): PortfolioRiskAlert | undefined {
  return alerts.find((a) => a.master_trace_id === masterTraceId)
}

/** Constant-time HMAC compare for Event Grid / SAP webhook signatures. */
export function verifyErpWebhookHmac(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false

  // Support Azure Event Grid style "sha256=<hex>" and raw hex/base64
  const provided = signatureHeader.replace(/^sha256=/i, '').trim()
  const digestHex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const digestB64 = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')

  try {
    const a = Buffer.from(provided)
    const bHex = Buffer.from(digestHex)
    const bB64 = Buffer.from(digestB64)
    if (a.length === bHex.length && timingSafeEqual(a, bHex)) return true
    if (a.length === bB64.length && timingSafeEqual(a, bB64)) return true
  } catch {
    return false
  }
  return false
}

export type ErpSpendEvent = {
  eventType?: string
  type?: string
  data?: {
    procurementItemId?: string
    purchaseOrderId?: string
    invoiceId?: string
    actualCommitmentSar?: number
    acceptedValueSar?: number
    currency?: string
  }
}

export function parseCloudEvents(body: unknown): ErpSpendEvent[] {
  if (Array.isArray(body)) return body as ErpSpendEvent[]
  if (body && typeof body === 'object') return [body as ErpSpendEvent]
  return []
}

export async function applyErpSpendUpdate(event: ErpSpendEvent): Promise<{
  updated: boolean
  procurement_item_id?: string
}> {
  const data = event.data ?? {}
  const itemId = data.procurementItemId?.trim()
  if (!itemId) return { updated: false }

  const patch: Prisma.ProcurementItemUpdateInput = {
    last_sync_at: new Date(),
    source_system: 'SAP_EVENT_GRID',
  }

  if (typeof data.actualCommitmentSar === 'number') {
    patch.actual_commitment_sar = data.actualCommitmentSar
  }
  if (typeof data.acceptedValueSar === 'number') {
    patch.accepted_value_sar = data.acceptedValueSar
  }
  if (data.purchaseOrderId) {
    // PO stored on related project when present; keep external key on item
    patch.external_system_key = data.purchaseOrderId
  }

  await prisma.procurementItem.update({
    where: { procurement_item_id: itemId },
    data: patch,
  })

  return { updated: true, procurement_item_id: itemId }
}
