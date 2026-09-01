import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'

export const metadata: Metadata = {
  title: 'Diriyah Delivery Lifecycle',
  description: 'Diriyah project delivery lifecycle oversight and management.',
}

/** Prevents flash of wrong theme/language before React hydrates */
const bootScript = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    var lang = localStorage.getItem('language');
    if (lang !== 'ar' && lang !== 'en') lang = 'en';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('dir', 'ltr');
  }
})();
`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="antialiased bg-surface text-text">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
