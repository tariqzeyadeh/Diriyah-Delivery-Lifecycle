import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'

/**
 * Verify CRON caller via `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron / Azure Logic Apps should send this header.
 */
export function assertCronAuthorized(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }

  const header = req.headers.get('authorization')
  if (!header?.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = header.slice(7).trim()
  const a = Buffer.from(token)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
