'use client'

import { RepeatingDataGrid, type DataGridColumn } from './repeating-data-grid'
import { EvidenceDropzone } from './evidence-dropzone'
import type { EvidenceFile } from '@/lib/tdl/types'
import { useI18n } from '@/lib/i18n/use-i18n'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'choice'
  | 'boolean'
  | 'date'
  | 'number'
  | 'currency'
  | 'percent'
  | 'repeatingTable'
  | 'evidence'

export interface FormFieldSchema {
  name: string
  label: string
  type: FieldType
  options?: string[]
  currencyCodeField?: string
  columns?: DataGridColumn[]
  readOnly?: boolean
  helpText?: string
}

export function DynamicFormEngine({
  schema,
  values,
  readOnly,
  onChange,
}: {
  schema: FormFieldSchema[]
  values: Record<string, unknown>
  readOnly?: boolean
  onChange: (patch: Record<string, unknown>) => void
}) {
  const { t } = useI18n()
  const set = (name: string, value: unknown) => onChange({ [name]: value })

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {schema.map((field) => {
        const locked = readOnly || field.readOnly
        const span =
          field.type === 'repeatingTable' ||
          field.type === 'evidence' ||
          field.type === 'textarea'
            ? 'md:col-span-2'
            : ''

        return (
          <div key={field.name} className={`space-y-1.5 ${span}`}>
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              {field.label}
            </label>
            {field.helpText && <p className="text-xs text-text-muted">{field.helpText}</p>}

            {field.type === 'textarea' && (
              <textarea
                className="input-base min-h-[88px] py-2"
                disabled={locked}
                value={String(values[field.name] ?? '')}
                onChange={(e) => set(field.name, e.target.value)}
              />
            )}

            {field.type === 'text' && (
              <input
                className="input-base"
                disabled={locked}
                value={String(values[field.name] ?? '')}
                onChange={(e) => set(field.name, e.target.value)}
              />
            )}

            {field.type === 'number' && (
              <input
                type="number"
                className="input-base"
                disabled={locked}
                value={Number(values[field.name] ?? 0)}
                onChange={(e) => set(field.name, Number(e.target.value))}
              />
            )}

            {field.type === 'percent' && (
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  className="input-base pe-10"
                  disabled={locked}
                  value={Number(values[field.name] ?? 0)}
                  onChange={(e) => {
                    const v = Math.min(100, Math.max(0, Number(e.target.value)))
                    set(field.name, Number(v.toFixed(2)))
                  }}
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                  %
                </span>
              </div>
            )}

            {field.type === 'currency' && (
              <div className="flex gap-2">
                <input
                  type="number"
                  className="input-base flex-1"
                  disabled={locked}
                  value={Number(values[field.name] ?? 0)}
                  onChange={(e) => set(field.name, Number(e.target.value))}
                />
                <select
                  className="input-base w-28"
                  disabled={locked}
                  value={String(values[field.currencyCodeField || 'currencyCode'] ?? 'SAR')}
                  onChange={(e) => set(field.currencyCodeField || 'currencyCode', e.target.value)}
                >
                  {['SAR', 'USD', 'EUR', 'GBP'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {field.type === 'choice' && (
              <select
                className="input-base"
                disabled={locked}
                value={String(values[field.name] ?? '')}
                onChange={(e) => set(field.name, e.target.value)}
              >
                <option value="">{t('common.select')}</option>
                {(field.options || []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}

            {field.type === 'boolean' && (
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-brand)]"
                  disabled={locked}
                  checked={Boolean(values[field.name])}
                  onChange={(e) => set(field.name, e.target.checked)}
                />
                  {t('common.enabled')}
                </label>
            )}

            {field.type === 'date' && (
              <input
                type="date"
                className="input-base"
                disabled={locked}
                value={String(values[field.name] ?? '').slice(0, 10)}
                onChange={(e) => set(field.name, e.target.value ? `${e.target.value}T00:00:00.000Z` : '')}
              />
            )}

            {field.type === 'repeatingTable' && field.columns && (
              <RepeatingDataGrid
                columns={field.columns}
                rows={(values[field.name] as Record<string, unknown>[]) || []}
                readOnly={locked}
                onChange={(rows) => set(field.name, rows)}
                addLabel="Add requirement"
              />
            )}

            {field.type === 'evidence' && (
              <EvidenceDropzone
                files={(values[field.name] as EvidenceFile[]) || []}
                readOnly={locked}
                onChange={(files) => set(field.name, files)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
