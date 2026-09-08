import { NextResponse } from 'next/server'
import { getExecutiveOnePager } from '@/lib/atlas/dashboard-data'
import { withSpan } from '@/src/lib/otel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Load-test / integration surface for the Executive One-Pager aggregates.
 * Spans the portfolio health calculation for APM visibility.
 */
export async function GET() {
  try {
    const data = await withSpan('calculate-portfolio-health', async (span) => {
      span.setAttribute('atlas.surface', 'executive-one-pager')
      return getExecutiveOnePager()
    })

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      funnel: data.funnel,
      scorecard: data.scorecard,
      matrixRowCount: data.matrix.length,
      matrix: data.matrix,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load one-pager'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
