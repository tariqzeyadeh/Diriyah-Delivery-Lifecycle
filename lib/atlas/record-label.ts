import { statusTone } from '@/lib/atlas/status-tone'

export type OfficialTagTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

/** Display helpers for official record chrome. Does not change theme tokens. */

export function sentenceCaseLabel(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback
  const cleaned = value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return fallback
  const isUniformCase = cleaned === cleaned.toUpperCase() || cleaned === cleaned.toLowerCase()
  if (!isUniformCase) return cleaned
  const lower = cleaned.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function recordStatusTagTone(status: string | null | undefined): OfficialTagTone {
  switch (statusTone(status)) {
    case 'approved':
      return 'success'
    case 'submitted':
      return 'info'
    case 'returned':
      return 'warning'
    default:
      return 'neutral'
  }
}

export function urgencyTagTone(urgency: string | null | undefined): OfficialTagTone {
  switch ((urgency ?? '').toLowerCase()) {
    case 'critical':
      return 'danger'
    case 'high':
      return 'warning'
    case 'medium':
      return 'info'
    default:
      return 'neutral'
  }
}

export function ragTagTone(rag: string | null | undefined): OfficialTagTone {
  switch ((rag ?? '').toUpperCase()) {
    case 'GREEN':
      return 'success'
    case 'AMBER':
      return 'warning'
    case 'RED':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function stageTagTone(stage: string | null | undefined): OfficialTagTone {
  switch ((stage ?? '').toUpperCase()) {
    case 'ACCEPTANCE':
    case 'COMPLETED':
    case 'DELIVERED':
      return 'success'
    case 'CANCELLED':
      return 'danger'
    case 'AWARD':
    case 'AWARDED':
    case 'EVALUATION':
    case 'COMMITMENT':
      return 'info'
    case 'PLANNED':
    case 'PR_PREP':
      return 'neutral'
    default:
      return 'warning'
  }
}
