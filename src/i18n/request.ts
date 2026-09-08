import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'
import { getMessagesForLocale } from './messages'

export default getRequestConfig(async ({ locale, requestLocale }) => {
  let resolved: string = routing.defaultLocale

  if (hasLocale(routing.locales, locale)) {
    resolved = locale
  } else {
    const requested = await requestLocale
    if (hasLocale(routing.locales, requested)) {
      resolved = requested
    } else {
      try {
        const rootParams = (await import('next/root-params')) as {
          locale?: () => Promise<string | undefined>
        }
        const fromParams = typeof rootParams.locale === 'function' ? await rootParams.locale() : undefined
        if (hasLocale(routing.locales, fromParams)) {
          resolved = fromParams
        }
      } catch {
        // next/root-params is generated after the first Next compile
      }
    }
  }

  return {
    locale: resolved,
    messages: getMessagesForLocale(resolved),
  }
})
