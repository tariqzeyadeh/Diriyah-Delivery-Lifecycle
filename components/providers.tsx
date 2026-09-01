'use client'

import { AppProvider } from '@/lib/app-context'
import { AppShell } from '@/components/app-shell'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  )
}
