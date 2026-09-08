'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/src/i18n/navigation'
import { cn } from '@/lib/utils'
import type { AppLocale } from '@/src/i18n/routing'

/**
 * Header locale toggle — swaps the `[locale]` segment while preserving
 * the active path (and React/client session state).
 */
export function LanguageSwitcher() {
  const t = useTranslations('common')
  const locale = useLocale() as AppLocale
  const pathname = usePathname()
  const router = useRouter()

  function switchLocale(next: AppLocale) {
    if (next === locale) return
    router.replace(pathname, { locale: next })
    router.refresh()
  }

  return (
    <div
      className="inline-flex items-center rounded-xl border border-diriyah-bg-secondary bg-diriyah-bg-alt p-0.5"
      role="group"
      aria-label={t('language')}
      data-testid="language-switcher"
    >
      <button
        type="button"
        onClick={() => switchLocale('en')}
        className={cn(
          'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
          locale === 'en'
            ? 'bg-diriyah-primary text-white shadow-sm'
            : 'text-text-muted hover:text-text',
        )}
        aria-pressed={locale === 'en'}
        data-testid="locale-en"
      >
        {t('english')}
      </button>
      <button
        type="button"
        onClick={() => switchLocale('ar')}
        className={cn(
          'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
          locale === 'ar'
            ? 'bg-diriyah-primary text-white shadow-sm'
            : 'text-text-muted hover:text-text',
        )}
        aria-pressed={locale === 'ar'}
        data-testid="locale-ar"
      >
        {t('arabic')}
      </button>
    </div>
  )
}
