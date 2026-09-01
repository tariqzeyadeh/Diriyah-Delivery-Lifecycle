'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useApp } from '@/lib/app-context'
import { Sidebar } from '@/components/sidebar'
import { TopHeader } from '@/components/top-header'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { useI18n } from '@/lib/i18n/use-i18n'

/** Layout chrome aligned with government-relations-portal / DVT-Committee-Main */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, sidebarCollapsed, isRtl, login } = useApp()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
  }, [pathname])

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface text-text">
        <p className="text-brand">{t('app.loginPrompt')}</p>
        <button
          type="button"
          onClick={login}
          className="rounded-lg bg-brand px-4 py-2 font-medium text-white"
        >
          {t('app.login')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface text-text">
      <TopHeader onToggleMobileMenu={() => setMobileOpen((o) => !o)} />

      <div className="mt-14 flex flex-1">
        <Sidebar isMobileMenuOpen={mobileOpen} onCloseMobileMenu={() => setMobileOpen(false)} />
        <div
          className={`flex h-auto max-w-full flex-1 flex-col transition-all duration-300 ${
            sidebarCollapsed
              ? isRtl
                ? 'lg:pr-20'
                : 'lg:pl-20'
              : isRtl
                ? 'lg:pr-58'
                : 'lg:pl-58'
          }`}
        >
          <Breadcrumbs />
          <div className="flex h-full flex-1 flex-col p-2 md:p-4 md:pb-12">
            <main className="container-app flex h-full w-full flex-1 flex-col">{children}</main>
          </div>
        </div>
      </div>
    </div>
  )
}
