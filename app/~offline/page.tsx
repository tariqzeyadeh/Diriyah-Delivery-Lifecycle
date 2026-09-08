import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Offline · Diriyah',
  robots: { index: false, follow: false },
}

/**
 * PWA document fallback — uses root layout `<html>` / `<body>`.
 */
export default function OfflinePage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6"
      style={{
        background: 'linear-gradient(160deg, #F4EFE7 0%, #E8DFD2 45%, #D4C4B0 100%)',
        color: '#2a211c',
      }}
    >
      <Image
        src="/logo.png"
        alt="Diriyah Company"
        width={72}
        height={72}
        className="h-[72px] w-[72px] rounded-full object-contain shadow-md"
        priority
      />
      <div className="max-w-md text-center">
        <p
          className="text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: '#C27451' }}
        >
          Diriyah
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: '#7A4E2D' }}>
          You are currently offline
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: '#6b5e52' }}>
          Diriyah needs a network connection to load live portfolio data. Reconnect to continue
          governance workflows, or reopen a previously visited screen from your device cache.
        </p>
      </div>
      <Link
        href="/en/home"
        className="inline-flex h-9 items-center justify-center rounded-md px-4 text-xs font-semibold text-white no-underline"
        style={{ backgroundColor: '#7A4E2D' }}
      >
        Retry Home
      </Link>
    </div>
  )
}
