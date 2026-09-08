import { SpanStatusCode, trace, type Span } from '@opentelemetry/api'

/** Shared Diriyah tracer — custom spans for Prisma aggregates & budget calc. */
export const atlasTracer = trace.getTracer(
  process.env.OTEL_SERVICE_NAME ?? 'diriyah',
  process.env.npm_package_version ?? '0.1.0',
)

/**
 * Run `fn` inside an active span. Records exceptions and ends the span.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  return atlasTracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value)
      }
    }
    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      span.recordException(err instanceof Error ? err : new Error(String(err)))
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      })
      throw err
    } finally {
      span.end()
    }
  })
}
