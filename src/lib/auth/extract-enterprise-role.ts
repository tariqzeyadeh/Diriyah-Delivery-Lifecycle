import type { AtlasRole } from '@/src/providers/AuthProvider'

/**
 * Entra ID (Azure AD) security group → Diriyah Prisma / RBAC role mapping.
 * Configure real Object IDs or display names via env (comma-separated aliases supported).
 */
const DEFAULT_GROUP_ROLE_MAP: Record<string, AtlasRole> = {
  'Tech-Gov-Group': 'Strategy & Governance',
  'Tech-Strategy-Governance': 'Strategy & Governance',
  'Tech-Business-Owner-Group': 'Business Owner',
  'Tech-Business-Owner': 'Business Owner',
  'Tech-Commercial-Budget-Group': 'Commercial & Budgeting',
  'Tech-Commercial-Budgeting': 'Commercial & Budgeting',
  'Tech-CTO-Group': 'CTO Office',
  'Tech-CTO-Office': 'CTO Office',
  'Tech-PMO-Group': 'PMO',
  'Tech-PMO': 'PMO',
}

function parseEnvGroupMap(): Record<string, AtlasRole> {
  const raw = process.env.AZURE_AD_GROUP_ROLE_MAP
  if (!raw?.trim()) return {}

  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    const out: Record<string, AtlasRole> = {}
    for (const [group, role] of Object.entries(parsed)) {
      out[group] = role as AtlasRole
    }
    return out
  } catch {
    console.warn('[auth] AZURE_AD_GROUP_ROLE_MAP is not valid JSON — using defaults')
    return {}
  }
}

/**
 * Maps Azure AD group claims (display names and/or object IDs) to Diriyah enterprise roles.
 * Prefer the first matching group in priority order (governance → delivery).
 */
export function extractEnterpriseRole(
  groupClaims: string[] | undefined | null,
  fallback: AtlasRole = 'Business Owner',
): AtlasRole {
  const groups = (groupClaims ?? []).map((g) => g.trim()).filter(Boolean)
  if (groups.length === 0) return fallback

  const map: Record<string, AtlasRole> = {
    ...DEFAULT_GROUP_ROLE_MAP,
    ...parseEnvGroupMap(),
  }

  const priority: AtlasRole[] = [
    'CTO Office',
    'PMO',
    'Strategy & Governance',
    'Commercial & Budgeting',
    'Business Owner',
  ]

  const matched = new Set<AtlasRole>()
  for (const claim of groups) {
    const role = map[claim] ?? map[claim.toLowerCase()]
    if (role) matched.add(role)
  }

  for (const role of priority) {
    if (matched.has(role)) return role
  }

  return fallback
}

/** Normalize common Entra claim shapes into a flat group id/name list. */
export function normalizeAzureGroupClaims(profile: {
  groups?: string[]
  roles?: string[]
}): string[] {
  return [...(profile.groups ?? []), ...(profile.roles ?? [])]
}
