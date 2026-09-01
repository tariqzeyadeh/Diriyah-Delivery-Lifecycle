'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { useI18n } from '@/lib/i18n/use-i18n'

const SEGMENT_KEYS: Record<string, string> = {
  lifecycle: 'nav.lifecycle',
}

/** Matches government-relations-portal Breadcrumbs — flush under appbar */
export function Breadcrumbs() {
  const pathname = usePathname()
  const { isRtl } = useApp()
  const { t } = useI18n()

  if (!pathname) return null

  const parts = pathname.split('/').filter(Boolean)
  const crumbs: { href: string; label: string }[] = []

  crumbs.push({ href: '/', label: t('app.home') })

  if (parts.length > 0) {
    let acc = ''
    parts.forEach((seg) => {
      acc += `/${seg}`
      const key = SEGMENT_KEYS[seg]
      crumbs.push({
        href: acc,
        label: key ? t(key) : decodeURIComponent(seg),
      })
    })
  }

  return (
    <nav className="z-10 flex items-center gap-2 border-b border-border bg-surface-elevated px-4 py-1.5 md:px-6">
      <Link href="/" className="text-text-muted no-underline hover:text-text" aria-label={t('app.home')}>
        <Home className="h-4 w-4" />
      </Link>
      {crumbs.map((c, idx) => {
        const last = idx === crumbs.length - 1
        return (
          <div className="flex items-center gap-2" key={`${c.href}-${idx}`}>
            <span className="text-text-muted">{isRtl ? '‹' : '>'}</span>
            {last ? (
              <span className="text-xs font-medium text-brand">{c.label}</span>
            ) : (
              <Link href={c.href} className="text-xs font-medium text-text no-underline hover:text-brand">
                {c.label}
              </Link>
            )}
          </div>
        )
      })}
    </nav>
  )
}
