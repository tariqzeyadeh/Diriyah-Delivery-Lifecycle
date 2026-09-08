import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Diriyah Strategic Governance',
  description:
    'Diriyah top-down strategic governance platform — decision-making, accountability, and oversight.',
  applicationName: 'Diriyah',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Diriyah',
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#7A4E2D',
}

/**
 * Next.js 16 requires `<html>` / `<body>` on the root layout.
 * Locale `lang` / `dir` are applied by `LocaleDocumentAttributes` under `[locale]`.
 */
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const headerLocale = (await headers()).get('x-next-intl-locale')
  const locale = headerLocale === 'ar' ? 'ar' : 'en'

  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-theme="light"
      className={inter.variable}
      suppressHydrationWarning
    >
      <body className="antialiased bg-diriyah-bg-primary text-text">
        {children}
      </body>
    </html>
  )
}
