'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/src/i18n/navigation'
import { createBudgetFromDemand } from '@/src/actions/budget'
import { useAuth } from '@/src/providers/AuthProvider'
import type { DemandListItem } from '@/src/actions/portfolio'
import { cn } from '@/lib/utils'

export function CreateBudgetForm({ demands }: { demands: DemandListItem[] }) {
  const t = useTranslations('budgetCreate')
  const tc = useTranslations('common')
  const router = useRouter()
  const { currentUser } = useAuth()
  const [demandId, setDemandId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!demandId) {
      setError(t('demandRequired'))
      return
    }
    startTransition(async () => {
      setError(null)
      const result = await createBudgetFromDemand({
        demand_id: demandId,
        created_by: currentUser.email,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/budget/${encodeURIComponent(result.budget_submission_id)}/lines`)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-md border border-border bg-white p-5"
    >
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-text">
          {t('demandLabel')} <span className="text-diriyah-red">*</span>
        </span>
        <select
          className="input-base"
          value={demandId}
          onChange={(e) => {
            setDemandId(e.target.value)
            setError(null)
          }}
          required
          disabled={pending}
        >
          <option value="">{t('demandPlaceholder')}</option>
          {demands.map((d) => (
            <option key={d.demand_id} value={d.demand_id}>
              {d.demand_title} ({d.demand_id})
            </option>
          ))}
        </select>
        <p className="text-xs text-text-muted">{t('demandHint')}</p>
      </label>

      {error ? (
        <p className="rounded-md border border-diriyah-red/20 bg-diriyah-red/10 px-3 py-2 text-sm text-diriyah-red">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/budget"
          className="btn h-9 border-border bg-white px-4 text-sm no-underline"
        >
          {tc('cancel')}
        </Link>
        <button
          type="submit"
          disabled={pending || !demandId}
          className={cn(
            'btn btn-primary inline-flex h-9 items-center gap-1.5 px-4 text-sm disabled:opacity-60',
          )}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {pending ? t('creating') : t('create')}
        </button>
      </div>
    </form>
  )
}
