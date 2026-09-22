export type StatusTone = 'draft' | 'submitted' | 'approved' | 'returned' | 'unknown'

export function statusTone(status: string | null | undefined): StatusTone {
  switch ((status ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'WORKING':
      return 'draft'
    case 'SUBMITTED':
    case 'PENDING':
    case 'UNDER_REVIEW':
    case 'UNDER_VALIDATION':
    case 'AWAITING_OWNER':
      return 'submitted'
    case 'APPROVED':
    case 'VALIDATED':
    case 'VALIDATED_COND':
      return 'approved'
    case 'RETURNED':
      return 'returned'
    case 'NOT_FUNDABLE':
    case 'ARCHIVED':
    case 'SUPERSEDED':
      return 'unknown'
    default:
      return 'unknown'
  }
}
