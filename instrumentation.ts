import { registerOTel } from '@vercel/otel'
import * as Sentry from '@sentry/nextjs'

/**
 * Next.js instrumentation hook — OpenTelemetry APM + Sentry.
 * Enabled automatically when this file is present (Next.js 15+/16).
 */
export async function register() {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'diriyah',
  })

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
    Sentry.init({
      dsn: dsn || undefined,
      enabled: Boolean(dsn),
      tracesSampleRate: 0.05,
    })
  }
}
