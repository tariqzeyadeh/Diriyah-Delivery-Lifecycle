// This file configures the initialization of Sentry on the client.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.1,
  environment: process.env.NODE_ENV,
})
