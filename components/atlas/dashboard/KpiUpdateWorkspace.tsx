'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/src/i18n/navigation'
import { useAuth } from '@/src/providers/AuthProvider'
import { saveKpiUpdate, type KpiDefinitionDetail, type KpiUpdateHistoryEntry } from '@/src/actions/kpi'
import { OfficialTag } from '@/components/atlas/records'
import { ragTagTone, sentenceCaseLabel } from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'
import {
  CheckCircle2, AlertTriangle, Loader2, Send, FileText,
  RotateCcw, Clock, TrendingUp,
} from 'lucide-react'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ragColour(rag: string | null | undefined): string {
  switch (rag) {
    case 'GREEN': return '#16a34a'
    case 'AMBER': return '#d97706'
    case 'RED':   return '#dc2626'
    default:      return '#94a3b8'
  }
}

function RagBadge({ rag }: { rag: string | null | undefined }) {
  if (!rag) return <span className="text-xs text-text-muted">—</span>
  return <OfficialTag tone={ragTagTone(rag)}>{sentenceCaseLabel(rag)}</OfficialTag>
}

/** Small metric card used in header row */
function MetricCard({ label, value, sub, colour }: { label: string; value: string; sub?: string; colour?: string }) {
  return (
    <div className="min-w-[130px] rounded-md border border-border bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-text" style={colour ? { color: colour } : undefined}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
    </div>
  )
}

