import { Problems, TdlApiError } from './errors'

interface IdemEntry {
  payloadHash: string
  result: unknown
}

const store = new Map<string, IdemEntry>()

export function hashPayload(payload: unknown): string {
  return simpleHash(JSON.stringify(payload ?? null))
}

export function simpleHash(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `h${(h >>> 0).toString(16)}`
}

export function checkIdempotency(key: string, payload: unknown): { replay?: unknown } {
  const payloadHash = hashPayload(payload)
  const existing = store.get(key)
  if (!existing) return {}
  if (existing.payloadHash !== payloadHash) {
    throw new TdlApiError(Problems.idempotencyConflict())
  }
  return { replay: existing.result }
}

export function rememberIdempotency(key: string, payload: unknown, result: unknown) {
  store.set(key, { payloadHash: hashPayload(payload), result })
}

export function clearIdempotencyStore() {
  store.clear()
}
