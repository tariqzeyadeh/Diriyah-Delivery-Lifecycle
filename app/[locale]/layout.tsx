import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Providers } from '@/components/providers'
import { LocaleDocumentAttributes } from '@/components/atlas/LocaleDocumentAttributes'
import { getMessagesForLocale } from '@/src/i18n/messages'
import { routing, type AppLocale } from '@/src/i18n/routing'

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = getMessagesForLocale(locale)

  return (
    <NextIntlClientProvider locale={locale as AppLocale} messages={messages}>
      <LocaleDocumentAttributes locale={locale} />
      <Providers>{children}</Providers>
    </NextIntlClientProvider>
  )
}
