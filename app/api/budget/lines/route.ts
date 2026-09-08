import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withSpan } from '@/src/lib/otel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function n(v: { toString(): string } | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  return typeof v === 'number' ? v : Number(v)
}

/**
 * Budget lines + consolidation roll-up for load tests and APM.
 * Query: ?id=BUD-2027-0001 (defaults to seeded demo submission).
 */
export async function GET(req: NextRequest) {
  const budgetSubmissionId =
    req.nextUrl.searchParams.get('id')?.trim() || 'BUD-2027-0001'

  try {
    const payload = await withSpan(
      'calculate-budget-consolidation',
      async (span) => {
        span.setAttribute('atlas.budget_submission_id', budgetSubmissionId)

        const submission = await prisma.budgetSubmission.findUnique({
          where: { budget_submission_id: budgetSubmissionId },
          include: {
            budget_lines: true,
            consolidation: true,
            strategy: { select: { strategy_id: true, strategy_title: true } },
          },
        })

        if (!submission) {
          span.setAttribute('atlas.found', false)
          return null
        }

        span.setAttribute('atlas.found', true)
        span.setAttribute('atlas.line_count', submission.budget_lines.length)

        const lineRollup = submission.budget_lines.reduce(
          (acc, line) => {
            acc.requested += n(line.requested_total_sar)
            acc.recommended += n(line.recommended_amount_sar)
            acc.approved += n(line.approved_amount_sar)
            acc.gross += n(line.gross_amount)
            return acc
          },
          { requested: 0, recommended: 0, approved: 0, gross: 0 },
        )

        const aggregates = await prisma.budgetSubmission.aggregate({
          where: {
            master_trace_id: submission.master_trace_id,
            is_active: true,
          },
          _sum: {
            total_requested_sar: true,
            total_approved_sar: true,
            capex_total_sar: true,
            opex_total_sar: true,
            funding_gap_sar: true,
          },
          _count: true,
        })

        return {
          budget_submission_id: submission.budget_submission_id,
          master_trace_id: submission.master_trace_id,
          record_status: submission.record_status,
          strategy: submission.strategy,
          consolidation: submission.consolidation,
          lineCount: submission.budget_lines.length,
          lineRollup,
          portfolioAggregates: {
            submissionCount: aggregates._count,
            totalRequestedSar: n(aggregates._sum.total_requested_sar),
            totalApprovedSar: n(aggregates._sum.total_approved_sar),
            capexTotalSar: n(aggregates._sum.capex_total_sar),
            opexTotalSar: n(aggregates._sum.opex_total_sar),
            fundingGapSar: n(aggregates._sum.funding_gap_sar),
          },
          lines: submission.budget_lines.map((line) => ({
            budget_line_id: line.budget_line_id,
            line_description: line.line_description,
            cost_classification: line.cost_classification,
            requested_total_sar: n(line.requested_total_sar),
            recommended_amount_sar: n(line.recommended_amount_sar),
            approved_amount_sar: n(line.approved_amount_sar),
            gross_amount: n(line.gross_amount),
          })),
        }
      },
      { 'atlas.surface': 'budget-lines' },
    )

    if (!payload) {
      return NextResponse.json(
        { ok: false, error: `Budget submission not found: ${budgetSubmissionId}` },
        { status: 404 },
      )
    }

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      ...payload,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Budget lines query failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
