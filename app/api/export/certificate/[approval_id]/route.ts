import { NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'
import { DecisionEnum } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auditLog, captureException } from '@/src/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ approval_id: string }>
}

/**
 * GET /api/export/certificate/[approval_id]
 * BR-008 digital approval receipt (A4 PDF) with immutable version_hash.
 */
export async function GET(_req: Request, { params }: Props) {
  const { approval_id: rawId } = await params
  const approval_id = decodeURIComponent(rawId).trim()

  try {
    const approval = await prisma.approvalTransaction.findUnique({
      where: { approval_id },
      include: {
        master_trace: {
          select: {
            master_trace_id: true,
            entry_route: true,
            created_at: true,
            created_by: true,
          },
        },
      },
    })

    if (!approval) {
      return NextResponse.json({ error: 'ApprovalTransaction not found' }, { status: 404 })
    }

    if (
      approval.decision !== DecisionEnum.APPROVED &&
      approval.decision !== DecisionEnum.RETURNED &&
      approval.decision !== DecisionEnum.APPROVED_COND &&
      approval.decision !== DecisionEnum.REJECTED
    ) {
      return NextResponse.json(
        { error: 'PDF receipt is only available for decided transactions' },
        { status: 400 },
      )
    }

    const decidedAt = approval.decision_at ?? approval.created_at
    const decidedLabel = decidedAt.toLocaleString('en-GB', {
      dateStyle: 'full',
      timeStyle: 'medium',
      timeZone: 'Asia/Riyadh',
    })

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 18

    // Brand bar
    doc.setFillColor(92, 64, 51) // diriyah primary-ish
    doc.rect(0, 0, pageW, 28, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('DIRIYAH COMPANY', margin, 12)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Diriyah Strategic Governance Platform', margin, 20)
    doc.setFontSize(9)
    doc.text('CONFIDENTIAL — Audit Evidence', pageW - margin, 12, { align: 'right' })

    // Title
    doc.setTextColor(28, 22, 19)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.text('CONFIRMED DECISION', pageW / 2, 48, { align: 'center' })

    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(90, 80, 70)
    doc.text('BR-008 Approval Certificate — Immutable Decision Receipt', pageW / 2, 56, {
      align: 'center',
    })

    // Decision badge
    const decisionColor =
      approval.decision === DecisionEnum.APPROVED ||
      approval.decision === DecisionEnum.APPROVED_COND
        ? [45, 122, 74]
        : approval.decision === DecisionEnum.RETURNED
          ? [180, 120, 40]
          : [160, 40, 40]
    doc.setFillColor(decisionColor[0], decisionColor[1], decisionColor[2])
    doc.roundedRect(pageW / 2 - 32, 62, 64, 10, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(String(approval.decision), pageW / 2, 69, { align: 'center' })

    // Body card
    let y = 84
    doc.setDrawColor(200, 190, 180)
    doc.setFillColor(250, 248, 245)
    doc.roundedRect(margin, y, pageW - margin * 2, 110, 3, 3, 'FD')

    doc.setTextColor(28, 22, 19)
    doc.setFontSize(10)
    const line = (label: string, value: string) => {
      y += 10
      doc.setFont('helvetica', 'bold')
      doc.text(label, margin + 6, y)
      doc.setFont('helvetica', 'normal')
      const lines = doc.splitTextToSize(value || '—', pageW - margin * 2 - 70)
      doc.text(lines, margin + 55, y)
      if (lines.length > 1) y += (lines.length - 1) * 5
    }

    y = 84
    line('Approval ID', approval.approval_id)
    line('Gate Code', approval.gate_code)
    line('Entity', `${approval.entity_type} · ${approval.entity_id}`)
    line('Master Trace', approval.master_trace_id || approval.master_trace?.master_trace_id || '—')
    line('Entry Route', approval.master_trace?.entry_route || '—')
    line('Approver', `${approval.approver_user_id} (${approval.approver_role})`)
    line('Authority', approval.authority_basis)
    line('Decision At', `${decidedLabel} (Asia/Riyadh)`)
    line('Entity Version', String(approval.entity_version))

    // Hash block
    y = 210
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(92, 64, 51)
    doc.text('Cryptographic Version Hash (BR-008)', margin, y)
    y += 8
    doc.setFillColor(28, 22, 19)
    doc.roundedRect(margin, y, pageW - margin * 2, 22, 2, 2, 'F')
    doc.setTextColor(232, 210, 160)
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    const hashLines = doc.splitTextToSize(approval.version_hash, pageW - margin * 2 - 8)
    doc.text(hashLines, margin + 4, y + 8)

    y = 248
    doc.setTextColor(90, 80, 70)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(
      'This certificate is generated from the Diriyah ApprovalTransaction ledger. The version_hash is a SHA-256 fingerprint of the approved payload at decision time and proves immutability of the governed record.',
      margin,
      y,
      { maxWidth: pageW - margin * 2 },
    )

    y = 270
    doc.setDrawColor(92, 64, 51)
    doc.line(margin, y, pageW - margin, y)
    y += 8
    doc.setFontSize(8)
    doc.text(
      'Diriyah Company · Do not distribute outside approved audit channels',
      margin,
      y,
    )
    doc.text(`Generated ${new Date().toISOString()}`, pageW - margin, y, { align: 'right' })

    const arrayBuffer = doc.output('arraybuffer')
    const filename = `Diriyah_Approval_Certificate_${approval.approval_id}.pdf`

    auditLog({
      action_type: 'EXPORT_APPROVAL_PDF',
      master_trace_id: approval.master_trace_id,
      active_user_id: 'export',
      entity_id: approval.approval_id,
      outcome: 'success',
      decision: approval.decision,
    })

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    captureException(err, {
      action_type: 'EXPORT_APPROVAL_PDF',
      entity_id: approval_id,
      outcome: 'failure',
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Certificate generation failed' },
      { status: 500 },
    )
  }
}
