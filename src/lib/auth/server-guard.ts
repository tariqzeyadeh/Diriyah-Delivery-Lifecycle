/**
 * Server-side RBAC helpers for Server Actions (App Router).
 *
 * In demo mode (no Azure AD configured), reads the `atlas_persona` cookie
 * set by AuthProvider and maps it to an AtlasRole.
 *
 * In SSO mode, falls back to the NextAuth JWT session.
 */

import { cookies } from 'next/headers'
import { getAtlasRoleFromSession, isSsoAuthMode } from '@/src/lib/auth/session'
import { DEMO_PERSONAS, type AtlasRole } from '@/src/lib/atlas-personas'
import { auditLog } from '@/src/lib/logger'

// ─────────────────────────────────────────────────────────────────────────────
// Resolve role server-side
// ─────────────────────────────────────────────────────────────────────────────

export async function getServerRole(): Promise<AtlasRole | null> {
  if (isSsoAuthMode()) {
    return getAtlasRoleFromSession()
  }
  // Demo mode: read cookie
  const cookieStore = await cookies()
  const personaId = cookieStore.get('atlas_persona')?.value
  if (!personaId) return null
  return DEMO_PERSONAS.find((p) => p.id === personaId)?.role ?? null
}

export async function getServerPersonaEmail(): Promise<string | null> {
  if (isSsoAuthMode()) {
    const { getAtlasSession } = await import('@/src/lib/auth/session')
    const session = await getAtlasSession()
    return session?.user?.email ?? null
  }
  const cookieStore = await cookies()
  const personaId = cookieStore.get('atlas_persona')?.value
  if (!personaId) return null
  return DEMO_PERSONAS.find((p) => p.id === personaId)?.email ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Role guards
// ─────────────────────────────────────────────────────────────────────────────

export type RbacError = { ok: false; error: string; code: 'RBAC_DENIED' }

/**
 * Returns `null` if the caller has one of the required roles, or a typed
 * RbacError to return directly from the action if denied.
 *
 * In demo mode with no cookie set, defaults to `'CTO Office'` so pages
 * that haven't set the persona yet don't hard-block.
 */
export async function requireRole(
  ...allowedRoles: AtlasRole[]
): Promise<RbacError | null> {
  let role = await getServerRole()
  if (!role) {
    // No session / no cookie — default to CTO for demo safety
    role = 'CTO Office'
  }
  if (allowedRoles.includes(role)) return null

  // G-22: Audit-log denied access attempts
  const email = await getServerPersonaEmail()
  auditLog({
    action_type: 'RBAC_DENIED',
    active_user_id: email ?? 'unknown',
    outcome: 'failure',
    note: `Role '${role}' attempted action requiring: ${allowedRoles.join(', ')}`,
  })

  return {
    ok: false as const,
    error: `Access denied. Required role(s): ${allowedRoles.join(', ')}. Your role: ${role}.`,
    code: 'RBAC_DENIED',
  }
}

/**
 * Gate-specific role check — mirrors AuthProvider.canDecideGate() server-side.
 */
export async function requireGateRole(gateCode: string): Promise<RbacError | null> {
  const code = gateCode.toUpperCase()
  let requiredRole: AtlasRole
  if (code.includes('PMO')) requiredRole = 'PMO'
  else if (code === 'G-ARCH1' || code === 'G-DATA1') requiredRole = 'Strategy & Governance'
  else if (code === 'G-SEC1') requiredRole = 'CTO Office'
  else requiredRole = 'CTO Office'  // G-S1, G-B1, demand reviews
  return requireRole(requiredRole)
}
