/**
 * Idempotency store for ERP / middleware callbacks (SAP PI/PO, MuleSoft).
 * Scaffold: in-process Map. Replace with Redis / Prisma IntegrationIdempotency in MVP.
 */

export type IdempotencyRecord = {
  key: string
  createdAt: number
  responseStatus: number
  responseBody: unknown
}

const STORE = new Map<string, IdempotencyRecord>()
const TTL_MS = 24 * 60 * 60 * 1000

function sweep(): void {
  const now = Date.now()
  for (const [key, record] of STORE.entries()) {
    if (now - record.createdAt > TTL_MS) STORE.delete(key)
  }
}

export function getIdempotentResponse(key: string): IdempotencyRecord | null {
  sweep()
  return STORE.get(key) ?? null
}

export function saveIdempotentResponse(
  key: string,
  responseStatus: number,
  responseBody: unknown,
): void {
  sweep()
  STORE.set(key, {
    key,
    createdAt: Date.now(),
    responseStatus,
    responseBody,
  })
}
