import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import type { AppLocale } from './routing'

const catalogs = { en, ar } as const

export function getMessagesForLocale(locale: string) {
  return locale === 'ar' ? catalogs.ar : catalogs.en
}

export function isAppLocale(locale: string): locale is AppLocale {
  return locale === 'en' || locale === 'ar'
}
