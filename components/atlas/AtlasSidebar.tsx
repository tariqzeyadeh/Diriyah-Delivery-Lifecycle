'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/src/i18n/navigation'
import { ATLAS_NAV, isAtlasNavActive } from '@/lib/atlas/nav'
import { cn } from '@/lib/utils'

const PRIMARY_HREFS = new Set([
  '/home',
  '/strategy',
  '/demand',
  '/budget',
  '/procurement',
  '/pmo',
  '/projects',
  '/performance',
])

const HREF_TO_NAV_KEY: Record<string, string> = {
  '/home': 'home',
  '/strategy': 'strategy',
  '/demand': 'demand',
  '/budget': 'budget',
  '/procurement': 'procurement',
  '/pmo': 'pmo',
  '/projects': 'projects',
  '/performance': 'performance',
  '/value-realization': 'valueRealization',
  '/reports': 'reports',
  '/help': 'help',
  '/admin': 'admin',
  '/demand/reviews': 'demand/reviews',
  '/demand/validate': 'demand/validate',
  '/gates/g-s1': 'gates/g-s1',
  '/gates/g-b1': 'gates/g-b1',
  '/gates/g-pmo1': 'gates/g-pmo1',
}

function navLabel(t: (key: string) => string, href: string, fallback: string) {
  const key = HREF_TO_NAV_KEY[href]
  return key ? t(key) : fallback
}

export function AtlasSidebar() {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const primary = ATLAS_NAV.filter((item) => PRIMARY_HREFS.has(item.href))
  const secondary = ATLAS_NAV.filter((item) => !PRIMARY_HREFS.has(item.href))

  return (
    <aside className="fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-gradient-to-b from-[#0e1a2b] via-[#132035] to-[#0a1220] text-white shadow-2xl">
      {/* G-23: dark navy header strip matching mockup */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 bg-gradient-to-r from-[#1a3252] to-[#0e1a2b] px-4">
        <Image
          src="/logo.png"
          alt="Diriyah Company"
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-full object-contain ring-2 ring-diriyah-amber/30"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-[0.14em] text-diriyah-amber">Diriyah</p>
          <p className="truncate text-[11px] text-blue-200/60">{t('strategicGovernance')}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
          {t('workspace')}
        </p>
        {primary.map((item) => {
          const active = isAtlasNavActive(pathname, item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition',
                active
                  ? 'bg-gradient-to-r from-[#1e4a7a]/70 to-[#0e2f55]/40 text-white shadow-md ring-1 ring-blue-400/30'
                  : 'text-white/65 hover:bg-white/5 hover:text-white',
              )}
            >
              <span
                className={cn(
                  'h-5 w-0.5 rounded-full transition',
                  active ? 'bg-diriyah-amber' : 'bg-transparent group-hover:bg-blue-400/40',
                )}
              />
              <Icon
                className={cn('h-[18px] w-[18px]', active ? 'text-blue-300' : 'text-white/50')}
              />
              <span>{navLabel(t, item.href, item.label)}</span>
            </Link>
          )
        })}

        {secondary.length > 0 ? (
          <>
            <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
              {t('governance')}
            </p>
            {secondary.map((item) => {
              const active = isAtlasNavActive(pathname, item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition',
                    active
                      ? 'bg-gradient-to-r from-[#1e4a7a]/70 to-[#0e2f55]/40 text-white shadow-md ring-1 ring-blue-400/30'
                      : 'text-white/65 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px]',
                      active ? 'text-blue-300' : 'text-white/50',
                    )}
                  />
                  <span>{navLabel(t, item.href, item.label)}</span>
                </Link>
              )
            })}
          </>
        ) : null}
      </nav>

      <div className="border-t border-white/10 bg-[#0a1220] px-5 py-4">
        <p className="text-[11px] text-blue-200/40">Diriyah Company · v2.0</p>
      </div>
    </aside>
  )
}
