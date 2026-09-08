import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { auditLog, captureException } from '@/src/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

function cell(v: unknown): string | number {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 'Y' : 'N'
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    try {
      return Number((v as { toNumber: () => number }).toNumber())
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/**
 * GET /api/export/traceability
 * Optional: ?masterTraceId=TECH-2027-0001
 *
 * Flattens Master Trace spines → Strategy / Demand / Budget / Project rows for PMO Excel.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const masterTraceId = searchParams.get('masterTraceId')?.trim() || undefined

  try {
    const traces = await prisma.masterTrace.findMany({
      where: {
        is_active: true,
        ...(masterTraceId ? { master_trace_id: masterTraceId } : {}),
      },
      orderBy: { created_at: 'desc' },
      include: {
        strategies: {
          orderBy: { created_at: 'asc' },
          select: {
            strategy_id: true,
            strategy_title: true,
            record_status: true,
            funding_envelope: true,
            rag_status: true,
          },
        },
        demands: {
          orderBy: { created_at: 'asc' },
          select: {
            demand_id: true,
            demand_title: true,
            record_status: true,
            strategy_id: true,
            entry_route: true,
            rag_status: true,
          },
        },
        budget_submissions: {
          orderBy: { created_at: 'asc' },
          select: {
            budget_submission_id: true,
            record_status: true,
            strategy_id: true,
            total_requested_sar: true,
            total_approved_sar: true,
            capex_total_sar: true,
            opex_total_sar: true,
            is_locked: true,
          },
        },
        projects: {
          orderBy: { created_at: 'asc' },
          select: {
            project_id: true,
            project_name: true,
            record_status: true,
            demand_id: true,
            procurement_item_id: true,
            planned_start_date: true,
            planned_end_date: true,
          },
        },
      },
    })

    const header = [
      'Master Trace ID',
      'Entry Route',
      'Spine Created At',
      'Entity Type',
      'Entity ID',
      'Entity Title / Name',
      'Record Status',
      'Linked Strategy ID',
      'Linked Demand ID',
      'RAG',
      'Funding / Amount (SAR)',
      'CAPEX (SAR)',
      'OPEX (SAR)',
      'Locked',
      'Extra',
    ]

    const rows: (string | number)[][] = [header]

    for (const t of traces) {
      rows.push([
        t.master_trace_id,
        t.entry_route,
        t.created_at.toISOString(),
        'MASTER_TRACE',
        t.master_trace_id,
        '—',
        t.is_active ? 'ACTIVE' : 'INACTIVE',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        `created_by=${t.created_by}`,
      ])

      for (const s of t.strategies) {
        rows.push([
          t.master_trace_id,
          t.entry_route,
          t.created_at.toISOString(),
          'STRATEGY',
          s.strategy_id,
          s.strategy_title,
          cell(s.record_status),
          s.strategy_id,
          '',
          cell(s.rag_status),
          cell(s.funding_envelope),
          '',
          '',
          '',
          '',
        ])
      }

      for (const d of t.demands) {
        rows.push([
          t.master_trace_id,
          d.entry_route,
          t.created_at.toISOString(),
          'DEMAND',
          d.demand_id,
          d.demand_title,
          cell(d.record_status),
          cell(d.strategy_id),
          d.demand_id,
          cell(d.rag_status),
          '',
          '',
          '',
          '',
          '',
        ])
      }

      for (const b of t.budget_submissions) {
        rows.push([
          t.master_trace_id,
          t.entry_route,
          t.created_at.toISOString(),
          'BUDGET_SUBMISSION',
          b.budget_submission_id,
          b.budget_submission_id,
          cell(b.record_status),
          cell(b.strategy_id),
          '',
          '',
          cell(b.total_approved_sar ?? b.total_requested_sar),
          cell(b.capex_total_sar),
          cell(b.opex_total_sar),
          b.is_locked ? 'Y' : 'N',
          `requested=${cell(b.total_requested_sar)}`,
        ])
      }

      for (const p of t.projects) {
        rows.push([
          t.master_trace_id,
          t.entry_route,
          t.created_at.toISOString(),
          'PROJECT',
          p.project_id,
          p.project_name,
          cell(p.record_status),
          '',
          cell(p.demand_id),
          '',
          '',
          '',
          '',
          '',
          `procurement=${cell(p.procurement_item_id)}; start=${cell(p.planned_start_date)}; end=${cell(p.planned_end_date)}`,
        ])
      }
    }

    const sheet = XLSX.utils.aoa_to_sheet(rows)
    sheet['!cols'] = header.map((_, i) => ({
      wch: i === 5 || i === 14 ? 36 : i === 0 || i === 4 ? 18 : 14,
    }))

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Traceability Matrix')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const filename = `Diriyah_Traceability_Export_${stamp()}.xlsx`

    auditLog({
      action_type: 'EXPORT_TRACEABILITY_XLSX',
      master_trace_id: masterTraceId ?? null,
      active_user_id: 'export',
      outcome: 'success',
      rows: rows.length - 1,
      spines: traces.length,
    })

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    captureException(err, {
      action_type: 'EXPORT_TRACEABILITY_XLSX',
      master_trace_id: masterTraceId,
      outcome: 'failure',
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 },
    )
  }
}
