export type DeletableEntity = 'STRATEGY' | 'DEMAND' | 'BUDGET' | 'PROCUREMENT' | 'PROJECT'

export type DeleteBlockCode =
  | 'not_draft'
  | 'locked'
  | 'linked_strategy'
  | 'linked_demand'
  | 'linked_budget'
  | 'linked_procurement'
  | 'linked_project'
  | 'not_planned'
  | 'registered'

const DRAFT_STATUSES = new Set(['DRAFT', ''])

export function isDraftStatus(status: string | null | undefined): boolean {
  return DRAFT_STATUSES.has((status ?? 'DRAFT').trim().toUpperCase())
}

export function firstDeleteBlock(codes: Array<DeleteBlockCode | false | null | undefined>): DeleteBlockCode | null {
  for (const code of codes) {
    if (code) return code
  }
  return null
}
