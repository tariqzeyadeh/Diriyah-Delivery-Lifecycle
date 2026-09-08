import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/src/i18n/routing'

/**
 * Diriyah request proxy — next-intl locale routing + rate limiting / SSO gate.
 *
 * Next.js 16 renamed middleware.ts → proxy.ts and requires this file at the
 * same level as `app/` (project root). AUTH_MODE=demo skips JWT checks.
 */

const WINDOW_MS = 60_000
const MAX_REQUESTS = 50

type Bucket = { count: number; resetAt: number }

/** Process-local IP buckets (POC). Swap for @upstash/ratelimit + Redis in production. */
const buckets = new Map<string, Bucket>()

const intlMiddleware = createIntlMiddleware(routing)

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return req.headers.get('x-real-ip') || 'unknown'
}

function rateLimit(ip: string): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  let bucket = buckets.get(ip)

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS }
    buckets.set(ip, bucket)
  }

  if (buckets.size > 5_000) {
    for (const [key, value] of buckets) {
      if (now >= value.resetAt) buckets.delete(key)
    }
  }

  bucket.count += 1
  const remaining = Math.max(0, MAX_REQUESTS - bucket.count)
  return { ok: bucket.count <= MAX_REQUESTS, remaining, resetAt: bucket.resetAt }
}

function isPublicApi(pathname: string): boolean {
  if (pathname.startsWith('/api/auth')) return true
  if (pathname.startsWith('/api/integration')) return true
  if (pathname.startsWith('/api/cron')) return true
  if (pathname.startsWith('/api/events')) return true
  if (pathname === '/api/health' || pathname.startsWith('/api/health/')) return true
  return false
}

function isLoadTestRequest(req: NextRequest): boolean {
  const token = process.env.LOAD_TEST_TOKEN
  if (!token) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${token}`
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

function isAdminPath(pathname: string): boolean {
  return pathname.includes('/admin') || pathname.includes('/administration')
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/api/health' || pathname.startsWith('/api/health/')) {
    return NextResponse.next()
  }

  if (isApiPath(pathname)) {
    if (isLoadTestRequest(req)) {
      return NextResponse.next()
    }

    const ip = clientIp(req)
    const limit = rateLimit(`${ip}:api`)

    if (!limit.ok) {
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Max ${MAX_REQUESTS} requests per minute.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Limit': String(MAX_REQUESTS),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(limit.resetAt),
          },
        },
      )
    }

    const authMode = (process.env.AUTH_MODE ?? 'demo').toLowerCase()
    const requiresSession = authMode === 'sso' && !isPublicApi(pathname)

    if (requiresSession) {
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      })

      if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const res = NextResponse.next()
    res.headers.set('X-RateLimit-Limit', String(MAX_REQUESTS))
    res.headers.set('X-RateLimit-Remaining', String(limit.remaining))
    res.headers.set('X-RateLimit-Reset', String(limit.resetAt))
    return res
  }

  if (isAdminPath(pathname)) {
    const ip = clientIp(req)
    const limit = rateLimit(`${ip}:admin`)

    if (!limit.ok) {
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Max ${MAX_REQUESTS} requests per minute.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Limit': String(MAX_REQUESTS),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(limit.resetAt),
          },
        },
      )
    }

    const authMode = (process.env.AUTH_MODE ?? 'demo').toLowerCase()
    if (authMode === 'sso') {
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      })
      if (!token) {
        const signIn = new URL('/api/auth/signin', req.url)
        signIn.searchParams.set('callbackUrl', req.url)
        return NextResponse.redirect(signIn)
      }
    }
  }

  return intlMiddleware(req)
}

export default proxy

export const config = {
  matcher: [
    '/',
    '/((?!api|_next|_vercel|~offline|sw\\.js|workbox|manifest\\.json|.*\\..*).*)',
    '/api/:path*',
  ],
}