/** SVG sparkline: plots actuals + dotted target line */
function Sparkline({
  history,
  currentTarget,
  width = 260,
  height = 56,
}: {
  history: KpiUpdateHistoryEntry[]
  currentTarget: number | null
  width?: number
  height?: number
}) {
  // Reverse so oldest → newest left → right
  const pts = [...history].reverse()
  if (pts.length < 2) {
    return (
      <div className="flex h-14 items-center justify-center text-xs text-text-muted">
        Not enough data for sparkline.
      </div>
    )
  }

  const values = pts.map((p) => parseFloat(p.actual_value ?? '0') || 0)
  const targets = pts.map((p) => p.period_target ?? currentTarget ?? null)

  const allVals = [...values, ...targets.filter((t): t is number => t !== null)]
  const minV = Math.min(...allVals)
  const maxV = Math.max(...allVals)
  const range = maxV - minV || 1

  const pad = 4
  function xOf(i: number) {
    return pad + (i / (pts.length - 1)) * (width - pad * 2)
  }
  function yOf(v: number) {
    return pad + (1 - (v - minV) / range) * (height - pad * 2)
  }

  const actualPath = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`)
    .join(' ')

  const targetPath = targets.some((t) => t !== null)
    ? targets
        .map((t, i) => {
          const v = t ?? values[i]
          return `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`
        })
        .join(' ')
    : null

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Target dotted line */}
      {targetPath && (
        <path d={targetPath} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
      )}
      {/* Actual line */}
      <path d={actualPath} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Latest dot */}
      <circle cx={xOf(pts.length - 1)} cy={yOf(values[values.length - 1])} r="3" fill="#2563eb" />
    </svg>
  )
}

/** Circular RAG ring */
function RagRing({ rag }: { rag: string | null | undefined }) {
  const colour = ragColour(rag)
  const label = rag === 'GREEN' ? 'On Track' : rag === 'AMBER' ? 'At Risk' : rag === 'RED' ? 'Off Track' : 'No Data'
  const r = 34
  const circ = 2 * Math.PI * r
  const pct = rag === 'GREEN' ? 100 : rag === 'AMBER' ? 60 : rag === 'RED' ? 20 : 50
  const dash = (pct / 100) * circ

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={colour} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <p className="-mt-14 text-sm font-bold" style={{ color: colour }}>{label}</p>
    </div>
  )
}

type Tab = 'update' | 'evidence' | 'corrective-actions' | 'history'

// ─────────────────────────────────────────────────────────────────────────────
// KpiUpdateWorkspace
// ─────────────────────────────────────────────────────────────────────────────

export function KpiUpdateWorkspace({
  kpi,
  history,
  activePeriod,
}: {
  kpi: KpiDefinitionDetail
  history: KpiUpdateHistoryEntry[]
  activePeriod: string
}) {
  const t = useTranslations('kpiUpdate')
  const { currentUser } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('update')

  // Find existing update for this period
  const existing = history.find((u) => u.period === activePeriod)

  const [period, setPeriod] = useState(activePeriod)
  const [actual, setActual] = useState(existing?.actual_value ?? '')
  const [dqStatus, setDqStatus] = useState(existing?.data_quality_status ?? '')
  const [commentary, setCommentary] = useState(existing?.performance_commentary ?? '')
  const [forecastVal, setForecastVal] = useState(existing?.forecast_value ?? '')
  const [forecastStatus, setForecastStatus] = useState(existing?.forecast_target_status ?? '')
  const [pendingSave, startTransition] = useTransition()
  const [saveResult, setSaveResult] = useState<{ ok: boolean; rag?: string | null; error?: string } | null>(null)

  const currentTarget = existing?.period_target ?? null
  const currentRag = existing?.rag_status ?? existing?.kpi_rag ?? null

  // Compute variance
  const variance = actual && currentTarget
    ? (parseFloat(actual) - currentTarget).toFixed(2)
    : null

  function handleSave(isDraft = false) {
    if (!actual.trim() || !period.trim()) return
    startTransition(async () => {
      setSaveResult(null)
      const res = await saveKpiUpdate({
        kpi_id: kpi.kpi_id,
        reporting_period: period,
        actual_value: parseFloat(actual),
        performance_commentary: commentary || undefined,
        submitted_by: currentUser.email,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSaveResult({ ok: res.ok, rag: (res as any).rag_status, error: (res as any).error })
      if (res.ok && !isDraft) router.refresh()
    })
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'update', label: 'Performance Update' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'corrective-actions', label: 'Corrective Actions' },
    { id: 'history', label: 'History' },
  ]

  // Readiness checklist
  const readiness = [
    { label: t('checkActualEntered'), done: !!actual.trim() },
    { label: 'Evidence attached', done: !!existing?.evidence_attachment_id },
    { label: t('checkCommentary'), done: !!commentary.trim() },
    { label: 'Owner attestation', done: existing?.validation_decision === 'VALIDATED' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Page header + metric cards ── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
              G-26 · KPI Performance Update
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-text">{kpi.kpi_name}</h1>
            <p className="text-sm text-text-muted">Period: <strong>{period}</strong></p>
          </div>
          <Link href={`/performance/kpi/${kpi.kpi_id}`} className="btn btn-secondary h-9 px-4 text-sm">
            ← KPI Definition
          </Link>
        </div>

        {/* Metric card row */}
        <div className="flex flex-wrap gap-3">
          <MetricCard label="Target" value={currentTarget !== null ? String(currentTarget) : '—'} sub={kpi.unit_of_measure ?? undefined} />
          <MetricCard
            label="Actual"
            value={actual || '—'}
            sub={kpi.unit_of_measure ?? undefined}
            colour={actual ? ragColour(currentRag) : undefined}
          />
          <MetricCard
            label="Variance"
            value={variance !== null ? (parseFloat(variance) >= 0 ? `+${variance}` : variance) : '—'}
            colour={variance !== null ? (parseFloat(variance) >= 0 ? '#16a34a' : '#dc2626') : undefined}
          />
          <MetricCard label="Forecast" value={forecastStatus || '—'} sub={forecastVal || undefined} />
        </div>
      </div>

      {/* ── Layout ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        {/* Left */}
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-4 border-b border-border">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex-1 border-b-2 px-3 py-2 text-xs font-semibold transition-all',
                  tab === t.id
                    ? 'border-diriyah-primary text-diriyah-primary'
                    : 'border-transparent text-text-muted hover:text-text',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Performance Update */}
          {tab === 'update' && (
            <div className="rounded-md border border-border bg-white p-4 space-y-5">
              {/* Save feedback */}
              {saveResult && (
                <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', saveResult.ok ? 'bg-diriyah-green/10 text-diriyah-green' : 'bg-diriyah-red/10 text-diriyah-red')}>
                  {saveResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {saveResult.ok ? `Saved. RAG: ${saveResult.rag ?? 'computing…'}` : saveResult.error}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('period')}</span>
                  <input type="month" className="input-base h-10 w-full font-mono text-sm" value={period} onChange={(e) => setPeriod(e.target.value)} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('actualValue')}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.01" className="input-base h-10 w-full tabular-nums text-sm" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Enter value" />
                    {kpi.unit_of_measure && <span className="whitespace-nowrap text-sm text-text-muted">{kpi.unit_of_measure}</span>}
                  </div>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Data Quality</span>
                  <select className="input-base h-10 w-full text-sm" value={dqStatus} onChange={(e) => setDqStatus(e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="Verified">Verified</option>
                    <option value="Unverified">Unverified</option>
                  </select>
                </label>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Auto RAG Status</span>
                    <div className="flex h-10 items-center">
                      <RagBadge rag={saveResult?.ok ? saveResult.rag : currentRag} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <div className="rounded-md border border-border bg-diriyah-bg-alt/50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  12-Month Actuals vs Target
                </p>
                <Sparkline history={history} currentTarget={currentTarget} />
                <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 bg-blue-500 rounded" />Actual</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-gray-400" />Target</span>
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('commentary')}</span>
                <textarea className="input-base min-h-[80px] w-full py-2 text-sm" value={commentary} onChange={(e) => setCommentary(e.target.value)} placeholder={t('commentaryPlaceholder')} />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Forecast Value</span>
                  <input type="number" step="0.01" className="input-base h-10 w-full tabular-nums text-sm" value={forecastVal} onChange={(e) => setForecastVal(e.target.value)} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Forecast Rationale / Status</span>
                  <select className="input-base h-10 w-full text-sm" value={forecastStatus} onChange={(e) => setForecastStatus(e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="On Track">On Track</option>
                    <option value="At Risk">At Risk</option>
                    <option value="Off Track">Off Track</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
                <button type="button" disabled={!actual.trim() || pendingSave} onClick={() => handleSave(true)}
                  className="btn btn-secondary h-10 px-4 text-sm disabled:opacity-50 flex items-center gap-1.5">
                  {pendingSave ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Save draft
                </button>
                <button type="button" disabled={!actual.trim() || pendingSave} onClick={() => handleSave(false)}
                  className="btn btn-primary h-10 px-4 text-sm disabled:opacity-50 flex items-center gap-1.5">
                  {pendingSave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {pendingSave ? t('saving') : t('saveUpdate')}
                </button>
              </div>
            </div>
          )}

          {/* Tab: Evidence */}
          {tab === 'evidence' && (
            <div className="rounded-md border border-dashed border-border bg-white p-8 text-center space-y-2">
              <FileText className="mx-auto h-8 w-8 text-text-muted" />
              <p className="text-sm font-semibold text-text">Evidence Attachments</p>
              <p className="text-sm text-text-muted">Upload supporting evidence for this KPI update.</p>
              <p className="text-xs text-text-muted">Evidence upload — coming in next release.</p>
              {existing?.evidence_attachment_id && (
                <p className="text-xs font-mono text-diriyah-primary">
                  Attached: {existing.evidence_attachment_id}
                </p>
              )}
            </div>
          )}

          {/* Tab: Corrective Actions */}
          {tab === 'corrective-actions' && (
            <div className="rounded-md border border-border bg-white overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border bg-diriyah-bg-alt/80 px-5 py-3">
                <RotateCcw className="h-4 w-4 text-diriyah-accent" />
                <h2 className="text-sm font-semibold text-text">Corrective Actions</h2>
              </div>
              {history.some((u) => u.corrective_action) ? (
                <div className="divide-y divide-border/50">
                  {history
                    .filter((u) => u.corrective_action)
                    .map((u) => {
                      const overdue = u.action_due_date && new Date(u.action_due_date) < new Date()
                      return (
                        <div key={u.kpi_update_id} className="px-5 py-4 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-text-muted">{u.period}</span>
                            {overdue && (
                              <span className="flex items-center gap-1 text-xs font-semibold text-diriyah-red">
                                <Clock className="h-3 w-3" /> Overdue
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-text">{u.corrective_action}</p>
                          {u.action_owner_user_id && (
                            <p className="text-xs text-text-muted">Owner: {u.action_owner_user_id}</p>
                          )}
                          {u.action_due_date && (
                            <p className="text-xs text-text-muted">Due: {new Date(u.action_due_date).toLocaleDateString()}</p>
                          )}
                        </div>
                      )
                    })}
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-sm text-text-muted">No corrective actions recorded.</div>
              )}
            </div>
          )}

          {/* Tab: History */}
          {tab === 'history' && (
            <div className="rounded-md border border-border bg-white overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border bg-diriyah-bg-alt/80 px-5 py-3">
                <TrendingUp className="h-4 w-4 text-diriyah-accent" />
                <h2 className="text-sm font-semibold text-text">Update History</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-5 py-3 text-start font-semibold">Period</th>
                      <th className="px-4 py-3 text-start font-semibold">Actual</th>
                      <th className="px-4 py-3 text-start font-semibold">Target</th>
                      <th className="px-4 py-3 text-start font-semibold">RAG</th>
                      <th className="px-4 py-3 text-start font-semibold">DQ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {history.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-6 text-center text-text-muted">No history available.</td></tr>
                    ) : history.map((u) => (
                      <tr key={u.kpi_update_id} className={cn('hover:bg-diriyah-bg-alt/30', u.period === period && 'bg-diriyah-bg-alt')}>
                        <td className="px-5 py-3 font-mono text-xs">{u.period}</td>
                        <td className="px-4 py-3 font-semibold tabular-nums">{u.actual_value ?? '—'}</td>
                        <td className="px-4 py-3 tabular-nums text-text-muted">{u.period_target ?? '—'}</td>
                        <td className="px-4 py-3"><RagBadge rag={u.rag_status ?? u.kpi_rag} /></td>
                        <td className="px-4 py-3 text-xs text-text-muted">{u.data_quality_status ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* RAG ring */}
          <div className="rounded-md border border-border bg-white p-4 flex justify-center">
            <RagRing rag={saveResult?.ok ? saveResult.rag : currentRag} />
          </div>

          {/* Update Readiness */}
          <div className="rounded-md border border-border bg-white p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Update Readiness</h3>
            {readiness.map(({ label, done }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={cn('h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0', done ? 'bg-diriyah-green text-white' : 'bg-border text-text-muted')}>
                  {done ? '✓' : '○'}
                </span>
                <span className={cn('text-sm', done ? 'text-text' : 'text-text-muted')}>{label}</span>
              </div>
            ))}
          </div>

          {/* KPI info */}
          <div className="rounded-md border border-border bg-white p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Thresholds</h3>
            {kpi.green_threshold && (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-diriyah-green" />
                <span className="text-sm text-text">Green ≥ <strong>{kpi.green_threshold}</strong></span>
              </div>
            )}
            {kpi.amber_threshold && (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-diriyah-amber" />
                <span className="text-sm text-text">Amber ≥ <strong>{kpi.amber_threshold}</strong></span>
              </div>
            )}
            {kpi.red_threshold && (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-diriyah-red" />
                <span className="text-sm text-text">Red &lt; <strong>{kpi.red_threshold}</strong></span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
