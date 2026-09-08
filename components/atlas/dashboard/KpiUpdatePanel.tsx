'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle2, AlertTriangle, Loader2, TrendingUp, ShieldCheck, ShieldX } from 'lucide-react'
import { useAuth } from '@/src/providers/AuthProvider'
import { useRouter } from '@/src/i18n/navigation'
import { saveKpiUpdate, validateKpiUpdate, type KpiWithDefinition } from '@/src/actions/kpi'
import { OfficialTag } from '@/components/atlas/records'
import { ragTagTone, sentenceCaseLabel } from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'
import type { RagStatus } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function RagBadge({ rag }: { rag: RagStatus | null | undefined }) {
  if (rag === null || rag === undefined) return <span className="text-xs text-text-muted">—</span>
  return <OfficialTag tone={ragTagTone(rag)}>{sentenceCaseLabel(rag)}</OfficialTag>
}

// ─────────────────────────────────────────────────────────────────────────────
// ValidationDecisionBadge (KPU-029)
// ─────────────────────────────────────────────────────────────────────────────

function ValidationDecisionBadge({ decision }: { decision: string | null | undefined }) {
  const t = useTranslations('kpiDashboard')
  if (!decision) return null
  const labelMap: Record<string, string> = {
    PENDING:   t('pendingBadge'),
    VALIDATED: t('validatedBadge'),
    RETURNED:  'Returned',
  }
  const toneMap: Record<string, 'warning' | 'success' | 'danger'> = {
    PENDING:   'warning',
    VALIDATED: 'success',
    RETURNED:  'danger',
  }
  return (
    <OfficialTag tone={toneMap[decision] ?? 'neutral'}>
      {labelMap[decision] ?? sentenceCaseLabel(decision)}
    </OfficialTag>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiUpdateRow
// ─────────────────────────────────────────────────────────────────────────────

function KpiUpdateRow({
  kpi,
  period,
  actorId,
  isValidator,
  onSaved,
}: {
  kpi: KpiWithDefinition
  period: string
  actorId: string
  /** True when current user is a Data Governance / Strategy & Governance validator */
  isValidator: boolean
  onSaved: () => void
}) {
  const t = useTranslations('kpiDashboard')
  const [actual, setActual] = useState<string>(
    kpi.latest_update?.actual_value !== null && kpi.latest_update?.actual_value !== undefined ? kpi.latest_update.actual_value : '',
  )
  const [narrative, setNarrative] = useState<string>(
    kpi.latest_update?.performance_commentary ?? '',
  )
  const [pending, startTransition] = useTransition()
  const [validatePending, startValidateTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; rag?: RagStatus | null | undefined } | null>(null)
  const [validateResult, setValidateResult] = useState<{ ok: boolean; decision?: string } | null>(null)
  const [expanded, setExpanded] = useState(false)

  function handleSave() {
    if (!actual.trim()) return
    startTransition(async () => {
      setResult(null)
      const res = await saveKpiUpdate({
        kpi_id: kpi.kpi_id,
        reporting_period: period,
        actual_value: parseFloat(actual),
        performance_commentary: narrative || undefined,
        submitted_by: actorId,
      })
      if (res.ok) {
        setResult({ ok: true, rag: res.rag_status ?? undefined })
        onSaved()
      } else {
        setResult({ ok: false })
      }
    })
  }

  function handleValidate(decision: 'VALIDATED' | 'RETURNED') {
    const kpiUpdateId = kpi.latest_update?.kpi_update_id
    if (!kpiUpdateId) return
    startValidateTransition(async () => {
      setValidateResult(null)
      const res = await validateKpiUpdate({
        kpi_update_id: kpiUpdateId,
        decision,
        validated_by: actorId,
      })
      if (res.ok) {
        setValidateResult({ ok: true, decision })
        onSaved()
      } else {
        setValidateResult({ ok: false })
      }
    })
  }

  const displayRag = result?.rag ?? kpi.latest_update?.rag_status
  const validationDecision = kpi.latest_update?.validation_decision
  const isPending = validationDecision === 'PENDING'
  const hasUpdate = !!kpi.latest_update?.kpi_update_id

  return (
    <div className="border-b border-border/80 last:border-0">
      <div
        className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3 hover:bg-diriyah-bg-alt/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{kpi.kpi_name}</p>
          {kpi.unit_of_measure && (
            <p className="text-xs text-text-muted">{kpi.unit_of_measure}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {kpi.latest_update?.reporting_period && (
            <span className="text-xs text-text-muted">{kpi.latest_update.reporting_period}</span>
          )}
          {kpi.latest_update?.actual_value !== null && kpi.latest_update?.actual_value !== undefined && kpi.latest_update.actual_value !== '' && (
            <span className="text-sm font-semibold tabular-nums text-text">
              {kpi.latest_update.actual_value} {kpi.unit_of_measure ?? ''}
            </span>
          )}
          {/* KPU-029: Show validation decision badge */}
          <ValidationDecisionBadge decision={validationDecision} />
          <RagBadge rag={displayRag} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 bg-diriyah-bg-alt/30 px-5 py-4">
          {kpi.kpi_definition && (
            <p className="mb-4 text-xs text-text-muted">{kpi.kpi_definition}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-xs">
                {kpi.baseline_value !== null && kpi.baseline_value !== undefined && (
                  <span className="rounded bg-diriyah-bg-secondary px-2 py-0.5">
                    Baseline: <strong>{kpi.baseline_value}</strong>
                  </span>
                )}
                {kpi.green_threshold && (
                  <span className="rounded bg-diriyah-green/10 px-2 py-0.5 text-diriyah-green">
                    Green ≥ {kpi.green_threshold}
                  </span>
                )}
                {kpi.amber_threshold && (
                  <span className="rounded bg-diriyah-amber/10 px-2 py-0.5 text-diriyah-amber">
                    Amber ≥ {kpi.amber_threshold}
                  </span>
                )}
                {kpi.latest_update?.achievement_pct !== null &&
                  kpi.latest_update?.achievement_pct !== undefined && (
                  <span className="rounded bg-diriyah-bg-secondary px-2 py-0.5">
                    Achievement: <strong>{kpi.latest_update.achievement_pct.toFixed(1)}%</strong>
                  </span>
                )}
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Actual Value — {period}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="input-base h-10 w-36 tabular-nums"
                    value={actual}
                    onChange={(e) => setActual(e.target.value)}
                    placeholder="Enter value"
                    step="0.01"
                  />
                  {kpi.unit_of_measure && (
                    <span className="text-sm text-text-muted">{kpi.unit_of_measure}</span>
                  )}
                </div>
              </label>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Update Narrative (optional)
                </span>
                <textarea
                  className="input-base min-h-[80px] py-2 text-sm"
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  placeholder="Explain performance driver or variance..."
                />
              </label>
            </div>
          </div>

          {result && (
            <div
              className={cn(
                'mt-3 flex items-center gap-2 text-sm',
                result.ok ? 'text-diriyah-green' : 'text-diriyah-red',
              )}
            >
              {result.ok ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Saved — awaiting validation. RAG: <RagBadge rag={result.rag} />
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4" />
                  Save failed — please try again.
                </>
              )}
            </div>
          )}

          {/* KPU-029: Validator controls — visible to Strategy & Governance */}
          {isValidator && hasUpdate && isPending && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="mb-3 text-xs font-semibold text-amber-800 uppercase tracking-wide">
                Validation Required
              </p>
              {validateResult && (
                <div
                  className={cn(
                    'mb-3 flex items-center gap-2 text-xs',
                    validateResult.ok ? 'text-diriyah-green' : 'text-diriyah-red',
                  )}
                >
                  {validateResult.ok ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {validateResult.decision === 'VALIDATED' ? 'Validated successfully.' : 'Returned for revision.'}
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Validation failed — please try again.
                    </>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={validatePending}
                  onClick={() => handleValidate('VALIDATED')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-diriyah-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                >
                  {validatePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  {t('validateBtn')}
                </button>
                <button
                  type="button"
                  disabled={validatePending}
                  onClick={() => handleValidate('RETURNED')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-diriyah-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                >
                  {validatePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldX className="h-3 w-3" />}
                  {t('returnBtn')}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="btn btn-primary h-10 px-4 text-sm disabled:opacity-50"
              disabled={!actual.trim() || pending}
              onClick={handleSave}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? t('saving') : t('saveUpdate')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiUpdatePanel
// ─────────────────────────────────────────────────────────────────────────────

export function KpiUpdatePanel({
  kpis,
  defaultPeriod,
}: {
  kpis: KpiWithDefinition[]
  defaultPeriod: string
}) {
  const t = useTranslations('kpiDashboard')
  const { currentUser, isRole } = useAuth()
  const router = useRouter()
  const [period, setPeriod] = useState(defaultPeriod)

  /** KPU-029: Strategy & Governance role acts as Data Validator */
  const isValidator = isRole('Strategy & Governance')

  const ragSummary = kpis.reduce(
    (acc, k) => {
      const rag = k.latest_update?.rag_status
      if (rag === 'GREEN') acc.green++
      else if (rag === 'AMBER') acc.amber++
      else if (rag === 'RED') acc.red++
      else acc.noData++
      return acc
    },
    { green: 0, amber: 0, red: 0, noData: 0 },
  )

  const pendingCount = kpis.filter(
    (k) => k.latest_update?.validation_decision === 'PENDING',
  ).length

  return (
    <div className="space-y-5">
      {/* Summary + period selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <SummaryBadge label={t('green')} count={ragSummary.green} colour="bg-diriyah-green text-white" />
          <SummaryBadge label={t('amber')} count={ragSummary.amber} colour="bg-diriyah-amber text-white" />
          <SummaryBadge label={t('red')} count={ragSummary.red} colour="bg-diriyah-red text-white" />
          <SummaryBadge label="No Data" count={ragSummary.noData} colour="bg-gray-200 text-gray-700" />
          {pendingCount > 0 && (
            <SummaryBadge label={t('pendingBadge')} count={pendingCount} colour="bg-amber-100 text-amber-800 ring-1 ring-amber-300" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="period-select" className="text-sm text-text-muted">
            {t('periodLabel')}:
          </label>
          <input
            id="period-select"
            type="month"
            className="input-base h-9 w-38 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
      </div>

      {/* KPI list */}
      <div className="overflow-hidden rounded-md border border-border bg-white">
        <div className="flex items-center gap-3 border-b border-border bg-diriyah-bg-alt/80 px-5 py-3">
          <TrendingUp className="h-4 w-4 text-diriyah-accent" />
          <h2 className="text-base font-semibold text-text">
            KPI Performance Updates — {period}
          </h2>
          <span className="ml-auto rounded-full bg-diriyah-bg-secondary px-2.5 py-0.5 text-xs font-semibold text-text-muted">
            {kpis.length} KPIs
          </span>
        </div>
        <div className="divide-y divide-border/50">
          {kpis.map((kpi) => (
            <KpiUpdateRow
              key={kpi.kpi_id}
              kpi={kpi}
              period={period}
              actorId={currentUser.email}
              isValidator={isValidator}
              onSaved={() => router.refresh()}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SummaryBadge({
  label,
  count,
  colour,
}: {
  label: string
  count: number
  colour: string
}) {
  return (
    <div className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold', colour)}>
      <span className="text-base font-bold tabular-nums">{count}</span>
      <span className="text-xs font-medium opacity-90">{label}</span>
    </div>
  )
}
