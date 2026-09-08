import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getIdempotentResponse, saveIdempotentResponse } from '@/src/lib/integration/idempotency'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * SAP / MuleSoft budget sync endpoint (read model for ERP middleware).
 *
 * Auth: `Authorization: Bearer <SAP_INTEGRATION_TOKEN>` OR `X-API-Key: <SAP_INTEGRATION_API_KEY>`
 * Idempotency: `Idempotency-Key: <uuid>` — retries return the original payload (no double-count).
 *
 * GET  /api/integration/sap?budgetSubmissionId=...
 * GET  /api/integration/sap?masterTraceId=...
 */
function unauthorized(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 })
}

function assertIntegrationAuth(req: Request): NextResponse | null {
  const apiKey = process.env.SAP_INTEGRATION_API_KEY
  const bearerToken = process.env.SAP_INTEGRATION_TOKEN

  const headerKey = req.headers.get('x-api-key')
  const auth = req.headers.get('authorization')
  const bearer = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null

  const keyOk = Boolean(apiKey && headerKey && headerKey === apiKey)
  const bearerOk = Boolean(bearerToken && bearer && bearer === bearerToken)

  if (!apiKey && !bearerToken) {
    // Fail closed in production; allow scaffold calls only when explicitly enabled
    if (process.env.SAP_INTEGRATION_ALLOW_INSECURE === 'true') return null
    return unauthorized('SAP integration credentials are not configured')
  }

  if (keyOk || bearerOk) return null
  return unauthorized('Invalid API key or bearer token')
}

function decimalToNumber(
  value: { toNumber?: () => number } | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  if (typeof value.toNumber === 'function') return value.toNumber()
  return Number(value)
}

export async function GET(req: Request) {
  const authError = assertIntegrationAuth(req)
  if (authError) return authError

  const idempotencyKey = req.headers.get('idempotency-key')?.trim()
  if (idempotencyKey) {
    const cached = getIdempotentResponse(idempotencyKey)
    if (cached) {
      return NextResponse.json(cached.responseBody, {
        status: cached.responseStatus,
        headers: {
          'X-Idempotency-Replayed': 'true',
          'Idempotency-Key': idempotencyKey,
        },
      })
    }
  }

  const { searchParams } = new URL(req.url)
  const budgetSubmissionId = searchParams.get('budgetSubmissionId')
  const masterTraceId = searchParams.get('masterTraceId')

  if (!budgetSubmissionId && !masterTraceId) {
    return NextResponse.json(
      {
        error: 'Provide budgetSubmissionId or masterTraceId query parameter',
      },
      { status: 400 },
    )
  }

  const consolidations = await prisma.budgetConsolidation.findMany({
    where: budgetSubmissionId
      ? { budget_submission_id: budgetSubmissionId }
      : {
          budget_submission: {
            master_trace_id: masterTraceId!,
          },
        },
    include: {
      budget_submission: {
        select: {
          budget_submission_id: true,
          master_trace_id: true,
          record_status: true,
          approval_status: true,
          fiscal_year: true,
          total_requested_sar: true,
          total_approved_sar: true,
          funding_ceiling_sar: true,
        },
      },
    },
  })

  const submissionIds = consolidations.map((c) => c.budget_submission_id)
  const lines = await prisma.budgetLine.findMany({
    where: {
      budget_submission_id: { in: submissionIds },
      is_active: true,
    },
    orderBy: { created_at: 'asc' },
  })

  const payload = {
    source_system: 'DIRIYAH',
    interface: 'BudgetSync',
    generated_at: new Date().toISOString(),
    filters: { budgetSubmissionId, masterTraceId },
    consolidations: consolidations.map((c) => ({
      consolidation_id: c.consolidation_id,
      budget_submission_id: c.budget_submission_id,
      included_business_units: c.included_business_units,
      included_demand_count: c.included_demand_count,
      excluded_demand_count: c.excluded_demand_count,
      funding_ceiling_sar: decimalToNumber(c.funding_ceiling_sar),
      funding_gap_sar: decimalToNumber(c.funding_gap_sar),
      strategic_adhoc_mix: c.strategic_adhoc_mix,
      capex_opex_mix: c.capex_opex_mix,
      demand_line_reconciliation: c.demand_line_reconciliation,
      budget_submission: {
        ...c.budget_submission,
        total_requested_sar: decimalToNumber(c.budget_submission.total_requested_sar),
        total_approved_sar: decimalToNumber(c.budget_submission.total_approved_sar),
        funding_ceiling_sar: decimalToNumber(c.budget_submission.funding_ceiling_sar),
      },
    })),
    budget_lines: lines.map((line) => ({
      budget_line_id: line.budget_line_id,
      budget_submission_id: line.budget_submission_id,
      master_trace_id: line.master_trace_id,
      demand_id: line.demand_id,
      line_description: line.line_description,
      cost_classification: line.cost_classification,
      company_code: line.company_code,
      cost_center_code: line.cost_center_code,
      gl_account_code: line.gl_account_code,
      wbs_internal_order: line.wbs_internal_order,
      quantity: decimalToNumber(line.quantity),
      unit_cost: decimalToNumber(line.unit_cost),
      requested_total_sar: decimalToNumber(line.requested_total_sar),
      approved_amount_sar: decimalToNumber(line.approved_amount_sar),
      committed_amount_sar: decimalToNumber(line.committed_amount_sar),
      actual_amount_sar: decimalToNumber(line.actual_amount_sar),
      fiscal_year: line.fiscal_year ?? line.line_fiscal_year,
      record_status: line.record_status,
      external_system_key: line.external_system_key,
      last_sync_at: line.last_sync_at,
    })),
    counts: {
      consolidations: consolidations.length,
      budget_lines: lines.length,
    },
  }

  const status = 200
  if (idempotencyKey) {
    saveIdempotentResponse(idempotencyKey, status, payload)
  }

  return NextResponse.json(payload, {
    status,
    headers: idempotencyKey
      ? {
          'X-Idempotency-Replayed': 'false',
          'Idempotency-Key': idempotencyKey,
        }
      : undefined,
  })
}

/** Optional POST hook for future SAP acknowledgement / status callbacks */
export async function POST(req: Request) {
  const authError = assertIntegrationAuth(req)
  if (authError) return authError

  const idempotencyKey = req.headers.get('idempotency-key')?.trim()
  if (idempotencyKey) {
    const cached = getIdempotentResponse(idempotencyKey)
    if (cached) {
      return NextResponse.json(cached.responseBody, {
        status: cached.responseStatus,
        headers: { 'X-Idempotency-Replayed': 'true' },
      })
    }
  }

  // Scaffold only — wire to update BudgetLine.external_system_key / last_sync_at in MVP
  const body = (await req.json().catch(() => null)) as {
    budget_line_id?: string
    sap_document_number?: string
    status?: string
  } | null

  const responseBody = {
    accepted: true,
    message: 'SAP acknowledgement received (scaffold). Persist external_system_key in MVP phase.',
    received: body,
    received_at: new Date().toISOString(),
  }

  if (idempotencyKey) {
    saveIdempotentResponse(idempotencyKey, 202, responseBody)
  }

  return NextResponse.json(responseBody, { status: 202 })
}
