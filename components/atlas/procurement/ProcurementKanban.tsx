'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/src/i18n/navigation'
import { recordProcurementStageMove, updateActualCommitment } from '@/src/actions/gates'
import {
  PROCUREMENT_BOARD_COLUMNS,
  isPmoReadyStage,
  isValidProcurementTransition,
  normalizeProcurementStage,
  type ProcurementBoardColumn,
} from '@/lib/atlas/procurement'
import { OfficialTag, RecordNotice, DefinitionList } from '@/components/atlas/records'
import { cn } from '@/lib/utils'

export type KanbanItem = {
  procurement_item_id: string
  procurement_item_title: string
  procurement_stage: string | null
  planned_value_sar: number
  approved_budget_sar: number
  actual_commitment_sar?: number | null
  vendor_id: string | null
  /** BR-034: tracks PMO handoff state (READY | SENT | ACCEPTED | …) */
  pmo_handoff_readiness?: string | null
  /** G-20: schedule variance in days (positive = delayed) */
  schedule_variance_days?: number | null
  created_at?: string
}

const COMMITMENT_STAGES = ['AWARDED', 'CONTRACT', 'DELIVERY', 'ACCEPTANCE', 'COMPLETED']

function CommitmentValue({ item, label }: { item: KanbanItem; label: string }) {
  const t = useTranslations('procurement')
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(
    item.actual_commitment_sar != null ? String(item.actual_commitment_sar) : '',
  )
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const canEdit = COMMITMENT_STAGES.includes(item.procurement_stage ?? '')

  function save() {
    const num = parseFloat(value)
    if (isNaN(num)) {
      setErr(t('invalidSar'))
      return
    }
    start(async () => {
      setErr(null)
      const res = await updateActualCommitment({
        procurement_item_id: item.procurement_item_id,
        actual_commitment_sar: num,
      })
      if (res.ok) setEditing(false)
      else setErr(res.error)
    })
  }

  const budget = item.approved_budget_sar
  const committed = item.actual_commitment_sar ?? 0
  const pct = budget > 0 ? Math.round((committed / budget) * 100) : 0
  const isOver = budget > 0 && committed > budget
  const display = committed > 0 ? `${formatSar(committed)} (${pct}%)` : '—'

  return (
    <div className="contents">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 font-medium text-text">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-24 rounded border border-border px-1.5 py-0.5 text-xs text-text focus:border-diriyah-primary focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <button type="button" onClick={save} disabled={pending} className="text-xs font-semibold text-diriyah-green">
              {pending ? '…' : t('saveHeader')}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-text-muted">
              ✕
            </button>
          </div>
        ) : canEdit ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn('text-start font-medium hover:underline', isOver ? 'text-diriyah-red' : 'text-text')}
          >
            {display}
          </button>
        ) : (
          <span className={isOver ? 'text-diriyah-red' : undefined}>{display}</span>
        )}
        {err ? <p className="text-xs text-diriyah-red">{err}</p> : null}
      </dd>
    </div>
  )
}

function formatSar(n: number) {
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(n || 0)
}

type Props = {
  budgetSubmissionId: string
  masterTraceId: string
  initialItems: KanbanItem[]
}

function hydrateItems(rows: KanbanItem[]): KanbanItem[] {
  return rows.map((i) => ({
    ...i,
    procurement_stage: normalizeProcurementStage(i.procurement_stage),
  }))
}

