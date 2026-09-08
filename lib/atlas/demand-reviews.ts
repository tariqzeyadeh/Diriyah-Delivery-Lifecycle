/** Conditional demand reviews (BR-015 / AT-006). */

export const DEMAND_REVIEW_TYPES = ['architecture', 'security', 'data'] as const
export type DemandReviewType = (typeof DEMAND_REVIEW_TYPES)[number]

export const REVIEW_GATE: Record<DemandReviewType, 'G-ARCH1' | 'G-SEC1' | 'G-DATA1'> = {
  architecture: 'G-ARCH1',
  security: 'G-SEC1',
  data: 'G-DATA1',
}

export const REVIEW_GATES = ['G-ARCH1', 'G-SEC1', 'G-DATA1'] as const
export type DemandReviewGate = (typeof REVIEW_GATES)[number]

/** POC reviewer roles mapped onto demo personas. */
export const REVIEW_ATLAS_ROLE: Record<DemandReviewType, string> = {
  architecture: 'Strategy & Governance',
  security: 'CTO Office',
  data: 'Strategy & Governance',
}

export const REVIEW_APPROVER_ROLE: Record<DemandReviewType, string> = {
  architecture: 'Architecture Reviewer',
  security: 'Information Security Reviewer',
  data: 'Data Governance Reviewer',
}

export const REVIEW_LABEL: Record<DemandReviewType, string> = {
  architecture: 'Architecture',
  security: 'Information Security',
  data: 'Data Governance',
}

export const REVIEW_AUTHORITY: Record<DemandReviewType, string> = {
  architecture: 'Architecture Review Policy (BR-015)',
  security: 'Information Security Review Policy (BR-015)',
  data: 'Data Governance Review Policy (BR-015)',
}

export type DemandImpactFlags = {
  architecture_impact?: boolean | null
  security_privacy_impact?: boolean | null
  data_governance_impact?: boolean | null
}

export function parseReviewType(raw: string | undefined | null): DemandReviewType | null {
  const value = (raw ?? '').trim().toLowerCase()
  if ((DEMAND_REVIEW_TYPES as readonly string[]).includes(value)) {
    return value as DemandReviewType
  }
  return null
}

export function reviewTypeFromGate(gate: string): DemandReviewType | null {
  const code = gate.toUpperCase()
  if (code === 'G-ARCH1') return 'architecture'
  if (code === 'G-SEC1') return 'security'
  if (code === 'G-DATA1') return 'data'
  return null
}

export function triggeredReviewTypes(flags: DemandImpactFlags): DemandReviewType[] {
  const types: DemandReviewType[] = []
  if (flags.architecture_impact) types.push('architecture')
  if (flags.security_privacy_impact) types.push('security')
  if (flags.data_governance_impact) types.push('data')
  return types
}

export function atlasRoleForReviewGate(gateCode: string): string | null {
  const type = reviewTypeFromGate(gateCode)
  return type ? REVIEW_ATLAS_ROLE[type] : null
}

export function isPassedReviewDecision(decision: string | null | undefined): boolean {
  return decision === 'APPROVED' || decision === 'APPROVED_COND'
}

export function isOpenReviewDecision(decision: string | null | undefined): boolean {
  return !decision || decision === 'PENDING'
}
