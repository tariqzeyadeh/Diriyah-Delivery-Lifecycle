'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/src/i18n/navigation'
import { useAuth } from '@/src/providers/AuthProvider'
import { OfficialTag } from '@/components/atlas/records'
import { ragTagTone } from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'
import type { BscPerspectiveGroup, BscSnapshotSummary, StrategyExecutionDrivers } from '@/src/actions/kpi'
import { publishBscSnapshot } from '@/src/actions/kpi'
import type { RagStatus } from '@prisma/client'
import { CheckCircle2, AlertTriangle, Loader2, BookOpen, ChevronDown, TrendingUp } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// RAG helpers
// ─────────────────────────────────────────────────────────────────────────────

function ragDot(rag: RagStatus | string | null | undefined) {
  switch (rag) {
    case 'GREEN':  return 'bg-diriyah-green'
    case 'AMBER':  return 'bg-amber-400'
    case 'RED':    return 'bg-red-500'
    default:       return 'bg-border'
  }
}

// ragLabel is a hook-based helper — see useRagLabel below
function ragLabelStatic(rag: RagStatus | string | null | undefined, t: (k: string) => string) {
  switch (rag) {
    case 'GREEN':  return t('onTrack')
    case 'AMBER':  return t('atRisk')
    case 'RED':    return t('offTrack')
    default:       return t('noData')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Perspective icon mapping
// ─────────────────────────────────────────────────────────────────────────────

const PERSPECTIVE_META: Record<string, { emoji: string; color: string }> = {
  FINANCIAL:        { emoji: '💰', color: 'from-emerald-50 to-white border-emerald-200' },
  CUSTOMER:         { emoji: '🤝', color: 'from-sky-50 to-white border-sky-200' },
  INTERNAL_PROCESS: { emoji: '⚙️',  color: 'from-violet-50 to-white border-violet-200' },
  LEARNING_GROWTH:  { emoji: '🌱', color: 'from-amber-50 to-white border-amber-200' },
  UNASSIGNED:       { emoji: '📋', color: 'from-gray-50 to-white border-border' },
}

function perspectiveLabelI18n(p: string, t: (k: string) => string): string {
  switch (p) {
    case 'FINANCIAL':        return t('perspectiveFinancial')
    case 'CUSTOMER':         return t('perspectiveCustomer')
    case 'INTERNAL_PROCESS': return t('perspectiveInternal')
    case 'LEARNING_GROWTH':  return t('perspectiveLearning')
    default:                 return p.replace(/_/g, ' ')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BalancedScorecardPanel
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  perspectives: BscPerspectiveGroup[]
  snapshot?: BscSnapshotSummary | null
  executionDrivers?: StrategyExecutionDrivers | null
}

export function BalancedScorecardPanel({ perspectives, snapshot, executionDrivers }: Props) {
  const t = useTranslations('performance')
  const tb = useTranslations('bsc')
  const { currentUser } = useAuth()
  const router = useRouter()

  const [activePerspective, setActivePerspective] = useState<string | null>(
    perspectives[0]?.perspective ?? null,
  )

  // Publish modal state
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishing, startPublish] = useTransition()
  const [publishResult, setPublishResult] = useState<{ ok: boolean; error?: string } | null>(null)

  // Period picker state: last 6 months
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    if (snapshot?.reporting_period) return snapshot.reporting_period
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [showPeriodPicker, setShowPeriodPicker] = useState(false)

  // Build last 6 months list
  const recentPeriods: string[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  function handlePublish() {
    startPublish(async () => {
      setPublishResult(null)
      const res = await publishBscSnapshot(
        snapshot?.scorecard_id ?? '',
        selectedPeriod,
        currentUser.email,
      )
      setPublishResult({ ok: res.ok, error: !res.ok ? (res as { ok: false; error: string }).error : undefined })
      if (res.ok) {
        setShowPublishModal(false)
        router.refresh()
      }
    })
  }

  if (perspectives.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-12 text-center">
        <p className="text-sm text-text-muted">{t('bscEmptyHint')}</p>
      </div>
    )
  }

  const active = perspectives.find((p) => p.perspective === activePerspective) ?? perspectives[0]

  const isPublished = snapshot?.is_published

  return (
    <div className="space-y-5">
      {/* ── Period + Publish toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Period selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPeriodPicker((v) => !v)}
            className="flex items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text shadow-sm hover:bg-diriyah-bg-alt"
          >
            <span>{tb('periodPicker')}: {selectedPeriod}</span>
            <ChevronDown className="h-4 w-4 text-text-muted" />
          </button>
          {showPeriodPicker && (
            <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-md border border-border bg-white shadow-lg overflow-hidden">
              {recentPeriods.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setSelectedPeriod(p); setShowPeriodPicker(false) }}
                  className={cn(
                    'w-full px-4 py-2.5 text-start text-sm hover:bg-diriyah-bg-alt',
                    p === selectedPeriod ? 'font-bold text-diriyah-primary' : 'text-text',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Publish button */}
        <div className="flex items-center gap-2">
          {isPublished && (
            <span className="flex items-center gap-1.5 rounded-full bg-diriyah-green/10 px-3 py-1 text-xs font-semibold text-diriyah-green">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Published
            </span>
          )}
          <button
            type="button"
            disabled={publishing}
            onClick={() => setShowPublishModal(true)}
            className="flex items-center gap-2 rounded-md bg-diriyah-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
            {tb('publishBtn')} {selectedPeriod}
          </button>
        </div>
      </div>

      {/* Publish result feedback */}
      {publishResult && !publishResult.ok && (
        <div className="flex items-center gap-2 rounded-lg bg-diriyah-red/10 px-4 py-2 text-sm text-diriyah-red">
          <AlertTriangle className="h-4 w-4" />
          {publishResult.error}
        </div>
      )}
      {/* Perspective tabs */}
      <div className="flex flex-wrap gap-2">
        {perspectives.map((p) => {
          const meta = PERSPECTIVE_META[p.perspective] ?? PERSPECTIVE_META.UNASSIGNED
          const isActive = p.perspective === activePerspective
          return (
            <button
              key={p.perspective}
              type="button"
              onClick={() => setActivePerspective(p.perspective)}
              className={cn(
                'flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold transition-all',
                isActive
                  ? 'border-diriyah-primary bg-diriyah-primary text-white shadow'
                  : 'border-border bg-white text-text hover:bg-diriyah-bg-alt',
              )}
            >
              <span>{meta.emoji}</span>
              <span>{perspectiveLabelI18n(p.perspective, t)}</span>
              {p.perspectiveRag && (
                <span className={cn('h-2 w-2 rounded-full', ragDot(p.perspectiveRag))} />
              )}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0 text-[11px] font-bold',
                  isActive ? 'bg-white/20 text-white' : 'bg-diriyah-bg-alt text-text-muted',
                )}
              >
                {p.objectives.length}
              </span>
            </button>
          )
        })}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {perspectives.map((p) => {
          const meta = PERSPECTIVE_META[p.perspective] ?? PERSPECTIVE_META.UNASSIGNED
          const kpiCount = p.objectives.flatMap((o) => o.kpis).length
          return (
            <button
              key={p.perspective}
              type="button"
              onClick={() => setActivePerspective(p.perspective)}
              className={cn(
                'rounded-md border bg-gradient-to-b p-4 text-start',
                meta.color,
                p.perspective === activePerspective && 'ring-2 ring-diriyah-primary/40',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">{meta.emoji}</span>
                {p.perspectiveRag && (
                  <OfficialTag tone={ragTagTone(p.perspectiveRag)}>
                    {ragLabelStatic(p.perspectiveRag, t)}
                  </OfficialTag>
                )}
              </div>
              <p className="mt-2 text-sm font-semibold text-text">
                {perspectiveLabelI18n(p.perspective, t)}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {t('objectives', { count: p.objectives.length })} · {t('kpis', { count: kpiCount })}
              </p>
            </button>
          )
        })}
      </div>

      {/* Active perspective detail */}
      {active && <PerspectiveDetail group={active} t={t} />}

      {/* ── Strategy Execution Drivers panel ── */}
      {executionDrivers && (
        <div className="rounded-md border border-border bg-white p-4">
          <div className="flex items-center gap-2 border-b border-border pb-3 mb-4">
            <TrendingUp className="h-4 w-4 text-diriyah-accent" />
            <h2 className="text-sm font-semibold text-text">{tb('executionDrivers')}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DriverStat
              label="Projects On Track"
              value={String(executionDrivers.projectsOnTrack)}
              colour="text-diriyah-green"
            />
            <DriverStat
              label="Procurement Delayed"
              value={String(executionDrivers.procurementDelayed)}
              colour={executionDrivers.procurementDelayed > 0 ? 'text-diriyah-red' : 'text-text'}
            />
            <DriverStat
              label="Budget Committed"
              value={executionDrivers.budgetCommittedPct !== null ? `${executionDrivers.budgetCommittedPct}%` : '—'}
              colour="text-text"
            />
            <DriverStat
              label="Benefits Forecast"
              value={executionDrivers.benefitsForecast}
              colour="text-diriyah-green"
            />
          </div>
        </div>
      )}

      {/* ── Publish Confirm Modal ── */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-md border border-border bg-white p-6 shadow-xl mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <BookOpen className="h-6 w-6 text-diriyah-primary" />
              <h2 className="text-lg font-semibold text-text">Publish Scorecard</h2>
            </div>
            <p className="text-sm text-text-muted">
              Publish <strong>{selectedPeriod}</strong> scorecard? This will mark the snapshot as
              <strong> Published</strong> and make it visible on the executive one-pager.
            </p>
            {publishResult && !publishResult.ok && (
              <div className="flex items-center gap-2 rounded-lg bg-diriyah-red/10 px-3 py-2 text-sm text-diriyah-red">
                <AlertTriangle className="h-4 w-4" />
                {publishResult.error}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowPublishModal(false); setPublishResult(null) }}
                className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text hover:bg-diriyah-bg-alt"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={publishing}
                onClick={handlePublish}
                className="flex items-center gap-2 rounded-md bg-diriyah-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PerspectiveDetail
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TFn = (key: string, values?: Record<string, any>) => string

function PerspectiveDetail({ group, t }: { group: BscPerspectiveGroup; t: TFn }) {
  const meta = PERSPECTIVE_META[group.perspective] ?? PERSPECTIVE_META.UNASSIGNED
  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border bg-gradient-to-b shadow-sm',
        meta.color,
      )}
    >
      <div className="flex items-center gap-3 border-b border-border/60 bg-white/60 px-5 py-4">
        <span className="text-2xl">{meta.emoji}</span>
        <div>
          <h3 className="text-base font-semibold text-text">
            {perspectiveLabelI18n(group.perspective, t)}
          </h3>
          <p className="text-xs text-text-muted">
            {t('objectives', { count: group.objectives.length })}
            {group.perspectiveRag && (
              <OfficialTag tone={ragTagTone(group.perspectiveRag)}>
                {ragLabelStatic(group.perspectiveRag, t)}
              </OfficialTag>
            )}
          </p>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {group.objectives.map((obj) => (
          <ObjectiveRow key={obj.objective_id} objective={obj} t={t} />
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ObjectiveRow
// ─────────────────────────────────────────────────────────────────────────────

function ObjectiveRow({
  objective,
  t,
}: {
  objective: BscPerspectiveGroup['objectives'][0]
  t: TFn
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white/70">
      {/* Objective header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-start hover:bg-white/80"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {objective.objective_rag && (
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  ragDot(objective.objective_rag),
                )}
              />
            )}
            <span className="font-semibold text-text">{objective.objective_name}</span>
            {objective.objective_weight_pct !== null && (
              <span className="rounded-md bg-diriyah-bg-alt px-2 py-0.5 text-[11px] font-semibold text-text-muted">
                {t('objectiveWeight', { pct: objective.objective_weight_pct })}
              </span>
            )}
          </div>
          {objective.objective_description && (
            <p className="mt-0.5 line-clamp-1 text-sm text-text-muted">
              {objective.objective_description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-text-muted">
          <span className="text-xs">{t('kpis', { count: objective.kpis.length })}</span>
          <span className="text-lg leading-none">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* KPI rows */}
      {expanded && objective.kpis.length > 0 && (
        <div className="border-t border-border/40 bg-white px-5 pb-4 pt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                  <th className="pb-2 text-start font-semibold">KPI</th>
                  <th className="pb-2 text-start font-semibold">{t('kpiUnit')}</th>
                  <th className="pb-2 text-start font-semibold">{t('kpiActual')}</th>
                  <th className="pb-2 text-start font-semibold">{t('kpiPeriod')}</th>
                  <th className="pb-2 text-start font-semibold">{t('kpiStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {objective.kpis.map((kpi) => (
                  <tr key={kpi.kpi_id}>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-text">{kpi.kpi_name}</span>
                      <span className="ml-2 font-mono text-[11px] text-text-muted">{kpi.kpi_id}</span>
                    </td>
                    <td className="py-2 pr-4 text-text-muted">{kpi.unit_of_measure ?? '—'}</td>
                    <td className="py-2 pr-4 tabular-nums font-semibold text-text">
                      {kpi.actual_value ?? '—'}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-text-muted">
                      {kpi.reporting_period || '—'}
                    </td>
                    <td className="py-2">
                      <OfficialTag tone={ragTagTone(kpi.rag_status)}>
                        {ragLabelStatic(kpi.rag_status, t)}
                      </OfficialTag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expanded && objective.kpis.length === 0 && (
        <div className="border-t border-border/40 bg-white px-5 py-3 text-sm text-text-muted">
          {t('noKpisLinked')}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DriverStat — tiny stat card for execution drivers
// ─────────────────────────────────────────────────────────────────────────────

function DriverStat({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div className="rounded-md border border-border bg-diriyah-bg-alt/50 p-3 space-y-1">
      <p className="text-xs text-text-muted leading-tight">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums', colour ?? 'text-text')}>{value}</p>
    </div>
  )
}
