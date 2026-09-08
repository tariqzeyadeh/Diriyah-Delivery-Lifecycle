'use client'

import { useEffect } from 'react'

/**
 * Syncs `<html lang>` / `dir` with the active next-intl locale
 * (root layout owns the tags; this updates them after navigation).
 */
export function LocaleDocumentAttributes({
  locale,
}: {
  locale: string
}) {
  useEffect(() => {
    const root = document.documentElement
    root.lang = locale
    root.dir = locale === 'ar' ? 'rtl' : 'ltr'
  }, [locale])

  return null
}
