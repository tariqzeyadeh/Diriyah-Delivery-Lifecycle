'use client'

import { useLocale, useTranslations } from 'next-intl'
import { AtlasSidebar } from './AtlasSidebar'
import { AtlasHeader } from './AtlasHeader'
import { AtlasMobileTabBar } from './AtlasMobileTabBar'
import { PageBackdrop } from './PageBackdrop'
import { UatFeedbackWidget } from './UatFeedbackWidget'
import { CopilotChat } from '@/src/components/CopilotChat'
import { useApp } from '@/lib/app-context'
import { usePathname } from '@/src/i18n/navigation'

/**
 * Diriyah shell — fixed sidebar on desktop; bottom tabs + hamburger header on mobile.
 */
export function AtlasLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, login } = useApp()
  const locale = useLocale()
  const t = useTranslations('common')
  const pathname = usePathname()
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const hideFloatingTools = pathname.includes('/budget')

  if (!isLoggedIn) {
    return (
      <div
        dir={dir}
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-diriyah-bg-primary"
      >
        <p className="text-diriyah-primary">{t('pleaseSignIn')}</p>
        <button type="button" onClick={login} className="btn btn-primary">
          {t('login')}
        </button>
      </div>
    )
  }

  return (
    <div dir={dir} className="min-h-screen bg-diriyah-bg-primary">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <AtlasSidebar />
      </div>

      <div className="flex min-h-screen flex-col md:ps-64">
        <AtlasHeader />
        <main className="flex flex-1 flex-col overflow-y-auto bg-diriyah-bg-primary p-0 pb-20 md:pb-0">
          <PageBackdrop>{children}</PageBackdrop>
        </main>
      </div>

      <AtlasMobileTabBar />
      {!hideFloatingTools ? <CopilotChat /> : null}
      {!hideFloatingTools ? <UatFeedbackWidget /> : null}
    </div>
  )
}

export default AtlasLayout
