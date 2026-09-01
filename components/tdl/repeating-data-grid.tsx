'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n/use-i18n'

export interface DataGridColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'choice'
  options?: string[]
  width?: string
}

export function RepeatingDataGrid({
  columns,
  rows,
  readOnly,
  onChange,
  addLabel = 'Add row',
}: {
  columns: DataGridColumn[]
  rows: Record<string, unknown>[]
  readOnly?: boolean
  onChange: (rows: Record<string, unknown>[]) => void
  addLabel?: string
}) {
  const { t } = useI18n()
  const resolvedAddLabel = addLabel === 'Add row' ? t('common.addRow') : addLabel === 'Add requirement' ? t('common.addRequirement') : addLabel
  const updateCell = (index: number, key: string, value: unknown) => {
    const next = rows.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    onChange(next)
  }

  const addRow = () => {
    const blank: Record<string, unknown> = { id: `row-${Date.now()}` }
    columns.forEach((c) => {
      if (c.key !== 'id') blank[c.key] = c.type === 'number' ? 0 : ''
    })
    onChange([...rows, blank])
  }

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index))
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
              {columns.map((c) => (
                <th key={c.key} className="border-b border-border px-3 py-2" style={{ width: c.width }}>
                  {c.label}
                </th>
              ))}
              {!readOnly && <th className="w-12 border-b border-border px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (readOnly ? 0 : 1)}
                  className="px-3 py-6 text-center text-text-muted"
                >
                  {t('common.noRows')}
                </td>
              </tr>
            )}
            {rows.map((row, ri) => (
              <tr key={String(row.id ?? ri)} className="border-b border-border last:border-b-0">
                {columns.map((c) => (
                  <td key={c.key} className="px-2 py-1.5">
                    {readOnly ? (
                      <span className="px-1 text-text">{String(row[c.key] ?? '')}</span>
                    ) : c.type === 'choice' ? (
                      <select
                        className="input-base h-9 w-full text-sm"
                        value={String(row[c.key] ?? '')}
                        onChange={(e) => updateCell(ri, c.key, e.target.value)}
                      >
                        <option value="">{t('common.select')}</option>
                        {(c.options || []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input-base h-9 w-full text-sm"
                        type={c.type === 'number' ? 'number' : 'text'}
                        value={String(row[c.key] ?? '')}
                        onChange={(e) =>
                          updateCell(
                            ri,
                            c.key,
                            c.type === 'number' ? Number(e.target.value) : e.target.value,
                          )
                        }
                      />
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td className="px-2">
                    <button
                      type="button"
                      onClick={() => removeRow(ri)}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50"
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="border-t border-border bg-surface px-3 py-2">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/10"
          >
            <Plus className="h-4 w-4" />
            {resolvedAddLabel}
          </button>
        </div>
      )}
    </div>
  )
}
