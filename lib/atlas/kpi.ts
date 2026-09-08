/** Client-safe KPI / BSC constants. No server imports. */

export const BSC_PERSPECTIVES = [
  'FINANCIAL',
  'CUSTOMER',
  'INTERNAL_PROCESS',
  'LEARNING_GROWTH',
] as const

export type BscPerspective = (typeof BSC_PERSPECTIVES)[number]
