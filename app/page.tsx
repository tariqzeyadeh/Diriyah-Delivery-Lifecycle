'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n/use-i18n'

export default function HomePage() {
  const { t } = useI18n()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">{t('home.title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('home.subtitle')}</p>
      </div>
      <Link
        href="/lifecycle/TDL-2026-00001"
        className="card card-hover block p-6 no-underline transition"
      >
        <p className="font-mono text-xs text-brand">TDL-2026-00001</p>
        <p className="mt-1 text-lg font-semibold text-text">{t('home.cardTitle')}</p>
        <p className="mt-2 text-sm text-text-muted">{t('home.cardBody')}</p>
      </Link>
    </div>
  )
}
