/**
 * Client-safe helpers for commercial validation (PI-06).
 * Keep sync — no Prisma, no server imports.
 */

export type ValidationDecision =
  | 'VALIDATED'
  | 'VALIDATED_COND'
  | 'CONDITIONAL'
  | 'RETURNED'
  | 'DEFERRED'
  | 'NOT_FUNDABLE'

export const VALIDATION_DECISION_LABELS: Record<ValidationDecision, string> = {
  VALIDATED: 'Validated',
  VALIDATED_COND: 'Validated with Conditions',
  CONDITIONAL: 'Conditional',
  RETURNED: 'Returned for Revision',
  DEFERRED: 'Deferred (Out of Cycle)',
  NOT_FUNDABLE: 'Not Fundable',
}

export function isValidatedDecision(d: string | null | undefined): boolean {
  return d === 'VALIDATED' || d === 'VALIDATED_COND'
}

export type DuplicateStatus = 'CLEAR' | 'POTENTIAL_DUPLICATE' | 'DUPLICATE' | 'OVERLAP_ACCEPTED'

export type DuplicateCheckResult = {
  status: DuplicateStatus
  potential_matches: { demand_id: string; demand_title: string; record_status: string | null }[]
  disposition?: string | null
  related_record_ids?: string[]
}
