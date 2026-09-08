'use client'

import { usePathname } from '@/src/i18n/navigation'
import { backgroundForPath } from '@/lib/atlas/page-backgrounds'

/** Full-bleed brand photo with a light Diriyah wash; content sits on a frosted panel. */
export function PageBackdrop({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const src = backgroundForPath(pathname)

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex-1 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 scale-105 bg-cover bg-center bg-no-repeat transition-[background-image] duration-500"
        style={{ backgroundImage: `url('${src}')` }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-diriyah-bg-primary/55" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-diriyah-bg-primary/80 via-transparent to-diriyah-bg-primary/40"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-5 py-5 md:px-7 md:py-6">
        <div className="rounded-md border border-white/50 bg-diriyah-bg-alt/85 p-4 text-sm md:p-5">
          {children}
        </div>
      </div>
    </div>
  )
}
