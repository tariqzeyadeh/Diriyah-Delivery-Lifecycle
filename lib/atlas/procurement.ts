/** Official 11-stage procurement execution board (Prisma ProcurementStage). */
export const PROCUREMENT_BOARD_COLUMNS = [
  'PLANNED',
  'PR_PREP',
  'PR_APPROVAL',
  'RFX',
  'EVALUATION',
  'AWARD',
  'COMMITMENT',
  'DELIVERY',
  'ACCEPTANCE',
  'COMPLETED',
  'CANCELLED',
] as const

export type ProcurementBoardColumn = (typeof PROCUREMENT_BOARD_COLUMNS)[number]

/** Stages that unlock G-PMO1 / project registration (includes legacy DELIVERED). */
export const PMO_READY_STAGES = ['ACCEPTANCE', 'COMPLETED', 'DELIVERED'] as const

const FORWARD_ORDER = PROCUREMENT_BOARD_COLUMNS.filter((c) => c !== 'CANCELLED')

export function normalizeProcurementStage(
  stage: string | null | undefined,
): ProcurementBoardColumn {
  const s = (stage || 'PLANNED').toUpperCase()
  if (s === 'IN_SOURCING') return 'RFX'
  if (s === 'AWARDED') return 'AWARD'
  if (s === 'DELIVERED') return 'COMPLETED'
  if ((PROCUREMENT_BOARD_COLUMNS as readonly string[]).includes(s)) {
    return s as ProcurementBoardColumn
  }
  return 'PLANNED'
}

export function isPmoReadyStage(stage: string | null | undefined): boolean {
  const raw = (stage || '').toUpperCase()
  if ((PMO_READY_STAGES as readonly string[]).includes(raw)) return true
  return normalizeProcurementStage(stage) === 'COMPLETED'
}

/** BR-032: one step forward/back, or Cancel (except from Completed). */
export function isValidProcurementTransition(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  const a = normalizeProcurementStage(from)
  const b = normalizeProcurementStage(to)
  if (a === b) return true
  if (b === 'CANCELLED') return a !== 'COMPLETED' && a !== 'CANCELLED'
  if (a === 'CANCELLED') return false
  const i = FORWARD_ORDER.indexOf(a)
  const j = FORWARD_ORDER.indexOf(b)
  if (i < 0 || j < 0) return false
  return Math.abs(j - i) === 1
}

export const PROCUREMENT_STAGE_PROGRESS: Record<ProcurementBoardColumn, number> = {
  PLANNED: 5,
  PR_PREP: 15,
  PR_APPROVAL: 25,
  RFX: 35,
  EVALUATION: 50,
  AWARD: 60,
  COMMITMENT: 70,
  DELIVERY: 80,
  ACCEPTANCE: 90,
  COMPLETED: 100,
  CANCELLED: 0,
}
