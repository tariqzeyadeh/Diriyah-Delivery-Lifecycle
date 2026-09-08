import { getServerSession } from 'next-auth'
import { authOptions } from '@/src/lib/auth/auth-options'
import type { AtlasRole } from '@/src/providers/AuthProvider'

/** Server-side session helper for App Router server components / actions. */
export async function getAtlasSession() {
  return getServerSession(authOptions)
}

export async function getAtlasRoleFromSession(): Promise<AtlasRole | null> {
  const session = await getAtlasSession()
  return session?.user?.atlasRole ?? null
}

/** True when enterprise SSO is the active auth mode. */
export function isSsoAuthMode(): boolean {
  return (process.env.AUTH_MODE ?? 'demo').toLowerCase() === 'sso'
}
