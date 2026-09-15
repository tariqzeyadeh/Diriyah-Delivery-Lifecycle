'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/src/i18n/navigation'
import { useAuth } from '@/src/providers/AuthProvider'
import { saveKpiDefinition, type KpiDefinitionDetail, type KpiUpdateHistoryEntry } from '@/src/actions/kpi'
import { OfficialTag } from '@/components/atlas/records'
import { ragTagTone, recordStatusTagTone, sentenceCaseLabel } from '@/lib/atlas/record-label'
import { cn } from '@/lib/utils'
import { CheckCircle2, AlertTriangle, Loader2, Save, TrendingUp, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import {
  FormStepActions,
  FormStepRail,
  RequiredMark,
  useFormSteps,
} from '@/components/atlas/forms/FormStepper'

// ─────────────────────────────────────────────────────────────────────────────
// RAG badge
// ─────────────────────────────────────────────────────────────────────────────

function RagBadge({ rag }: { rag: string | null | undefined }) {
  if (!rag) return <span className="text-xs text-text-muted">—</span>
  return <OfficialTag tone={ragTagTone(rag)}>{sentenceCaseLabel(rag)}</OfficialTag>
}

type Tab = 'definition' | 'targets' | 'data-controls' | 'history'
const KPI_TAB_IDS: Tab[] = ['definition', 'targets', 'data-controls', 'history']

// ─────────────────────────────────────────────────────────────────────────────
// KpiDefinitionWorkspace
// ─────────────────────────────────────────────────────────────────────────────

export function KpiDefinitionWorkspace({
  kpi: initialKpi,
  history,
}: {
  kpi: KpiDefinitionDetail
  history: KpiUpdateHistoryEntry[]
}) {
  const t = useTranslations('kpiDetail')
  const tc = useTranslations('common')
  const { currentUser } = useAuth()
  const router = useRouter()
  const steps = useFormSteps(KPI_TAB_IDS, 'definition')
  const tab = steps.currentId as Tab
  const [pending, startTransition] = useTransition()
  const [saveResult, setSaveResult] = useState<{ ok: boolean; error?: string } | null>(null)

  // Editable field state
  const [kpiName, setKpiName] = useState(initialKpi.kpi_name)
  const [kpiDef, setKpiDef] = useState(initialKpi.kpi_definition ?? '')
  const [purpose, setPurpose] = useState(initialKpi.measurement_purpose ?? '')
  const [polarity, setPolarity] = useState(initialKpi.performance_polarity ?? '')
  const [unit, setUnit] = useState(initialKpi.unit_of_measure ?? '')
  const [aggregation, setAggregation] = useState(initialKpi.aggregation_method ?? '')
  const [frequency, setFrequency] = useState(initialKpi.collection_frequency ?? '')
  const [formula, setFormula] = useState(initialKpi.calculation_formula ?? '')
  const [numerator, setNumerator] = useState(initialKpi.numerator_definition ?? '')
  const [denominator, setDenominator] = useState(initialKpi.denominator_definition ?? '')
  const [greenT, setGreenT] = useState(initialKpi.green_threshold ?? '')
  const [amberT, setAmberT] = useState(initialKpi.amber_threshold ?? '')
  const [redT, setRedT] = useState(initialKpi.red_threshold ?? '')
  const [baseline, setBaseline] = useState(initialKpi.baseline_value !== null ? String(initialKpi.baseline_value) : '')
  const [owner, setOwner] = useState(initialKpi.kpi_owner_user_id ?? '')

  // Data controls state
  const [steward, setSteward] = useState(initialKpi.data_steward_user_id ?? '')
  const [sourceSystem, setSourceSystem] = useState(initialKpi.kpi_source_system ?? '')
  const [offset, setOffset] = useState(initialKpi.submission_due_offset_days !== null ? String(initialKpi.submission_due_offset_days) : '')

  // Target profile (editable table)
  const parseTargetProfile = (tp: unknown): { period: string; target: string }[] => {
    if (!tp || typeof tp !== 'object') return []
    return Object.entries(tp as Record<string, unknown>).map(([period, target]) => ({
      period,
      target: String(target),
    }))
  }
  const [targetRows, setTargetRows] = useState(() => parseTargetProfile(initialKpi.target_profile))

  // data_quality_rules checkboxes
  const parseQualityRules = (dqr: unknown): Record<string, boolean> => {
    if (!dqr || typeof dqr !== 'object') return {}
    return dqr as Record<string, boolean>
  }
  const [qualityRules, setQualityRules] = useState(() => parseQualityRules(initialKpi.data_quality_rules))
  const DQ_CHECKS = [
    { key: 'formula_tested', label: 'Formula tested' },
    { key: 'owner_assigned', label: 'Owner assigned' },
    { key: 'thresholds_approved', label: 'Thresholds approved' },
    { key: 'evidence_required', label: 'Evidence required' },
  ]

  async function persist(): Promise<boolean> {
    setSaveResult(null)
    const tp = targetRows.reduce<Record<string, number>>((acc, r) => {
      if (r.period && r.target) acc[r.period] = parseFloat(r.target)
      return acc
    }, {})
    const res = await saveKpiDefinition({
      kpi_id: initialKpi.kpi_id,
      kpi_name: kpiName,
      kpi_definition: kpiDef || null,
      measurement_purpose: purpose || null,
      performance_polarity: polarity || null,
      unit_of_measure: unit || null,
      aggregation_method: aggregation || null,
      collection_frequency: frequency || null,
      calculation_formula: formula || null,
      numerator_definition: numerator || null,
      denominator_definition: denominator || null,
      green_threshold: greenT || null,
      amber_threshold: amberT || null,
      red_threshold: redT || null,
      baseline_value: baseline ? parseFloat(baseline) : null,
      kpi_owner_user_id: owner || null,
      data_steward_user_id: steward || null,
      kpi_source_system: sourceSystem || null,
      submission_due_offset_days: offset ? parseInt(offset, 10) : null,
      target_profile: Object.keys(tp).length ? tp : null,
      data_quality_rules: Object.keys(qualityRules).length ? qualityRules : null,
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
    if (!kpiName.trim()) {
      setSaveResult({ ok: false, error: tc('fillRequired') })
      return
    }
    startTransition(async () => {
      const ok = await persist()
      if (ok) steps.advance()
    })
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'definition', label: t('definitionTab') },
    { id: 'targets', label: t('targetsTab') },
    { id: 'data-controls', label: 'Data & Controls' },
    { id: 'history', label: t('historyTab') },
  ]

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-diriyah-bg-alt px-2.5 py-0.5 font-mono text-xs text-text-muted">
              {initialKpi.kpi_id}
            </span>
            <OfficialTag tone={recordStatusTagTone(initialKpi.record_status)}>
              {sentenceCaseLabel(initialKpi.record_status, 'Active')}
            </OfficialTag>
            {initialKpi.objective_name && (
              <Link
                href={`/strategy/${initialKpi.objective_id}`}
                className="flex items-center gap-1 text-xs text-diriyah-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {initialKpi.objective_name}
              </Link>
            )}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
            G-25 · KPI Definition
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-text">{initialKpi.kpi_name}</h1>
        </div>
      </div>

      {saveResult && (
        <div className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm', saveResult.ok ? 'bg-diriyah-green/10 text-diriyah-green' : 'bg-diriyah-red/10 text-diriyah-red')}>
          {saveResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {saveResult.ok ? 'Saved successfully.' : (saveResult as { ok: false; error: string }).error}
        </div>
      )}

      {/* ── Layout ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left */}
        <div className="space-y-4">
          {/* Tabs */}
          <FormStepRail
            steps={tabs}
            currentId={tab}
            maxReached={steps.maxReached}
            onSelect={(id) => steps.select(id)}
          />

          {/* Tab: Definition */}
          {tab === 'definition' && (
            <div className="rounded-md border border-border bg-white p-4 space-y-5">
              <FormField label={t('nameLabel')} required>
                <input className="input-base h-10 w-full text-sm" value={kpiName} onChange={(e) => setKpiName(e.target.value)} />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Collection Frequency">
                  <select className="input-base h-10 w-full text-sm" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                    <option value="">— Select —</option>
                    {['Monthly', 'Quarterly', 'Annual', 'Weekly', 'Ad Hoc'].map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label={t('unitLabel')}>
                  <input className="input-base h-10 w-full text-sm" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="%, SAR, count..." />
                </FormField>
                <FormField label="Aggregation Method">
                  <select className="input-base h-10 w-full text-sm" value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
                    <option value="">— Select —</option>
                    {['Sum', 'Average', 'Last Value', 'Count', 'Ratio'].map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="KPI Definition">
                <textarea className="input-base min-h-[80px] py-2 text-sm w-full" value={kpiDef} onChange={(e) => setKpiDef(e.target.value)} placeholder="Describe what this KPI measures..." />
              </FormField>

              <FormField label="Measurement Purpose (Business Rationale)">
                <textarea className="input-base min-h-[64px] py-2 text-sm w-full" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Why is this KPI important?" />
              </FormField>

              {/* Calculation */}
              <div className="rounded-md border border-border bg-diriyah-bg-alt/50 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Calculation</h3>
                <FormField label="Formula">
                  <input className="input-base h-9 w-full font-mono text-sm" value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="e.g. (Numerator / Denominator) × 100" />
                </FormField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Numerator">
                    <input className="input-base h-9 w-full text-sm" value={numerator} onChange={(e) => setNumerator(e.target.value)} />
                  </FormField>
                  <FormField label="Denominator">
                    <input className="input-base h-9 w-full text-sm" value={denominator} onChange={(e) => setDenominator(e.target.value)} />
                  </FormField>
                </div>
              </div>

              {/* Direction */}
              <FormField label={t('polarityLabel')}>
                <select className="input-base h-10 w-full text-sm" value={polarity} onChange={(e) => setPolarity(e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="Higher is Better">Higher is Better</option>
                  <option value="Lower is Better">Lower is Better</option>
                  <option value="Target Range">Target Range</option>
                  <option value="Binary">Binary</option>
                </select>
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Baseline Value">
                  <input type="number" className="input-base h-10 w-full tabular-nums text-sm" value={baseline} onChange={(e) => setBaseline(e.target.value)} />
                </FormField>
                <FormField label="KPI Owner">
                  <input className="input-base h-10 w-full text-sm" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="user@diriyah.sa" />
                </FormField>
              </div>

              {/* RAG Thresholds */}
              <div className="rounded-md border border-border bg-diriyah-bg-alt/50 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">RAG Thresholds</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField label={`${t('greenLabel')} (≥)`}>
                    <input className="input-base h-9 w-full tabular-nums text-sm text-diriyah-green" value={greenT} onChange={(e) => setGreenT(e.target.value)} placeholder="e.g. 90" />
                  </FormField>
                  <FormField label={`${t('amberLabel')} (≥)`}>
                    <input className="input-base h-9 w-full tabular-nums text-sm text-diriyah-amber" value={amberT} onChange={(e) => setAmberT(e.target.value)} placeholder="e.g. 70" />
                  </FormField>
                  <FormField label="Red (<)">
                    <input className="input-base h-9 w-full tabular-nums text-sm text-diriyah-red" value={redT} onChange={(e) => setRedT(e.target.value)} placeholder="e.g. 70" />
                  </FormField>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Targets */}
          {tab === 'targets' && (
            <div className="rounded-md border border-border bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-diriyah-bg-alt/80 px-5 py-3">
                <h2 className="text-sm font-semibold text-text">Target Profile</h2>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-text shadow-sm hover:bg-diriyah-bg-alt"
                  onClick={() => setTargetRows((r) => [...r, { period: '', target: '' }])}
                >
                  + Add row
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-5 py-3 text-start font-semibold">Period</th>
                      <th className="px-4 py-3 text-start font-semibold">Target</th>
                      <th className="px-4 py-3 text-start font-semibold">Stretch</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {targetRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-5 py-2">
                          <input
                            type="month"
                            className="input-base h-8 w-36 font-mono text-xs"
                            value={row.period}
                            onChange={(e) => setTargetRows((r) => r.map((x, i) => i === idx ? { ...x, period: e.target.value } : x))}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            className="input-base h-8 w-28 tabular-nums text-sm"
                            value={row.target}
                            onChange={(e) => setTargetRows((r) => r.map((x, i) => i === idx ? { ...x, target: e.target.value } : x))}
                          />
                        </td>
                        <td className="px-4 py-2 text-xs text-text-muted">
                          {initialKpi.stretch_target !== null ? initialKpi.stretch_target : '—'}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            className="text-xs text-diriyah-red hover:underline"
                            onClick={() => setTargetRows((r) => r.filter((_, i) => i !== idx))}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    {targetRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-5 py-6 text-center text-sm text-text-muted">No target rows yet — add one above.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Data & Controls */}
          {tab === 'data-controls' && (
            <div className="rounded-md border border-border bg-white p-4 space-y-5">
              <h2 className="text-sm font-semibold text-text">Data Governance</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Source System">
                  <input className="input-base h-10 w-full text-sm" value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} placeholder="SAP, BI, Manual..." />
                </FormField>
                <FormField label="Data Steward">
                  <input className="input-base h-10 w-full text-sm" value={steward} onChange={(e) => setSteward(e.target.value)} placeholder="user@diriyah.sa" />
                </FormField>
                <FormField label="Submission Due Offset (days)">
                  <input type="number" className="input-base h-10 w-full tabular-nums text-sm" value={offset} onChange={(e) => setOffset(e.target.value)} placeholder="e.g. 5" />
                </FormField>
              </div>

              <div className="rounded-md border border-border bg-diriyah-bg-alt/50 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Control Checklist</h3>
                <div className="space-y-2">
                  {DQ_CHECKS.map(({ key, label }) => (
                    <label key={key} className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border text-diriyah-primary"
                        checked={!!qualityRules[key]}
                        onChange={(e) => setQualityRules((r) => ({ ...r, [key]: e.target.checked }))}
                      />
                      <span className="text-sm text-text">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab: History */}
          {tab === 'history' && (
            <div className="rounded-md border border-border bg-white overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border bg-diriyah-bg-alt/80 px-5 py-3">
                <TrendingUp className="h-4 w-4 text-diriyah-accent" />
                <h2 className="text-sm font-semibold text-text">{t('historyTab')}</h2>
                <span className="ml-auto rounded-full bg-diriyah-bg-secondary px-2.5 py-0.5 text-xs font-semibold text-text-muted">{history.length} records</span>
              </div>
              {history.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-text-muted">{t('noHistory')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                        <th className="px-5 py-3 text-start font-semibold">{t('periodCol')}</th>
                        <th className="px-4 py-3 text-start font-semibold">{t('actualCol')}</th>
                        <th className="px-4 py-3 text-start font-semibold">Target</th>
                        <th className="px-4 py-3 text-start font-semibold">{t('ragCol')}</th>
                        <th className="px-4 py-3 text-start font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {history.map((u) => (
                        <tr key={u.kpi_update_id} className="hover:bg-diriyah-bg-alt/30">
                          <td className="px-5 py-3 font-mono text-xs text-text-muted">{u.period}</td>
                          <td className="px-4 py-3 font-semibold tabular-nums text-text">{u.actual_value ?? '—'}</td>
                          <td className="px-4 py-3 tabular-nums text-text-muted">{u.period_target ?? '—'}</td>
                          <td className="px-4 py-3"><RagBadge rag={u.rag_status ?? u.kpi_rag} /></td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/performance/kpi/${initialKpi.kpi_id}/update/${u.period}`}
                              className="text-xs font-semibold text-diriyah-primary hover:underline"
                            >
                              View →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <FormStepActions
            isFirst={steps.isFirst}
            isLast={steps.isLast}
            onBack={steps.goBack}
            onNext={handleNext}
            nextDisabled={!kpiName.trim()}
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
                {pending ? t('saving') : t('saveDefinition')}
              </button>
            ) : null}
          </FormStepActions>
        </div>
        <div className="space-y-4">
          {/* Data Governance card */}
          <div className="rounded-md border border-border bg-white p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Data Governance</h3>
            <InfoRow label="System of Record" value={initialKpi.kpi_source_system ?? '—'} />
            <InfoRow label="Data Steward" value={initialKpi.data_steward_user_id ?? '—'} />
            <InfoRow label="Cut-off (days)" value={initialKpi.submission_due_offset_days !== null ? String(initialKpi.submission_due_offset_days) : '—'} />
          </div>

          {/* Control Checklist card */}
          <div className="rounded-md border border-border bg-white p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Control Checklist</h3>
            {DQ_CHECKS.map(({ key, label }) => {
              const checked = !!qualityRules[key]
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className={cn('h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold', checked ? 'bg-diriyah-green text-white' : 'bg-border text-text-muted')}>
                    {checked ? '✓' : '○'}
                  </span>
                  <span className={cn('text-sm', checked ? 'text-text' : 'text-text-muted')}>{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
        {required ? <> <RequiredMark /></> : null}
      </span>
      {children}
    </label>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text text-end">{value}</span>
    </div>
  )
}
