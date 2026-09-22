import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

function downloadName(fileName: string): string {
  return fileName.replace(/[\r\n"]/g, '_').slice(0, 180) || 'attachment'
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const attachmentId = decodeURIComponent(id ?? '').trim()
  if (!attachmentId) {
    return NextResponse.json({ error: 'attachment id is required.' }, { status: 400 })
  }

  const row = await prisma.attachment.findUnique({
    where: { attachment_id: attachmentId },
    select: {
      file_name: true,
      mime_type: true,
      uploaded_by_at: true,
    },
  })
  if (!row) {
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
  }

  const store = row.uploaded_by_at as { content_b64?: string; mime_type?: string } | null
  if (!store?.content_b64) {
    return NextResponse.json(
      { error: 'No downloadable file is stored for this attachment.' },
      { status: 404 },
    )
  }

  const bytes = Buffer.from(store.content_b64, 'base64')
  const mime = store.mime_type || row.mime_type || 'application/octet-stream'
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${downloadName(row.file_name)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
