'use client'

import {
  LayoutDashboard,
  Compass,
  Wallet,
  ClipboardCheck,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/src/i18n/navigation'
import { isAtlasNavActive } from '@/lib/atlas/nav'
import { cn } from '@/lib/utils'

const MOBILE_TABS = [
  { href: '/home', labelKey: 'home', icon: LayoutDashboard },
  { href: '/strategy', labelKey: 'strategy', icon: Compass },
  { href: '/budget', labelKey: 'budget', icon: Wallet },
  { href: '/reports/one-pager', labelKey: 'approvals', icon: ClipboardCheck },
] as const

/** Sticky bottom tab bar — mobile / iPad portrait (&lt; md) only. */
export function AtlasMobileTabBar() {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-white/95 shadow-[0_-4px_20px_rgba(42,33,28,0.08)] backdrop-blur-md md:hidden"
      aria-label="Primary"
      data-testid="mobile-tab-bar"
    >
      {MOBILE_TABS.map((tab) => {
        const active = isAtlasNavActive(pathname, tab.href)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 no-underline transition',
              active ? 'text-[var(--diriyah-primary)]' : 'text-text-muted',
            )}
          >
            <Icon
              className={cn('h-5 w-5', active && 'text-[var(--diriyah-primary)]')}
              strokeWidth={active ? 2.25 : 1.75}
            />
            <span className="text-[10px] font-semibold tracking-wide">{t(tab.labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
