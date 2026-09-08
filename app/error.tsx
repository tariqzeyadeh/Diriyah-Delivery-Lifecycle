'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Diriyah] System exception', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-diriyah-bg-primary px-4 py-12">
      <div className="w-full max-w-lg rounded-md border border-border bg-white p-5">
        <div
          className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-sm text-white"
          style={{ backgroundColor: 'var(--diriyah-red)' }}
        >
          <AlertTriangle className="h-4 w-4" />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-diriyah-accent">
          Diriyah Governance Platform
        </p>
        <h1 className="mt-1 text-xl font-semibold text-diriyah-primary">
          System Exception Logged
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          An unexpected error occurred while processing this request. The incident has been captured
          for operations review. No stack trace is shown to preserve a controlled executive
          experience.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-md border border-border bg-diriyah-bg-alt px-3 py-2 font-mono text-xs text-text-muted">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="btn btn-primary h-9 px-4 text-xs">
            Try again
          </button>
          <Link href="/en/home" className="btn h-9 border-border bg-white px-4 text-xs no-underline">
            Return to cockpit
          </Link>
        </div>
      </div>
    </div>
  )
}
