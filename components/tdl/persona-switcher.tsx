'use client'

import { UserRound } from 'lucide-react'
import { PERSONAS } from '@/lib/tdl/mock-seed'
import { usePersona } from '@/lib/tdl/hooks'
import { useI18n } from '@/lib/i18n/use-i18n'

export function PersonaSwitcher() {
  const { actorId, persona, setPersona } = usePersona()
  const { t, isRtl } = useI18n()

  return (
    <div className="flex items-center gap-2">
      <UserRound className="h-4 w-4 text-brand" />
      <select
        className="max-w-[240px] rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-xs text-text"
        value={actorId}
        onChange={(e) => setPersona(e.target.value)}
        aria-label={t('workspace.persona')}
        title={persona?.roles.join(', ')}
      >
        {PERSONAS.map((p) => (
          <option key={p.id} value={p.id}>
            {isRtl ? p.nameAr : p.name} ({p.roles[0]})
          </option>
        ))}
      </select>
    </div>
  )
}
