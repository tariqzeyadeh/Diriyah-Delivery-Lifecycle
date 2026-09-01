'use client'

import { useState } from 'react'
import { DynamicFormEngine, type FormFieldSchema } from './dynamic-form-engine'
import { PERSONAS } from '@/lib/tdl/mock-seed'
import { defaultRemediationDueUtc } from '@/lib/tdl/calendar'
import { formatRiyadhDate } from '@/lib/tdl/time'
import { useI18n } from '@/lib/i18n/use-i18n'

export function ApprovalGate({
  title,
  values,
  schema,
  wouldViolateSod,
  escalatedToManagerId,
  onApprove,
  onReturn,
}: {
  title: string
  values: Record<string, unknown>
  schema: FormFieldSchema[]
  wouldViolateSod?: boolean
  escalatedToManagerId?: string | null
  onApprove: () => void
  onReturn: (packet: {
    returnReason: string
    comments: string
    remediationOwnerId: string
    dueDateUtc: string
  }) => void
}) {
  const { t, isRtl } = useI18n()
  const [returning, setReturning] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [comments, setComments] = useState('')
  const [remediationOwnerId, setRemediationOwnerId] = useState('')
  const [dueDateUtc, setDueDateUtc] = useState(defaultRemediationDueUtc())

  const manager = PERSONAS.find((p) => p.id === escalatedToManagerId)

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <h3 className="mb-3 text-sm font-semibold text-text">{t('gate.readOnly', { title })}</h3>
        <DynamicFormEngine schema={schema} values={values} readOnly onChange={() => {}} />
      </div>

      {escalatedToManagerId && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('gate.escalated', {
            name: (isRtl ? manager?.nameAr : manager?.name) ?? escalatedToManagerId,
          })}
        </div>
      )}

      {wouldViolateSod && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {t('gate.sodWarning')}
        </div>
      )}

      {!returning ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onApprove}
            className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
          >
            {t('common.approve')}
          </button>
          <button
            type="button"
            onClick={() => setReturning(true)}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
          >
            {t('common.return')}
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-4">
          <p className="text-sm font-semibold text-red-800">{t('gate.returnTitle')}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold uppercase text-text-muted">
              {t('gate.returnReason')}
              <input
                className="input-base font-normal normal-case"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs font-semibold uppercase text-text-muted">
              {t('gate.remediationOwner')}
              <select
                className="input-base font-normal normal-case"
                value={remediationOwnerId}
                onChange={(e) => setRemediationOwnerId(e.target.value)}
              >
                <option value="">{t('common.select')}</option>
                {PERSONAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isRtl ? p.nameAr : p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold uppercase text-text-muted md:col-span-2">
              {t('gate.comments')}
              <textarea
                className="input-base min-h-[72px] py-2 font-normal normal-case"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs font-semibold uppercase text-text-muted">
              {t('gate.dueDate')}
              <input
                type="date"
                className="input-base font-normal normal-case"
                value={dueDateUtc.slice(0, 10)}
                onChange={(e) => setDueDateUtc(`${e.target.value}T00:00:00.000Z`)}
              />
              <span className="mt-1 block font-normal normal-case text-[11px] text-text-muted">
                {t('gate.riyadh', { date: formatRiyadhDate(dueDateUtc) })}
              </span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={() =>
                onReturn({ returnReason, comments, remediationOwnerId, dueDateUtc })
              }
            >
              {t('common.confirmReturn')}
            </button>
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-sm"
              onClick={() => setReturning(false)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
