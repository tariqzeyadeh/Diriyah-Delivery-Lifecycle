'use client'

import type { ProblemJson } from '@/lib/tdl/types'
import { AlertTriangle, X } from 'lucide-react'

export function ProblemBanner({
  problem,
  onClose,
}: {
  problem: ProblemJson | null
  onClose?: () => void
}) {
  if (!problem) return null

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {problem.status} {problem.code}
          </p>
          <p className="mt-0.5 text-sm">{problem.message}</p>
          <p className="mt-1 font-mono text-[11px] text-red-700/80 dark:text-red-300/80">
            correlation_id: {problem.correlation_id}
          </p>
          {problem.field_errors?.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs">
              {problem.field_errors.map((f) => (
                <li key={`${f.field}-${f.message}`}>
                  <span className="font-medium">{f.field}</span>: {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/50">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
