import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Azure Container Apps / Kubernetes readiness + liveness probe.
 * Lightweight DB ping — does not touch business tables.
 */
export async function GET() {
  const started = Date.now()

  try {
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json(
      {
        status: 'healthy',
        database: 'connected',
        latencyMs: Date.now() - started,
        service: process.env.OTEL_SERVICE_NAME ?? 'diriyah',
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database unreachable'

    return NextResponse.json(
      {
        status: 'unhealthy',
        database: 'disconnected',
        error: message,
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  }
}
