/**
 * Mock API layer — all mutations should flow through these helpers
 * so Idempotency-Key, ETag, and problem+json stay consistent.
 */
import { useTdlStore } from './store'
import type { CabSlotId, FormKey, ReturnPacket } from './types'
import { newCorrelationId } from './errors'

export type ApiResult<T> =
  | { ok: true; data: T; correlation_id: string }
  | { ok: false; problem: NonNullable<ReturnType<typeof useTdlStore.getState>['lastProblem']> }

function wrap(fn: () => void): ApiResult<{ success: true }> {
  const correlation_id = newCorrelationId()
  useTdlStore.getState().clearProblem()
  fn()
  const problem = useTdlStore.getState().lastProblem
  if (problem) return { ok: false, problem }
  return { ok: true, data: { success: true }, correlation_id }
}

export const tdlApi = {
  submitForm(key: FormKey, expectedVersion: number, idempotencyKey: string) {
    return wrap(() => useTdlStore.getState().submitForm(key, expectedVersion, idempotencyKey))
  },
  approveForm(key: FormKey, expectedVersion: number, idempotencyKey: string, groupId?: string) {
    return wrap(() => useTdlStore.getState().approveForm(key, expectedVersion, idempotencyKey, groupId))
  },
  returnForm(
    key: FormKey,
    expectedVersion: number,
    idempotencyKey: string,
    packet: ReturnPacket,
  ) {
    return wrap(() => useTdlStore.getState().returnForm(key, expectedVersion, idempotencyKey, packet))
  },
  castCabVote(
    slotId: CabSlotId,
    decision: 'Approved' | 'Returned',
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    return wrap(() =>
      useTdlStore.getState().castCabVote(slotId, decision, expectedVersion, idempotencyKey),
    )
  },
  startDeployment(expectedVersion: number, idempotencyKey: string) {
    return wrap(() => useTdlStore.getState().startDeployment(expectedVersion, idempotencyKey))
  },
}