export function ProcurementKanban({ budgetSubmissionId, masterTraceId, initialItems }: Props) {
  const t = useTranslations('procurement')
  const tc = useTranslations('common')
  const router = useRouter()
  const columns = PROCUREMENT_BOARD_COLUMNS.map((key) => ({
    key,
    label: t(`columns.${key}`),
  }))
  const [items, setItems] = useState(() => hydrateItems(initialItems))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      PROCUREMENT_BOARD_COLUMNS.map((key) => [key, [] as KanbanItem[]]),
    ) as Record<ProcurementBoardColumn, KanbanItem[]>
    for (const item of items) {
      map[normalizeProcurementStage(item.procurement_stage)].push(item)
    }
    for (const key of PROCUREMENT_BOARD_COLUMNS) {
      map[key].sort((a, b) => {
        const byDate = (b.created_at ?? '').localeCompare(a.created_at ?? '')
        if (byDate !== 0) return byDate
        return b.procurement_item_id.localeCompare(a.procurement_item_id)
      })
    }
    return map
  }, [items])

  function onDrop(column: ProcurementBoardColumn, droppedId?: string) {
    const id = droppedId || draggingId
    if (!id) return
    const item = items.find((i) => i.procurement_item_id === id)
    if (!item) return
    const previous = normalizeProcurementStage(item.procurement_stage)
    if (previous === column) {
      setDraggingId(null)
      return
    }

    if (!isValidProcurementTransition(previous, column)) {
      setError(t('oneColumnAtATime'))
      setDraggingId(null)
      return
    }

    setItems((rows) =>
      rows.map((r) =>
        r.procurement_item_id === id ? { ...r, procurement_stage: column } : r,
      ),
    )
    setDraggingId(null)

    startTransition(async () => {
      setError(null)
      const result = await recordProcurementStageMove({
        procurement_item_id: item.procurement_item_id,
        previous_stage: previous,
        new_stage: column,
        forecast_final_value_sar: item.planned_value_sar || item.approved_budget_sar,
      })
      if (!result.ok) {
        setItems((rows) =>
          rows.map((r) =>
            r.procurement_item_id === item.procurement_item_id
              ? { ...r, procurement_stage: previous }
              : r,
          ),
        )
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
            {t('execution')}
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-text">
            {t('kanbanTitle')}
          </h1>
          <p className="text-sm text-text-muted">{t('kanbanDesc')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-md border border-border bg-white px-4 py-3">
            <DefinitionList
              items={[
                { label: t('budgetId'), value: <span className="font-mono">{budgetSubmissionId}</span> },
                { label: tc('masterTraceability'), value: <span className="font-mono">{masterTraceId}</span> },
              ]}
            />
          </div>
        </div>
      </div>

      {error ? (
        <RecordNotice title={t('moveFailed')} tone="error" role="alert">
          {error}
        </RecordNotice>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.key}
            className="flex min-h-[420px] w-64 shrink-0 flex-col rounded-md border border-border bg-diriyah-bg-alt/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const droppedId = e.dataTransfer.getData('text/plain') || undefined
              onDrop(col.key, droppedId)
            }}
          >
            <div className="flex items-center justify-between border-b border-border bg-white px-3 py-2.5">
              <h2 className="text-sm font-semibold text-text">{col.label}</h2>
              <span className="text-xs tabular-nums text-text-muted">{grouped[col.key].length}</span>
            </div>
            <div className={cn('flex flex-1 flex-col gap-3 p-3', pending && 'opacity-80')}>
              {grouped[col.key].map((item) => (
                <article
                  key={item.procurement_item_id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', item.procurement_item_id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggingId(item.procurement_item_id)
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={cn(
                    'cursor-grab rounded-md border border-border bg-white p-3 active:cursor-grabbing',
                    draggingId === item.procurement_item_id && 'border-2 border-diriyah-accent',
                  )}
                >
                  <p className="font-mono text-[11px] text-diriyah-accent">{item.procurement_item_id}</p>
                  <p className="mt-1 text-sm font-semibold text-text">{item.procurement_item_title}</p>
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-text-muted">{t('vendor')}</dt>
                    <dd className="min-w-0 font-medium text-text">{item.vendor_id || '—'}</dd>
                    <dt className="text-text-muted">{t('planned')}</dt>
                    <dd className="min-w-0 font-medium tabular-nums text-text">
                      {formatSar(item.planned_value_sar || item.approved_budget_sar)}
                    </dd>
                    <CommitmentValue item={item} label={t('committed')} />
                  </dl>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.schedule_variance_days != null && item.schedule_variance_days > 0 ? (
                      <OfficialTag tone="danger">
                        {item.schedule_variance_days} {t('daysLate')}
                      </OfficialTag>
                    ) : null}
                    {item.pmo_handoff_readiness === 'SENT' ? (
                      <OfficialTag tone="info">{t('pmoHandoffBadge')}</OfficialTag>
                    ) : null}
                  </div>
                  {isPmoReadyStage(item.procurement_stage) ? (
                    <Link
                      href={`/pmo/${item.procurement_item_id}`}
                      className="mt-3 inline-flex text-xs font-semibold text-diriyah-primary no-underline hover:underline"
                    >
                      {t('openPmoHandoff')}
                    </Link>
                  ) : null}
                </article>
              ))}
              {grouped[col.key].length === 0 ? (
                <p className="py-8 text-center text-xs text-text-muted">{t('dropHere')}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
