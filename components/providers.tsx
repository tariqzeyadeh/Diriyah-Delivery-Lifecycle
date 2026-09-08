'use client'

import { SessionProvider } from 'next-auth/react'
import { AppProvider } from '@/lib/app-context'
import { AuthProvider } from '@/src/providers/AuthProvider'

/**
 * Root providers.
 * - SessionProvider: enterprise SSO (NextAuth / Entra ID) for MVP
 * - AuthProvider: POC demo persona switcher (AUTH_MODE=demo, default)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppProvider>
        <AuthProvider>{children}</AuthProvider>
      </AppProvider>
    </SessionProvider>
  )
}
