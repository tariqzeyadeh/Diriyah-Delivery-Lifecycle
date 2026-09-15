'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/src/i18n/navigation'
import { useAuth } from '@/src/providers/AuthProvider'
import { saveObjectiveDetail, type ObjectiveDetail } from '@/src/actions/strategy'
import { cn } from '@/lib/utils'
import { OfficialTag } from '@/components/atlas/records'
import { ragTagTone, sentenceCaseLabel } from '@/lib/atlas/record-label'
import { CheckCircle2, AlertTriangle, Loader2, ArrowLeft, Save, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import {
  FormStepActions,
  FormStepRail,
  RequiredMark,
  useFormSteps,
} from '@/components/atlas/forms/FormStepper'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ragColour(rag: string | null | undefined) {
  switch (rag) {
    case 'GREEN':    return '#16a34a'
    case 'AMBER':    return '#d97706'
    case 'RED':      return '#dc2626'
    case 'NOT_RATED': return '#94a3b8'
    default:         return '#94a3b8'
  }
}

function RagBadge({ rag }: { rag: string | null | undefined }) {
  if (!rag) return <span className="text-xs text-text-muted">—</span>
  return <OfficialTag tone={ragTagTone(rag)}>{sentenceCaseLabel(rag)}</OfficialTag>
}

/** Simple SVG circular gauge — radius 40, stroke-width 8 */
function ScoreGauge({ score, rag }: { score: number | null; rag: string | null | undefined }) {
  const r = 40
  const circ = 2 * Math.PI * r
  const pct = Math.min(100, Math.max(0, score ?? 0))
  const dash = (pct / 100) * circ
  const colour = ragColour(rag)

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="104" height="104" viewBox="0 0 104 104" className="-rotate-90">
        {/* track */}
        <circle cx="52" cy="52" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        {/* fill */}
        <circle
          cx="52" cy="52" r={r}
          fill="none"
          stroke={colour}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="-mt-16 flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums text-text" style={{ color: colour }}>
          {score !== null ? Math.round(score) : '—'}
        </span>
        <span className="text-xs text-text-muted">/ 100</span>
      </div>
    </div>
  )
}

type Tab = 'details' | 'measures' | 'dependencies'
const OBJECTIVE_TABS: Tab[] = ['details', 'measures', 'dependencies']

// ─────────────────────────────────────────────────────────────────────────────
// ObjectiveDetailWorkspace
// ─────────────────────────────────────────────────────────────────────────────

