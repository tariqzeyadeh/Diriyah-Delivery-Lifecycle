'use client'

import { useRef, useState } from 'react'
import { FileUp, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { EvidenceFile } from '@/lib/tdl/types'
import { Problems, TdlApiError } from '@/lib/tdl/errors'
import { useTdlStore } from '@/lib/tdl/store'
import { useI18n } from '@/lib/i18n/use-i18n'

const ALLOWED_EXT = ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'png', 'jpg', 'jpeg', 'zip']
const MAX_BYTES = 100 * 1024 * 1024

function extOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || ''
}

export function EvidenceDropzone({
  files,
  readOnly,
  onChange,
}: {
  files: EvidenceFile[]
  readOnly?: boolean
  onChange: (files: EvidenceFile[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const { t } = useI18n()
  const setProblem = useTdlStore((s) => s.clearProblem)
  const pushProblem = (p: ReturnType<typeof Problems.evidenceQuarantined>) =>
    useTdlStore.setState({ lastProblem: p })

  const handleFiles = async (list: FileList | null) => {
    if (!list || readOnly) return
    setBusy(true)
    setProblem()
    try {
      const next = [...files]
      for (const file of Array.from(list)) {
        if (file.size >= MAX_BYTES) {
          pushProblem({
            status: 422,
            code: 'TDL-VAL-001',
            message: 'File exceeds 100MB limit',
            correlation_id: `corr-${Date.now()}`,
            field_errors: [{ field: 'evidence', message: `${file.name} >= 100MB` }],
          })
          continue
        }
        if (!ALLOWED_EXT.includes(extOf(file.name))) {
          pushProblem({
            status: 422,
            code: 'TDL-VAL-001',
            message: 'File type not allowed',
            correlation_id: `corr-${Date.now()}`,
            field_errors: [{ field: 'evidence', message: `Allowed: ${ALLOWED_EXT.join(', ')}` }],
          })
          continue
        }
        // Simulate malware scan: filename containing "virus" or "malware" quarantines
        const quarantine = /virus|malware|eicar/i.test(file.name)
        const entry: EvidenceFile = {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          scanStatus: quarantine ? 'Quarantined' : 'Clean',
        }
        if (quarantine) {
          pushProblem(Problems.evidenceQuarantined())
          throw new TdlApiError(Problems.evidenceQuarantined())
        }
        next.push(entry)
      }
      onChange(next)
    } catch {
      /* problem already set */
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-4 py-8 transition hover:border-brand"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void handleFiles(e.dataTransfer.files)
          }}
        >
          <FileUp className="mb-2 h-8 w-8 text-brand" />
          <p className="text-sm font-medium text-text">
            {busy ? t('evidence.scanning') : t('evidence.drop')}
          </p>
          <p className="mt-1 text-xs text-text-muted">{t('evidence.types')}</p>
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
                  <ShieldCheck className="h-3.5 w-3.5 text-green-600" /> {t('evidence.clean')}
                </>
              ) : (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 text-red-600" /> {f.scanStatus}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
