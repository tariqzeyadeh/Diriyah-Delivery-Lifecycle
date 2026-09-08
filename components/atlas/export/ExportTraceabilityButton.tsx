'use client'

import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  masterTraceId?: string
  className?: string
  label?: string
}

/** Downloads the flattened Master Traceability Matrix (.xlsx). */
export function ExportTraceabilityButton({
  masterTraceId,
  className,
  label = 'Export to Excel',
}: Props) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      const qs = masterTraceId ? `?masterTraceId=${encodeURIComponent(masterTraceId)}` : ''
      const res = await fetch(`/api/export/traceability${qs}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] || `Diriyah_Traceability_Export.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      window.alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={cn(
        'btn inline-flex h-11 items-center gap-2 px-4 text-sm font-semibold text-white disabled:opacity-60',
        className,
      )}
      style={{ backgroundColor: 'var(--diriyah-primary)', borderColor: 'transparent' }}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4" />
      )}
      {busy ? 'Preparing…' : label}
    </button>
  )
}
