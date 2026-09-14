'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

// Shared data (no 'use client') — safe to import from server utilities too
export type { AtlasRole, DemoPersona } from '@/src/lib/atlas-personas'
export { DEMO_PERSONAS } from '@/src/lib/atlas-personas'
import type { AtlasRole, DemoPersona } from '@/src/lib/atlas-personas'
import { DEMO_PERSONAS } from '@/src/lib/atlas-personas'

const STORAGE_KEY = 'atlas_demo_persona'

type AuthContextValue = {
  currentUser: DemoPersona
  personas: DemoPersona[]
  setPersona: (id: string) => void
  isRole: (...roles: AtlasRole[]) => boolean
  canEditDemand: boolean
  canSubmitBudgetToCto: boolean
  canEditBudgetGovernance: boolean
  canDecideGate: (gateCode: string) => boolean
  awaitingRoleForGate: (gateCode: string) => AtlasRole
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredPersonaId(): string {
  if (typeof window === 'undefined') return DEMO_PERSONAS[3].id
  return localStorage.getItem(STORAGE_KEY) || DEMO_PERSONAS[3].id
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [personaId, setPersonaId] = useState<string>(DEMO_PERSONAS[3].id)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const id = readStoredPersonaId()
    setPersonaId(id)
    setHydrated(true)
    // Ensure the server-side cookie is always in sync on load
    document.cookie = `atlas_persona=${id}; path=/; max-age=${8 * 60 * 60}; SameSite=Lax`
  }, [])

  const currentUser = useMemo(
    () => DEMO_PERSONAS.find((p) => p.id === personaId) ?? DEMO_PERSONAS[3],
    [personaId],
  )

  const setPersona = useCallback((id: string) => {
    if (!DEMO_PERSONAS.some((p) => p.id === id)) return
    setPersonaId(id)
    localStorage.setItem(STORAGE_KEY, id)
    // Mirror to a cookie so server actions can read it for RBAC
    document.cookie = `atlas_persona=${id}; path=/; max-age=${8 * 60 * 60}; SameSite=Lax`
  }, [])

  const isRole = useCallback(
    (...roles: AtlasRole[]) => roles.includes(currentUser.role),
    [currentUser.role],
  )

  const canEditDemand =
    currentUser.role === 'Business Owner' ||
    currentUser.role === 'Strategy & Governance' ||
    currentUser.role === 'CTO Office'
  const canSubmitBudgetToCto = currentUser.role === 'Commercial & Budgeting'
  const canEditBudgetGovernance = currentUser.role === 'Commercial & Budgeting' || currentUser.role === 'CTO Office'

  const awaitingRoleForGate = useCallback((gateCode: string): AtlasRole => {
    const code = gateCode.toUpperCase()
    if (code.includes('PMO')) return 'PMO'
    if (code === 'G-ARCH1' || code === 'G-DATA1') return 'Strategy & Governance'
    if (code === 'G-SEC1') return 'CTO Office'
    return 'CTO Office'
  }, [])

  const canDecideGate = useCallback(
    (gateCode: string) => {
      const required = awaitingRoleForGate(gateCode)
      return currentUser.role === required
    },
    [awaitingRoleForGate, currentUser.role],
  )

  const value = useMemo(
    () => ({
      currentUser,
      personas: DEMO_PERSONAS,
      setPersona,
      isRole,
      canEditDemand,
      canSubmitBudgetToCto,
      canEditBudgetGovernance,
      canDecideGate,
      awaitingRoleForGate,
    }),
    [
      currentUser,
      setPersona,
      isRole,
      canEditDemand,
      canSubmitBudgetToCto,
      canEditBudgetGovernance,
      canDecideGate,
      awaitingRoleForGate,
    ],
  )

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-diriyah-bg-primary text-diriyah-primary">
        Loading personas…
      </div>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