export function ObjectiveDetailWorkspace({
  strategyId,
  objective,
}: {
  strategyId: string
  objective: ObjectiveDetail
}) {
  const { currentUser } = useAuth()
  const t = useTranslations('objectiveDetail')
  const tc = useTranslations('common')
  const router = useRouter()
  const steps = useFormSteps(OBJECTIVE_TABS, 'details')
  const tab = steps.currentId as Tab
  const [commentary, setCommentary] = useState(objective.performance_commentary ?? '')
  const [correctiveAction, setCorrectiveAction] = useState(objective.corrective_action_summary ?? '')
  const [forecast, setForecast] = useState(objective.forecast_outcome_status ?? '')
  const [pending, startTransition] = useTransition()
  const [saveResult, setSaveResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const commentaryRequired = forecast === 'At Risk' || forecast === 'Off Track'
  const actionRequired = forecast === 'At Risk'
  const detailsValid =
    (!commentaryRequired || commentary.trim().length > 0) &&
    (!actionRequired || correctiveAction.trim().length > 0)

  async function persist(): Promise<boolean> {
    setSaveResult(null)
    const res = await saveObjectiveDetail({
      objective_id: objective.objective_id,
      performance_commentary: commentary || null,
      corrective_action_summary: correctiveAction || null,
      forecast_outcome_status: forecast || null,
      saved_by: currentUser.email,
    })
    setSaveResult(res)
    if (res.ok) router.refresh()
    return res.ok
  }

  function handleSave() {
    startTransition(async () => {
      await persist()
    })
  }

  function handleNext() {
    if (tab === 'details' && !detailsValid) {
      setSaveResult({ ok: false, error: tc('fillRequired') })
      return
    }
    if (tab === 'details') {
      startTransition(async () => {
        const ok = await persist()
        if (ok) steps.advance()
      })
      return
    }
    steps.advance()
  }

  const perspectiveLabels: Record<string, string> = {
    FINANCIAL: 'Financial',
    CUSTOMER: 'Customer',
    INTERNAL: 'Internal Processes',
    INTERNAL_PROCESS: 'Internal Processes',
    LEARNING: 'Learning & Growth',
    LEARNING_GROWTH: 'Learning & Growth',
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'details', label: t('detailsTab') },
    { id: 'measures', label: t('measuresTab') },
    { id: 'dependencies', label: t('dependenciesTab') },
  ]

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
            G-24 · Strategic Objective
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-text">{objective.objective_name}</h1>
          {objective.bsc_perspective && (
            <p className="text-sm text-text-muted">
              {perspectiveLabels[objective.bsc_perspective] ?? objective.bsc_perspective}
              {objective.objective_priority && ` · Priority: ${objective.objective_priority}`}
              {objective.objective_weight_pct !== null && ` · Weight: ${objective.objective_weight_pct}%`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/strategy/${strategyId}`}
            className="btn btn-secondary flex h-9 items-center gap-1.5 px-4 text-sm"
          >
            <ExternalLink className="h-4 w-4" />
            View strategy
          </Link>
        </div>
      </div>

      {/* Save feedback */}
      {saveResult && (
        <div className={cn('flex items-center gap-2 text-sm rounded-lg px-4 py-2', saveResult.ok ? 'bg-diriyah-green/10 text-diriyah-green' : 'bg-diriyah-red/10 text-diriyah-red')}>
          {saveResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {saveResult.ok ? 'Saved successfully.' : (saveResult as { ok: false; error: string }).error}
        </div>
      )}

      {/* ── Main layout: left panel + right panel ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left panel */}
        <div className="space-y-4">
          {/* Tabs */}
          <FormStepRail
            steps={tabs}
            currentId={tab}
            maxReached={steps.maxReached}
            onSelect={(id) => steps.select(id)}
          />

          {/* Tab: Objective Details */}
          {tab === 'details' && (
            <div className="rounded-md border border-border bg-white p-4 space-y-6">
              {/* Read-only fields */}
              <div className="grid gap-5 sm:grid-cols-2">
                <ReadField label={t('ownerLabel')} value={objective.objective_owner_user_id ?? '—'} />
                <ReadField label={t('perspectiveLabel')} value={perspectiveLabels[objective.bsc_perspective ?? ''] ?? (objective.bsc_perspective ?? '—')} />
                <ReadField label="Priority" value={objective.objective_priority ?? '—'} />
                <ReadField label="Weight %" value={objective.objective_weight_pct !== null ? `${objective.objective_weight_pct}%` : '—'} />
                <ReadField label="Start Date" value={objective.objective_start_date ? new Date(objective.objective_start_date).toLocaleDateString() : '—'} />
                <ReadField label="End Date" value={objective.objective_end_date ? new Date(objective.objective_end_date).toLocaleDateString() : '—'} />
              </div>

              {objective.baseline_narrative && (
                <ReadTextArea label={t('baselineLabel')} value={objective.baseline_narrative} />
              )}
              {objective.intended_outcome && (
                <ReadTextArea label={t('outcomeLabel')} value={objective.intended_outcome} />
              )}

              {/* Editable fields */}
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Forecast Outcome Status
                </span>
                <select
                  className="input-base h-10 w-full text-sm"
                  value={forecast}
                  onChange={(e) => setForecast(e.target.value)}
                >
                  <option value="">— Select —</option>
                  <option value="On Track">On Track</option>
                  <option value="At Risk">At Risk</option>
                  <option value="Off Track">Off Track</option>
                  <option value="Complete">Complete</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Performance Commentary
                  {commentaryRequired && (
                    <> <RequiredMark /><span className="ml-1 text-diriyah-red">Required for Amber/Red</span></>
                  )}
                </span>
                <textarea
                  className="input-base min-h-[100px] py-2 text-sm"
                  value={commentary}
                  onChange={(e) => setCommentary(e.target.value)}
                  placeholder="Describe performance drivers or variances..."
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Corrective Action Summary
                  {actionRequired && (
                    <> <RequiredMark /><span className="ml-1 text-diriyah-red">Required for At Risk</span></>
                  )}
                </span>
                <textarea
                  className="input-base min-h-[80px] py-2 text-sm"
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  placeholder="Describe corrective actions being taken..."
                />
              </label>
            </div>
          )}

          {/* Tab: Measures (linked KPIs) */}
          {tab === 'measures' && (
            <div className="rounded-md border border-border bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-diriyah-bg-alt/80 px-5 py-3">
                <h2 className="text-sm font-semibold text-text">Linked KPIs</h2>
                <span className="rounded-full bg-diriyah-bg-secondary px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                  {objective.kpis.length} KPIs
                </span>
              </div>
              {objective.kpis.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-text-muted">
                  {t('noKpis')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                        <th className="px-5 py-3 text-start font-semibold">{t('kpiName')}</th>
                        <th className="px-4 py-3 text-start font-semibold">Unit</th>
                        <th className="px-4 py-3 text-start font-semibold">{t('kpiActual')}</th>
                        <th className="px-4 py-3 text-start font-semibold">Period</th>
                        <th className="px-4 py-3 text-start font-semibold">{t('kpiRag')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {objective.kpis.map((kpi) => (
                        <tr key={kpi.kpi_id} className="hover:bg-diriyah-bg-alt/30">
                          <td className="px-5 py-3">
                            <Link href={`/performance/kpi/${kpi.kpi_id}`} className="font-medium text-diriyah-primary hover:underline">
                              {kpi.kpi_name}
                            </Link>
                            <span className="ml-2 font-mono text-[11px] text-text-muted">{kpi.kpi_id}</span>
                          </td>
                          <td className="px-4 py-3 text-text-muted">{kpi.unit_of_measure ?? '—'}</td>
                          <td className="px-4 py-3 font-semibold tabular-nums text-text">{kpi.latest_update?.actual_value ?? '—'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-text-muted">{kpi.latest_update?.period || '—'}</td>
                          <td className="px-4 py-3">
                            <RagBadge rag={kpi.latest_update?.rag_status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab: Dependencies */}
          {tab === 'dependencies' && (
            <div className="rounded-md border border-dashed border-border bg-white p-8 text-center text-sm text-text-muted">
              Dependency mapping — coming soon.
            </div>
          )}

          <FormStepActions
            isFirst={steps.isFirst}
            isLast={steps.isLast}
            onBack={steps.goBack}
            onNext={handleNext}
            nextDisabled={tab === 'details' && !detailsValid}
            nextPending={pending}
            hideNext={steps.isLast}
          >
            {steps.isLast ? (
              <button
                type="button"
                disabled={pending}
                onClick={handleSave}
                className="btn btn-primary flex h-11 items-center gap-1.5 px-5 text-sm disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save objective
              </button>
            ) : null}
          </FormStepActions>
        </div>

        {/* Right panel: Objective Health */}
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-white p-4 space-y-5">
            <h2 className="text-sm font-semibold text-text">Objective Health</h2>

            {/* Score gauge */}
            <div className="flex justify-center py-2">
              <ScoreGauge score={objective.objective_score} rag={objective.objective_rag} />
            </div>

            {/* Component bars */}
            <div className="space-y-3">
              <ComponentBar
                label="KPI Performance"
                weight={70}
                value={objective.kpi_performance_score}
              />
              <ComponentBar
                label="Project Progress"
                weight={20}
                value={objective.physical_progress_pct}
              />
              <ComponentBar
                label="Budget Performance"
                weight={10}
                value={null}
              />
            </div>

            {/* RAG legend */}
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Current RAG</p>
              <div className="flex items-center gap-2">
                <span className={cn('h-3 w-3 rounded-full', {
                  'bg-diriyah-green': objective.objective_rag === 'GREEN',
                  'bg-diriyah-amber': objective.objective_rag === 'AMBER',
                  'bg-diriyah-red': objective.objective_rag === 'RED',
                  'bg-gray-300': !objective.objective_rag || objective.objective_rag === 'NOT_RATED',
                })} />
                <span className="text-sm font-semibold text-text">
                  {objective.objective_rag ?? 'Not Rated'}
                </span>
              </div>
            </div>
          </div>

          {/* Back to Strategy */}
          <Link
            href={`/strategy/${strategyId}`}
            className="flex items-center gap-2 rounded-md border border-border bg-white px-4 py-3 text-sm font-semibold text-text-muted shadow-sm hover:bg-diriyah-bg-alt transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('backToStrategy')}
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-sm text-text">{value}</p>
    </div>
  )
}

function ReadTextArea({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="rounded-lg bg-diriyah-bg-alt p-3 text-sm text-text whitespace-pre-wrap">{value}</p>
    </div>
  )
}

function ComponentBar({ label, weight, value }: { label: string; weight: number; value: number | null }) {
  const pct = value !== null ? Math.min(100, Math.max(0, value)) : null
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-text-muted">{label}</span>
        <span className="tabular-nums text-text-muted">{weight}% weight</span>
      </div>
      <div className="h-2 rounded-full bg-diriyah-bg-secondary overflow-hidden">
        {pct !== null ? (
          <div
            className="h-full rounded-full bg-diriyah-accent"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-full rounded-full bg-border/50" />
        )}
      </div>
      {pct !== null && (
        <p className="text-right text-xs tabular-nums text-text-muted">{Math.round(pct)}%</p>
      )}
    </div>
  )
}
