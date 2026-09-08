'use client'

import { useRef, useState } from 'react'
import { FileUp, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { EvidenceFile } from '@/lib/forms/types'

const ALLOWED_EXT = ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'png', 'jpg', 'jpeg', 'zip']
const MAX_BYTES = 100 * 1024 * 1024

function extOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || ''
}

export function EvidenceDropzone({
  files,
  readOnly,
  onChange,
  onError,
}: {
  files: EvidenceFile[]
  readOnly?: boolean
  onChange: (files: EvidenceFile[]) => void
  onError?: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const reportError = (message: string) => {
    setLocalError(message)
    onError?.(message)
  }

  const handleFiles = async (list: FileList | null) => {
    if (!list || readOnly) return
    setBusy(true)
    setLocalError(null)
    try {
      const next = [...files]
      for (const file of Array.from(list)) {
        if (file.size >= MAX_BYTES) {
          reportError(`${file.name} exceeds the 100MB limit`)
          continue
        }
        if (!ALLOWED_EXT.includes(extOf(file.name))) {
          reportError(`File type not allowed. Allowed: ${ALLOWED_EXT.join(', ')}`)
          continue
        }
        const quarantine = /virus|malware|eicar/i.test(file.name)
        const entry: EvidenceFile = {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          scanStatus: quarantine ? 'Quarantined' : 'Clean',
        }
        if (quarantine) {
          reportError(`${file.name} was quarantined by the malware scan`)
          continue
        }
        next.push(entry)
      }
      onChange(next)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-4 py-8 transition hover:border-diriyah-primary"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void handleFiles(e.dataTransfer.files)
          }}
        >
          <FileUp className="mb-2 h-8 w-8 text-diriyah-primary" />
          <p className="text-sm font-medium text-text">
            {busy ? 'Scanning…' : 'Drop evidence or click to upload'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            PDF, DOCX, XLSX, PPTX, CSV, PNG, JPG, ZIP — under 100MB
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.docx,.xlsx,.pptx,.csv,.png,.jpg,.jpeg,.zip"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      )}
      {localError && (
        <p className="text-xs text-diriyah-red" role="alert">
          {localError}
        </p>
      )}
      <ul className="space-y-1">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
          >
            <span className="truncate text-text">{f.name}</span>
            <span className="ml-3 inline-flex items-center gap-1 text-xs">
              {f.scanStatus === 'Clean' ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-diriyah-green" /> Clean
                </>
              ) : (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 text-diriyah-red" /> {f.scanStatus}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
