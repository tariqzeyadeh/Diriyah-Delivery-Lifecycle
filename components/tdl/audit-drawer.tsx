'use client'

import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useAuditLog } from '@/lib/tdl/hooks'
import { formatRiyadh } from '@/lib/tdl/time'
import { useI18n } from '@/lib/i18n/use-i18n'

export function AuditDrawer() {
  const [open, setOpen] = useState(false)
  const audit = useAuditLog()
  const { t } = useI18n()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface"
      >
        <ScrollText className="h-3.5 w-3.5" />
        {t('workspace.audit', { count: audit.length })}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto border-s border-border bg-surface-elevated p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('workspace.auditTitle')}</h2>
              <button type="button" className="text-sm text-brand" onClick={() => setOpen(false)}>
                {t('workspace.close')}
              </button>
            </div>
            <ul className="space-y-2">
              {[...audit].reverse().map((e) => (
                <li key={e.id} className="rounded-lg border border-border bg-surface p-3 text-xs">
                  <p className="font-semibold text-text">
                    {e.action} · {e.entity_type}/{e.entity_id}
                  </p>
                  <p className="text-text-muted">{formatRiyadh(e.at_utc)} · actor {e.actor_id}</p>
                  <p className="mt-1 font-mono text-[10px] text-text-muted">
                    {e.before_hash} → {e.after_hash}
                  </p>
                  <p className="font-mono text-[10px] text-text-muted">{e.correlation_id}</p>
                </li>
              ))}
              {audit.length === 0 && <p className="text-text-muted">{t('workspace.noEvents')}</p>}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
