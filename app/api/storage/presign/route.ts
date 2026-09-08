import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/src/lib/auth/auth-options'
import { generatePresignedUploadUrl } from '@/src/lib/storage'
import { isSsoAuthMode } from '@/src/lib/auth/session'

export const runtime = 'nodejs'

/**
 * Issues a vault upload URL for ApprovalGate evidence (MVP wiring).
 * POC demo may call this without SSO when AUTH_MODE=demo.
 */
export async function POST(req: Request) {
  if (isSsoAuthMode()) {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = (await req.json().catch(() => null)) as {
    keyPrefix?: string
    fileName?: string
    contentType?: string
    contentLength?: number
  } | null

  if (!body?.keyPrefix || !body.fileName || !body.contentType) {
    return NextResponse.json(
      { error: 'keyPrefix, fileName, and contentType are required' },
      { status: 400 },
    )
  }

  try {
    const result = await generatePresignedUploadUrl({
      keyPrefix: body.keyPrefix,
      fileName: body.fileName,
      contentType: body.contentType,
      contentLength: body.contentLength,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create upload URL'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
