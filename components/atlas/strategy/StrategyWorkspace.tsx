'use client'

import { useId, useMemo, useState, useTransition, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  Lock,
  Send,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useRouter } from '@/src/i18n/navigation'
import { useAuth } from '@/src/providers/AuthProvider'
import { saveStrategy, submitStrategy } from '@/src/actions/strategy'
import {
  FormStepActions,
  FormStepRail,
  RequiredMark,
  useFormSteps,
} from '@/components/atlas/forms/FormStepper'
import { OfficialTag, WorkspaceMetaCard, WorkspaceMetaGrid } from '@/components/atlas/records'
import { recordStatusTagTone, sentenceCaseLabel } from '@/lib/atlas/record-label'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Perspective = 'FINANCIAL' | 'CUSTOMER' | 'INTERNAL' | 'LEARNING'
type Tab = 'general' | 'context' | 'scope' | 'finance' | 'governance' | 'objectives'

export type ObjectiveRow = {
  local_id: string
  // --- core ---
  objective_title: string
  perspective: Perspective | ''
  priority: string
  weight_percentage: number
  // --- extended ---
  objective_description: string
  intended_outcome: string
  objective_start: string
  objective_end: string
  objective_owner: string
  baseline_narrative: string
}

export type KpiRow = {
  local_id: string
  objective_local_id: string
  kpi_name: string
  unit_of_measure: string
  kpi_type: string
  kpi_weight_pct: number
  green_threshold: string
  amber_threshold: string
}

/** Core strategy form state — maps 1-to-1 with Strategy model fields.
 *  JSON array fields (strategic_drivers, etc.) are stored as newline-separated strings
 *  and split/joined on save. */
export type StrategyFormState = {
  // ── General ──────────────────────────────────────────────────────────────
  strategy_title: string
  strategy_type: string
  baseline_fiscal_year: string
  horizon_start: string
  horizon_end: string
  review_frequency: string
  requested_effective_date: string
  executive_sponsor: string
  strategy_owner: string
  performance_manager: string
  // ── Context ──────────────────────────────────────────────────────────────
  mandate_statement: string
  vision_statement: string
  mission_statement: string
  executive_summary: string
  strategic_drivers: string          // newline-separated
  current_state_summary: string
  trend_summary: string
  swot_summary: string
  target_state_description: string
  // ── Scope ────────────────────────────────────────────────────────────────
  scope_in: string
  scope_out: string
  target_beneficiaries: string       // newline-separated
  strategic_priorities: string       // newline-separated
  key_outcomes: string               // newline-separated
  // ── Finance ──────────────────────────────────────────────────────────────
  funding_envelope: string
  currency_code: string
  indicative_capex: string
  indicative_opex: string
  funding_source: string             // newline-separated
  // ── Governance ───────────────────────────────────────────────────────────
  performance_reporting_frequency: string
  decision_forums: string            // newline-separated
  key_assumptions: string
  key_constraints: string
  strategic_risks: string            // newline-separated; each line = one risk text
}

export type InitialStrategyData = {
  strategyId: string
  masterTraceId: string
  // General
  strategy_title: string
  strategy_type?: string | null
  baseline_fiscal_year?: number | null
  horizon_start_date?: string | null
  horizon_end_date?: string | null
  review_frequency?: string | null
  requested_effective_date?: string | null
  executive_sponsor_user_id?: string | null
  strategy_owner_user_id?: string | null
  performance_manager_user_id?: string | null
  // Context
  mandate_statement?: string | null
  vision_statement?: string | null
  mission_statement?: string | null
  executive_summary?: string | null
  strategic_drivers?: unknown
  current_state_summary?: string | null
  trend_summary?: string | null
  swot_summary?: string | null
  target_state_description?: string | null
  // Scope
  scope_in?: string | null
  scope_out?: string | null
  target_beneficiaries?: unknown
  strategic_priorities?: unknown
  key_outcomes?: unknown
  // Finance
  funding_envelope?: number | null
  currency_code?: string | null
  indicative_capex?: number | null
  indicative_opex?: number | null
  funding_source?: unknown
  // Governance
  performance_reporting_frequency?: string | null
  decision_forums?: unknown
  key_assumptions?: string | null
  key_constraints?: string | null
  strategic_risks?: unknown
  // Status
  record_status?: string | null
  is_locked?: boolean
  // Objectives
  objectives?: {
    objective_id: string
    objective_name: string
    bsc_perspective?: string | null
    objective_priority?: string | null
    objective_weight_pct?: number | null
    objective_description?: string | null
    intended_outcome?: string | null
    objective_start_date?: string | null
    objective_end_date?: string | null
    objective_owner_user_id?: string | null
    baseline_narrative?: string | null
    kpis?: {
      kpi_id: string
      kpi_name: string
      unit_of_measure?: string | null
      kpi_type?: string | null
      kpi_weight_pct?: number | null
      green_threshold?: string | null
      amber_threshold?: string | null
    }[]
  }[]
}

type StrategyWorkspaceProps = {
  strategyId: string
  masterTraceId: string
  initialData?: InitialStrategyData | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PERSPECTIVES: Perspective[] = ['FINANCIAL', 'CUSTOMER', 'INTERNAL', 'LEARNING']
const REVIEW_FREQUENCIES = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual']
const REPORTING_FREQUENCIES = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual']
const KPI_TYPES = ['LAGGING', 'LEADING', 'BINARY']
const STRATEGY_TYPES = ['Corporate', 'Business Unit', 'Functional', 'Programme', 'Initiative']
const PRIORITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low']
const CURRENCY_CODES = ['SAR', 'USD', 'EUR', 'GBP', 'AED']

const TAB_IDS: Tab[] = ['general', 'context', 'scope', 'finance', 'governance', 'objectives']

function newObjective(weight = 0): ObjectiveRow {
  return {
    local_id: crypto.randomUUID(),
    objective_title: '',
    perspective: '',
    priority: 'Medium',
    weight_percentage: weight,
    objective_description: '',
    intended_outcome: '',
    objective_start: '',
    objective_end: '',
    objective_owner: '',
    baseline_narrative: '',
  }
}

function newKpi(objectiveLocalId: string): KpiRow {
  return {
    local_id: crypto.randomUUID(),
    objective_local_id: objectiveLocalId,
    kpi_name: '',
    unit_of_measure: '',
    kpi_type: 'LAGGING',
    kpi_weight_pct: 0,
    green_threshold: '',
    amber_threshold: '',
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function fmtDate(d?: string | null): string {
  if (!d) return ''
  return d.substring(0, 10)
}

/** Convert a Prisma JSON field (string[] | null | unknown) to a newline-separated string. */
function jsonToLines(val: unknown): string {
  if (!val) return ''
  if (Array.isArray(val)) return val.filter(Boolean).join('\n')
  if (typeof val === 'string') return val
  return ''
}

/** Convert newline-separated string to string[] for the payload. */
function linesToArray(s: string): string[] {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component — collapsible objective row
// ─────────────────────────────────────────────────────────────────────────────

function ObjectiveAccordion({
  obj,
  kpis,
  readOnly,
  onUpdate,
  onRemove,
  onAddKpi,
  onUpdateKpi,
  onRemoveKpi,
  canRemove,
}: {
  obj: ObjectiveRow
  kpis: KpiRow[]
  readOnly: boolean
  onUpdate: (change: Partial<ObjectiveRow>) => void
  onRemove: () => void
  onAddKpi: () => void
  onUpdateKpi: (kpiId: string, change: Partial<KpiRow>) => void
  onRemoveKpi: (kpiId: string) => void
  canRemove: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 bg-diriyah-bg-alt/60">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-start"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
          )}
          <span className="truncate text-sm font-semibold text-text">
            {obj.objective_title || <span className="italic text-text-muted">Untitled objective</span>}
          </span>
          {obj.perspective && (
            <span className="ml-2 shrink-0 rounded-full bg-diriyah-accent/15 px-2 py-0.5 text-[10px] font-semibold text-diriyah-accent">
              {obj.perspective}
            </span>
          )}
        </button>

        {/* Weight badge */}
        <span className="shrink-0 text-sm font-mono text-text-muted">{obj.weight_percentage}%</span>

        {!readOnly && canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-diriyah-red hover:bg-diriyah-red/10"
            aria-label="Remove objective"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* Row 1: title + perspective + priority */}
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block space-y-1.5 md:col-span-1">
              <span className="text-xs font-medium text-text">Objective Name *</span>
              <input
                className="input-base"
                value={obj.objective_title}
                onChange={(e) => onUpdate({ objective_title: e.target.value })}
                placeholder="e.g. Improve Citizen Experience"
                disabled={readOnly}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text">BSC Perspective *</span>
              <select
                className="input-base"
                value={obj.perspective}
                onChange={(e) => onUpdate({ perspective: e.target.value as Perspective | '' })}
                disabled={readOnly}
              >
                <option value="">Select…</option>
                {PERSPECTIVES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text">Priority</span>
              <select
                className="input-base"
                value={obj.priority}
                onChange={(e) => onUpdate({ priority: e.target.value })}
                disabled={readOnly}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Row 2: weight + owner + dates */}
          <div className="grid gap-4 md:grid-cols-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text">Weight %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className="input-base tabular-nums"
                value={obj.weight_percentage}
                onChange={(e) => onUpdate({ weight_percentage: Number(e.target.value) || 0 })}
                disabled={readOnly}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text">Owner (User ID)</span>
              <input
                className="input-base"
                value={obj.objective_owner}
                onChange={(e) => onUpdate({ objective_owner: e.target.value })}
                placeholder="e.g. user@diriyah.sa"
                disabled={readOnly}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text">Start Date</span>
              <input
                type="date"
                className="input-base"
                value={obj.objective_start}
                onChange={(e) => onUpdate({ objective_start: e.target.value })}
                disabled={readOnly}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text">End Date</span>
              <input
                type="date"
                className="input-base"
                value={obj.objective_end}
                onChange={(e) => onUpdate({ objective_end: e.target.value })}
                disabled={readOnly}
              />
            </label>
          </div>

          {/* Row 3: description + intended outcome */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text">Description</span>
              <textarea
                className="input-base min-h-20 py-2 text-sm"
                value={obj.objective_description}
                onChange={(e) => onUpdate({ objective_description: e.target.value })}
                placeholder="What does this objective mean?"
                disabled={readOnly}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text">Intended Outcome</span>
              <textarea
                className="input-base min-h-20 py-2 text-sm"
                value={obj.intended_outcome}
                onChange={(e) => onUpdate({ intended_outcome: e.target.value })}
                placeholder="What measurable outcome is expected?"
                disabled={readOnly}
              />
            </label>
          </div>

          {/* Row 4: baseline narrative */}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-text">Baseline Narrative</span>
            <textarea
              className="input-base min-h-16 py-2 text-sm"
              value={obj.baseline_narrative}
              onChange={(e) => onUpdate({ baseline_narrative: e.target.value })}
              placeholder="Current state before this objective is achieved…"
              disabled={readOnly}
            />
          </label>

          {/* KPI sub-table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-diriyah-accent">
                KPIs ({kpis.length})
              </p>
              {!readOnly && (
                <button
                  type="button"
                  onClick={onAddKpi}
                  className="btn h-7 border-border bg-white px-2 text-xs"
                >
                  <Plus className="h-3 w-3" /> Add KPI
                </button>
              )}
            </div>

            {kpis.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-[10px] uppercase tracking-wide text-text-muted">
                      <th className="px-3 py-2 font-semibold">KPI Name</th>
                      <th className="px-3 py-2 font-semibold">Unit</th>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold">Weight %</th>
                      <th className="px-3 py-2 font-semibold">Green ≥</th>
                      <th className="px-3 py-2 font-semibold">Amber ≥</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.map((kpi) => (
                      <tr key={kpi.local_id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          <input
                            className="input-base h-8 text-xs"
                            value={kpi.kpi_name}
                            onChange={(e) => onUpdateKpi(kpi.local_id, { kpi_name: e.target.value })}
                            placeholder="e.g. NPS Score"
                            disabled={readOnly}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input-base h-8 text-xs"
                            value={kpi.unit_of_measure}
                            onChange={(e) => onUpdateKpi(kpi.local_id, { unit_of_measure: e.target.value })}
                            placeholder="%, SAR, days"
                            disabled={readOnly}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="input-base h-8 text-xs"
                            value={kpi.kpi_type}
                            onChange={(e) => onUpdateKpi(kpi.local_id, { kpi_type: e.target.value })}
                            disabled={readOnly}
                          >
                            {KPI_TYPES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            className="input-base h-8 tabular-nums text-xs"
                            value={kpi.kpi_weight_pct}
                            onChange={(e) => onUpdateKpi(kpi.local_id, { kpi_weight_pct: Number(e.target.value) || 0 })}
                            disabled={readOnly}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input-base h-8 text-xs"
                            value={kpi.green_threshold}
                            onChange={(e) => onUpdateKpi(kpi.local_id, { green_threshold: e.target.value })}
                            placeholder="≥80"
                            disabled={readOnly}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input-base h-8 text-xs"
                            value={kpi.amber_threshold}
                            onChange={(e) => onUpdateKpi(kpi.local_id, { amber_threshold: e.target.value })}
                            placeholder="≥60"
                            disabled={readOnly}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => onRemoveKpi(kpi.local_id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-diriyah-red hover:bg-diriyah-red/10"
                              aria-label="Remove KPI"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {kpis.length === 0 && !readOnly && (
              <p className="text-xs text-text-muted italic">
                No KPIs added. Click &ldquo;Add KPI&rdquo; to attach one to this objective.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function StrategyWorkspace({ strategyId, masterTraceId, initialData }: StrategyWorkspaceProps) {
  const t = useTranslations('strategy')
  const tc = useTranslations('common')
  const formId = useId()
  const router = useRouter()
  const { currentUser } = useAuth()

  const isLocked = initialData?.is_locked === true
  const recordStatus = initialData?.record_status ?? 'DRAFT'
  const isSubmitted = ['SUBMITTED', 'APPROVED'].includes(recordStatus)

  const steps = useFormSteps(TAB_IDS, 'general', isLocked)
  const activeTab = steps.currentId as Tab

  // ── Form state ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState<StrategyFormState>({
    // General
    strategy_title: initialData?.strategy_title ?? '',
    strategy_type: initialData?.strategy_type ?? '',
    baseline_fiscal_year: initialData?.baseline_fiscal_year ? String(initialData.baseline_fiscal_year) : '',
    horizon_start: fmtDate(initialData?.horizon_start_date),
    horizon_end: fmtDate(initialData?.horizon_end_date),
    review_frequency: initialData?.review_frequency ?? 'Quarterly',
    requested_effective_date: fmtDate(initialData?.requested_effective_date),
    executive_sponsor: initialData?.executive_sponsor_user_id ?? '',
    strategy_owner: initialData?.strategy_owner_user_id ?? '',
    performance_manager: initialData?.performance_manager_user_id ?? '',
    // Context
    mandate_statement: initialData?.mandate_statement ?? '',
    vision_statement: initialData?.vision_statement ?? '',
    mission_statement: initialData?.mission_statement ?? '',
    executive_summary: initialData?.executive_summary ?? '',
    strategic_drivers: jsonToLines(initialData?.strategic_drivers),
    current_state_summary: initialData?.current_state_summary ?? '',
    trend_summary: initialData?.trend_summary ?? '',
    swot_summary: initialData?.swot_summary ?? '',
    target_state_description: initialData?.target_state_description ?? '',
    // Scope
    scope_in: initialData?.scope_in ?? '',
    scope_out: initialData?.scope_out ?? '',
    target_beneficiaries: jsonToLines(initialData?.target_beneficiaries),
    strategic_priorities: jsonToLines(initialData?.strategic_priorities),
    key_outcomes: jsonToLines(initialData?.key_outcomes),
    // Finance
    funding_envelope: initialData?.funding_envelope ? String(initialData.funding_envelope) : '',
    currency_code: initialData?.currency_code ?? 'SAR',
    indicative_capex: initialData?.indicative_capex ? String(initialData.indicative_capex) : '',
    indicative_opex: initialData?.indicative_opex ? String(initialData.indicative_opex) : '',
    funding_source: jsonToLines(initialData?.funding_source),
    // Governance
    performance_reporting_frequency: initialData?.performance_reporting_frequency ?? 'Quarterly',
    decision_forums: jsonToLines(initialData?.decision_forums),
    key_assumptions: initialData?.key_assumptions ?? '',
    key_constraints: initialData?.key_constraints ?? '',
    strategic_risks: jsonToLines(initialData?.strategic_risks),
  })

  // ── Objectives & KPIs ──────────────────────────────────────────────────────
  const [objectives, setObjectives] = useState<ObjectiveRow[]>(() => {
    if (initialData?.objectives?.length) {
      return initialData.objectives.map((o) => ({
        local_id: o.objective_id,
        objective_title: o.objective_name,
        perspective: (o.bsc_perspective as Perspective | '') ?? '',
        priority: o.objective_priority ?? 'Medium',
        weight_percentage: o.objective_weight_pct ? Number(o.objective_weight_pct) : 0,
        objective_description: o.objective_description ?? '',
        intended_outcome: o.intended_outcome ?? '',
        objective_start: fmtDate(o.objective_start_date),
        objective_end: fmtDate(o.objective_end_date),
        objective_owner: o.objective_owner_user_id ?? '',
        baseline_narrative: o.baseline_narrative ?? '',
      }))
    }
    return [newObjective(50), newObjective(50)]
  })

  const [kpis, setKpis] = useState<KpiRow[]>(() => {
    if (initialData?.objectives?.length) {
      return initialData.objectives.flatMap((o) =>
        (o.kpis ?? []).map((k) => ({
          local_id: k.kpi_id,
          objective_local_id: o.objective_id,
          kpi_name: k.kpi_name,
          unit_of_measure: k.unit_of_measure ?? '',
          kpi_type: k.kpi_type ?? 'LAGGING',
          kpi_weight_pct: k.kpi_weight_pct ? Number(k.kpi_weight_pct) : 0,
          green_threshold: k.green_threshold ?? '',
          amber_threshold: k.amber_threshold ?? '',
        })),
      )
    }
    return []
  })

  const [savePending, startSave] = useTransition()
  const [submitPending, startSubmit] = useTransition()
  const [notification, setNotification] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────
  const weightSum = useMemo(
    () => round2(objectives.reduce((sum, r) => sum + (Number(r.weight_percentage) || 0), 0)),
    [objectives],
  )
  const weightsValid = weightSum === 100
  const hasTitleAndObjective = form.strategy_title.trim().length > 0 && objectives.length > 0
  const canSave = hasTitleAndObjective && !isLocked
  const canSubmit = canSave && weightsValid
  const busy = savePending || submitPending

  function stepValid(tab: Tab): boolean {
    switch (tab) {
      case 'general':
        return (
          form.strategy_title.trim().length > 0 &&
          form.strategy_type.trim().length > 0 &&
          form.horizon_start.trim().length > 0 &&
          form.horizon_end.trim().length > 0 &&
          form.executive_sponsor.trim().length > 0
        )
      case 'context':
        return (
          form.mandate_statement.trim().length > 0 &&
          form.vision_statement.trim().length > 0 &&
          form.mission_statement.trim().length > 0 &&
          form.executive_summary.trim().length > 0
        )
      case 'scope':
        return form.scope_in.trim().length > 0 && form.scope_out.trim().length > 0
      case 'finance':
        return form.funding_envelope.trim().length > 0 && Number(form.funding_envelope) > 0
      case 'governance':
        return true
      case 'objectives':
        return objectives.length > 0
    }
  }

  // G-09: Completeness check — percentage of core mandatory fields filled
  const completionPct = useMemo(() => {
    const checks = [
      !!form.strategy_title.trim(),
      !!form.strategy_type.trim(),
      !!form.horizon_start.trim(),
      !!form.horizon_end.trim(),
      !!form.executive_sponsor.trim(),
      !!form.mandate_statement.trim(),
      !!form.vision_statement.trim(),
      !!form.mission_statement.trim(),
      !!form.executive_summary.trim(),
      !!form.scope_in.trim(),
      !!form.scope_out.trim(),
      !!form.funding_envelope.trim() && Number(form.funding_envelope) > 0,
      objectives.length > 0,
      weightsValid,
      objectives.some((o) => o.objective_description.trim().length > 0),
    ]
    const filled = checks.filter(Boolean).length
    return Math.round((filled / checks.length) * 100)
  }, [form, objectives, weightsValid])

  // ── Helpers ────────────────────────────────────────────────────────────────
  function patch(field: keyof StrategyFormState) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (isLocked) return
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      setNotification(null)
    }
  }

  function updateObjective(localId: string, change: Partial<ObjectiveRow>) {
    if (isLocked) return
    setObjectives((rows) => rows.map((r) => (r.local_id === localId ? { ...r, ...change } : r)))
  }

  function addObjective() {
    if (isLocked) return
    setObjectives((rows) => [...rows, newObjective(0)])
  }

  function removeObjective(localId: string) {
    if (isLocked || objectives.length <= 1) return
    setObjectives((rows) => rows.filter((r) => r.local_id !== localId))
    setKpis((rows) => rows.filter((k) => k.objective_local_id !== localId))
  }

  function addKpi(objLocalId: string) {
    if (isLocked) return
    setKpis((rows) => [...rows, newKpi(objLocalId)])
  }

  function updateKpi(kpiLocalId: string, change: Partial<KpiRow>) {
    if (isLocked) return
    setKpis((rows) => rows.map((k) => (k.local_id === kpiLocalId ? { ...k, ...change } : k)))
  }

  function removeKpi(kpiLocalId: string) {
    if (isLocked) return
    setKpis((rows) => rows.filter((k) => k.local_id !== kpiLocalId))
  }

  // ── Payload ────────────────────────────────────────────────────────────────
  function buildPayload() {
    const validObjectives = objectives.filter((o) => o.objective_title.trim())
    const validObjIds = new Set(validObjectives.map((o) => o.local_id))

    return {
      strategy_id: strategyId,
      // General
      strategy_title: form.strategy_title,
      strategy_type: form.strategy_type || undefined,
      baseline_fiscal_year: form.baseline_fiscal_year ? Number(form.baseline_fiscal_year) : undefined,
      horizon_start_date: form.horizon_start || undefined,
      horizon_end_date: form.horizon_end || undefined,
      review_frequency: form.review_frequency || undefined,
      requested_effective_date: form.requested_effective_date || undefined,
      executive_sponsor_user_id: form.executive_sponsor || undefined,
      strategy_owner_user_id: form.strategy_owner || undefined,
      performance_manager_user_id: form.performance_manager || undefined,
      // Context
      mandate_statement: form.mandate_statement || undefined,
      vision_statement: form.vision_statement || undefined,
      mission_statement: form.mission_statement || undefined,
      executive_summary: form.executive_summary || undefined,
      strategic_drivers: linesToArray(form.strategic_drivers).length ? linesToArray(form.strategic_drivers) : undefined,
      current_state_summary: form.current_state_summary || undefined,
      trend_summary: form.trend_summary || undefined,
      swot_summary: form.swot_summary || undefined,
      target_state_description: form.target_state_description || undefined,
      // Scope
      scope_in: form.scope_in || undefined,
      scope_out: form.scope_out || undefined,
      target_beneficiaries: linesToArray(form.target_beneficiaries).length ? linesToArray(form.target_beneficiaries) : undefined,
      strategic_priorities: linesToArray(form.strategic_priorities).length ? linesToArray(form.strategic_priorities) : undefined,
      key_outcomes: linesToArray(form.key_outcomes).length ? linesToArray(form.key_outcomes) : undefined,
      // Finance
      funding_envelope: form.funding_envelope ? Number(form.funding_envelope) : undefined,
      currency_code: form.currency_code || undefined,
      indicative_capex: form.indicative_capex ? Number(form.indicative_capex) : undefined,
      indicative_opex: form.indicative_opex ? Number(form.indicative_opex) : undefined,
      funding_source: linesToArray(form.funding_source).length ? linesToArray(form.funding_source) : undefined,
      // Governance
      performance_reporting_frequency: form.performance_reporting_frequency || undefined,
      decision_forums: linesToArray(form.decision_forums).length ? linesToArray(form.decision_forums) : undefined,
      key_assumptions: form.key_assumptions || undefined,
      key_constraints: form.key_constraints || undefined,
      strategic_risks: linesToArray(form.strategic_risks).length
        ? linesToArray(form.strategic_risks).map((r) => ({ description: r }))
        : undefined,
      // Objectives & KPIs
      objectives: validObjectives.map((o) => ({
        objective_id: o.local_id,
        objective_name: o.objective_title,
        bsc_perspective: o.perspective || undefined,
        objective_priority: o.priority,
        objective_weight_pct: o.weight_percentage,
        objective_description: o.objective_description || undefined,
        intended_outcome: o.intended_outcome || undefined,
        objective_start_date: o.objective_start || undefined,
        objective_end_date: o.objective_end || undefined,
        objective_owner_user_id: o.objective_owner || undefined,
        baseline_narrative: o.baseline_narrative || undefined,
      })),
      kpis: kpis
        .filter((k) => k.kpi_name.trim() && validObjIds.has(k.objective_local_id))
        .map((k) => ({
          kpi_id: k.local_id,
          objective_local_id: k.objective_local_id,
          kpi_name: k.kpi_name,
          unit_of_measure: k.unit_of_measure || undefined,
          kpi_type: k.kpi_type || undefined,
          kpi_weight_pct: k.kpi_weight_pct || undefined,
          green_threshold: k.green_threshold || undefined,
          amber_threshold: k.amber_threshold || undefined,
        })),
      modified_by: currentUser.email,
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function persist(): Promise<boolean> {
    if (isLocked) return false
    const result = await saveStrategy(buildPayload())
    if (result.ok) {
      setNotification({ type: 'success', message: '✓ Strategy saved successfully.' })
      router.refresh()
      return true
    }
    setNotification({ type: 'error', message: result.error })
    return false
  }

  function handleSave() {
    if (!canSave || busy) return
    setNotification(null)
    startSave(async () => {
      await persist()
    })
  }

  function handleNext() {
    if (busy || isLocked) return
    if (!stepValid(activeTab)) {
      setNotification({ type: 'error', message: tc('fillRequired') })
      return
    }
    setNotification(null)
    startSave(async () => {
      const ok = await persist()
      if (ok) steps.advance()
    })
  }

  function handleSubmitToCto() {
    if (!canSubmit || busy) return
    setNotification(null)
    startSubmit(async () => {
      const saveResult = await saveStrategy(buildPayload())
      if (!saveResult.ok) {
        setNotification({ type: 'error', message: saveResult.error })
        return
      }
      const submitResult = await submitStrategy({
        strategy_id: strategyId,
        submitted_by: currentUser.email,
      })
      if (submitResult.ok) {
        setNotification({
          type: 'success',
          message: '✓ Strategy submitted to CTO for Gate G-S1 review. Record is now locked.',
        })
        router.refresh()
      } else {
        setNotification({ type: 'error', message: submitResult.error })
      }
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
            PI-01 · Strategy Formulation
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-text">
            Strategy Workspace
          </h1>
          <p className="max-w-xl text-sm text-text-muted">
            Align vision, funding envelope, and balanced-scorecard objectives. Submit to CTO at Gate G-S1.
          </p>
        </div>
        <WorkspaceMetaGrid>
          <WorkspaceMetaCard label="Strategy ID" value={strategyId} mono />
          <WorkspaceMetaCard label="Master Trace" value={masterTraceId} mono />
          <WorkspaceMetaCard label="Status">
            <div className="mt-1">
              <OfficialTag tone={recordStatusTagTone(recordStatus)}>
                {sentenceCaseLabel(recordStatus, 'Draft')}
              </OfficialTag>
            </div>
          </WorkspaceMetaCard>
          <WorkspaceMetaCard label={t('completeness')}>
            <p className="mt-1 text-sm font-semibold tabular-nums text-text">{completionPct}%</p>
            <div className="mt-1.5 h-1 w-full rounded-full bg-diriyah-bg-secondary">
              <div
                className="h-1 rounded-full bg-diriyah-primary"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </WorkspaceMetaCard>
        </WorkspaceMetaGrid>
      </div>

      {/* ── Banners ───────────────────────────────────────────────────────── */}
      {isLocked && (
        <div className="flex items-start gap-3 rounded-md border border-diriyah-primary/30 bg-diriyah-primary/10 px-4 py-3 text-sm text-text">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-diriyah-primary" />
          <p>
            This strategy is <strong>locked</strong> ({recordStatus}). Seeded demo record
            STR-2027-0001 is already approved. Use <strong>+ New Record</strong> → Strategic
            Initiative to create a draft you can edit and save.
          </p>
        </div>
      )}

      {!isLocked && !weightsValid && objectives.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border px-4 py-3 text-white shadow-sm"
          style={{ backgroundColor: 'var(--diriyah-red)', borderColor: 'var(--diriyah-red)' }}
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">BR-007 — Weight reconciliation</p>
            <p className="mt-0.5 text-sm text-white/90">
              Objective weights must sum to exactly <strong>100%</strong>. Current: <strong>{weightSum}%</strong>.
              Save and Submit remain disabled until reconciled.
            </p>
          </div>
        </div>
      )}

      {notification && (
        <div
          role="alert"
          className={cn(
            'flex items-start gap-3 rounded-md border px-4 py-3 text-sm',
            notification.type === 'success'
              ? 'border-diriyah-green/30 bg-diriyah-green/10 text-diriyah-green'
              : 'border-diriyah-red/30 bg-diriyah-red/10 text-diriyah-red',
          )}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p>{notification.message}</p>
        </div>
      )}

      <FormStepRail
        steps={TAB_IDS.map((tabId) => ({
          id: tabId,
          label: t(
            tabId === 'general'
              ? 'generalTab'
              : tabId === 'context'
                ? 'contextTab'
                : tabId === 'scope'
                  ? 'scopeTab'
                  : tabId === 'finance'
                    ? 'financeTab'
                    : tabId === 'governance'
                      ? 'governanceTab'
                      : 'objectivesTab',
          ),
        }))}
        currentId={activeTab}
        maxReached={steps.maxReached}
        onSelect={(id) => steps.select(id)}
      />

      {/* ── TAB: General ─────────────────────────────────────────────────── */}
      {activeTab === 'general' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">General Information</h2>
            <p className="text-sm text-text-muted">Identity, horizon, ownership and review settings.</p>
          </div>
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">
                {t('strategyTitle')} <RequiredMark />
              </span>
              <input
                id={`${formId}-title`}
                className="input-base"
                value={form.strategy_title}
                onChange={patch('strategy_title')}
                placeholder="e.g. Diriyah Digital Operating Model 2026–2030"
                required
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">
                {t('strategyType')} <RequiredMark />
              </span>
              <select className="input-base" value={form.strategy_type} onChange={patch('strategy_type')} disabled={isLocked}>
                <option value="">Select…</option>
                {STRATEGY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('fiscalYear')}</span>
              <input
                type="number"
                min={2020}
                max={2050}
                step={1}
                className="input-base"
                value={form.baseline_fiscal_year}
                onChange={patch('baseline_fiscal_year')}
                placeholder="e.g. 2026"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">
                {t('startDate')} <RequiredMark />
              </span>
              <input type="date" className="input-base" value={form.horizon_start} onChange={patch('horizon_start')} disabled={isLocked} />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">
                {t('endDate')} <RequiredMark />
              </span>
              <input type="date" className="input-base" value={form.horizon_end} onChange={patch('horizon_end')} disabled={isLocked} />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('reviewFrequency')}</span>
              <select className="input-base" value={form.review_frequency} onChange={patch('review_frequency')} disabled={isLocked}>
                {REVIEW_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('effectiveDate')}</span>
              <input type="date" className="input-base" value={form.requested_effective_date} onChange={patch('requested_effective_date')} disabled={isLocked} />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">
                {t('executiveSponsor')} <RequiredMark />
              </span>
              <input
                className="input-base"
                value={form.executive_sponsor}
                onChange={patch('executive_sponsor')}
                placeholder="e.g. cto@diriyah.sa"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('strategyOwner')}</span>
              <input
                className="input-base"
                value={form.strategy_owner}
                onChange={patch('strategy_owner')}
                placeholder="e.g. strategy-lead@diriyah.sa"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('performanceManager')}</span>
              <input
                className="input-base"
                value={form.performance_manager}
                onChange={patch('performance_manager')}
                placeholder="e.g. perf-mgr@diriyah.sa"
                disabled={isLocked}
              />
            </label>
          </div>
        </section>
      )}

      {/* ── TAB: Context & Narrative ──────────────────────────────────────── */}
      {activeTab === 'context' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">Context &amp; Narrative</h2>
            <p className="text-sm text-text-muted">
              Mandate, vision, mission, SWOT and strategic drivers.
            </p>
          </div>
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">
                Mandate Statement <RequiredMark />
              </span>
              <p className="text-xs text-text-muted">
                Required before submit. This is the strategy mandate — no separate letter file.
              </p>
              <textarea
                className="input-base min-h-24 py-3"
                value={form.mandate_statement}
                onChange={patch('mandate_statement')}
                placeholder="Official mandate or authorisation for this strategy…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">
                Vision Statement <RequiredMark />
              </span>
              <textarea
                className="input-base min-h-24 py-3"
                value={form.vision_statement}
                onChange={patch('vision_statement')}
                placeholder="Long-term aspiration…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">
                Mission Statement <RequiredMark />
              </span>
              <textarea
                className="input-base min-h-24 py-3"
                value={form.mission_statement}
                onChange={patch('mission_statement')}
                placeholder="Purpose and how the vision will be achieved…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">
                Executive Summary <RequiredMark />
              </span>
              <textarea
                className="input-base min-h-28 py-3"
                value={form.executive_summary}
                onChange={patch('executive_summary')}
                placeholder="High-level overview for CTO briefing pack…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Strategic Drivers</span>
              <p className="text-xs text-text-muted">One driver per line.</p>
              <textarea
                className="input-base min-h-28 py-3 text-sm"
                value={form.strategic_drivers}
                onChange={patch('strategic_drivers')}
                placeholder="Regulatory mandate&#10;Digital transformation&#10;Cost efficiency"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Current State Summary</span>
              <textarea
                className="input-base min-h-28 py-3 text-sm"
                value={form.current_state_summary}
                onChange={patch('current_state_summary')}
                placeholder="Describe the current situation…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Trend Summary</span>
              <textarea
                className="input-base min-h-24 py-3 text-sm"
                value={form.trend_summary}
                onChange={patch('trend_summary')}
                placeholder="Key market / technology trends driving the strategy…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">SWOT Summary</span>
              <textarea
                className="input-base min-h-24 py-3 text-sm"
                value={form.swot_summary}
                onChange={patch('swot_summary')}
                placeholder="Strengths, Weaknesses, Opportunities, Threats…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">Target State Description</span>
              <textarea
                className="input-base min-h-24 py-3 text-sm"
                value={form.target_state_description}
                onChange={patch('target_state_description')}
                placeholder="Describe the desired future state when the strategy is achieved…"
                disabled={isLocked}
              />
            </label>
          </div>
        </section>
      )}

      {/* ── TAB: Scope & Outcomes ─────────────────────────────────────────── */}
      {activeTab === 'scope' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">Scope &amp; Outcomes</h2>
            <p className="text-sm text-text-muted">
              Boundaries, beneficiaries, priorities and key outcomes.
            </p>
          </div>
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">
                Scope In <RequiredMark />
              </span>
              <textarea
                className="input-base min-h-28 py-3 text-sm"
                value={form.scope_in}
                onChange={patch('scope_in')}
                placeholder="What is explicitly included in this strategy…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">
                Scope Out <RequiredMark />
              </span>
              <textarea
                className="input-base min-h-28 py-3 text-sm"
                value={form.scope_out}
                onChange={patch('scope_out')}
                placeholder="What is explicitly excluded from this strategy…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Target Beneficiaries</span>
              <p className="text-xs text-text-muted">One per line.</p>
              <textarea
                className="input-base min-h-24 py-3 text-sm"
                value={form.target_beneficiaries}
                onChange={patch('target_beneficiaries')}
                placeholder="Citizens&#10;Internal operations&#10;Partners"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Strategic Priorities</span>
              <p className="text-xs text-text-muted">One per line, ranked order.</p>
              <textarea
                className="input-base min-h-24 py-3 text-sm"
                value={form.strategic_priorities}
                onChange={patch('strategic_priorities')}
                placeholder="Digital infrastructure&#10;Talent development&#10;Customer experience"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">Key Outcomes</span>
              <p className="text-xs text-text-muted">One measurable outcome per line.</p>
              <textarea
                className="input-base min-h-24 py-3 text-sm"
                value={form.key_outcomes}
                onChange={patch('key_outcomes')}
                placeholder="40% reduction in service cycle time&#10;85% citizen satisfaction NPS"
                disabled={isLocked}
              />
            </label>
          </div>
        </section>
      )}

      {/* ── TAB: Finance ──────────────────────────────────────────────────── */}
      {activeTab === 'finance' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">Finance</h2>
            <p className="text-sm text-text-muted">Funding envelope, CAPEX/OPEX split and funding sources.</p>
          </div>
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">
                Funding Envelope <RequiredMark />
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                  {form.currency_code || 'SAR'}
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input-base ps-12 tabular-nums"
                  value={form.funding_envelope}
                  onChange={patch('funding_envelope')}
                  placeholder="0.00"
                  disabled={isLocked}
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Currency Code</span>
              <select className="input-base" value={form.currency_code} onChange={patch('currency_code')} disabled={isLocked}>
                {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Indicative CAPEX</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                  {form.currency_code || 'SAR'}
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input-base ps-12 tabular-nums"
                  value={form.indicative_capex}
                  onChange={patch('indicative_capex')}
                  placeholder="0.00"
                  disabled={isLocked}
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Indicative OPEX</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                  {form.currency_code || 'SAR'}
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input-base ps-12 tabular-nums"
                  value={form.indicative_opex}
                  onChange={patch('indicative_opex')}
                  placeholder="0.00"
                  disabled={isLocked}
                />
              </div>
            </label>

            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">Funding Sources</span>
              <p className="text-xs text-text-muted">One source per line.</p>
              <textarea
                className="input-base min-h-24 py-3 text-sm"
                value={form.funding_source}
                onChange={patch('funding_source')}
                placeholder="Ministry budget allocation&#10;Transformation fund&#10;PPP arrangement"
                disabled={isLocked}
              />
            </label>
          </div>
        </section>
      )}

      {/* ── TAB: Governance ───────────────────────────────────────────────── */}
      {activeTab === 'governance' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">Governance</h2>
            <p className="text-sm text-text-muted">
              Reporting cadence, decision forums, assumptions, constraints and strategic risks.
            </p>
          </div>
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Performance Reporting Frequency</span>
              <select
                className="input-base"
                value={form.performance_reporting_frequency}
                onChange={patch('performance_reporting_frequency')}
                disabled={isLocked}
              >
                {REPORTING_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Decision Forums</span>
              <p className="text-xs text-text-muted">One forum per line.</p>
              <textarea
                className="input-base min-h-24 py-3 text-sm"
                value={form.decision_forums}
                onChange={patch('decision_forums')}
                placeholder="Technology Steering Committee&#10;CTO Weekly Review"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Key Assumptions</span>
              <textarea
                className="input-base min-h-28 py-3 text-sm"
                value={form.key_assumptions}
                onChange={patch('key_assumptions')}
                placeholder="Assumptions underpinning the strategy…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Key Constraints</span>
              <textarea
                className="input-base min-h-28 py-3 text-sm"
                value={form.key_constraints}
                onChange={patch('key_constraints')}
                placeholder="Known constraints (budget ceiling, resource limits, timeline)…"
                disabled={isLocked}
              />
            </label>

            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">Strategic Risks</span>
              <p className="text-xs text-text-muted">One risk per line.</p>
              <textarea
                className="input-base min-h-28 py-3 text-sm"
                value={form.strategic_risks}
                onChange={patch('strategic_risks')}
                placeholder="Dependency on third-party data providers&#10;Regulatory changes to digital procurement&#10;Talent availability in AI/data roles"
                disabled={isLocked}
              />
            </label>
          </div>
        </section>
      )}

      {/* ── TAB: Objectives & KPIs ────────────────────────────────────────── */}
      {activeTab === 'objectives' && (
        <div className="space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text">Objectives &amp; KPIs</h2>
              <p className="text-sm text-text-muted">
                BR-006: ≥1 objective required. BR-007: weights must sum to 100%.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-sm font-semibold',
                  weightsValid
                    ? 'bg-diriyah-green/10 text-diriyah-green'
                    : 'bg-diriyah-red/10 text-diriyah-red',
                )}
              >
                Weights: {weightSum}% / 100%
              </span>
              {!isLocked && (
                <button
                  type="button"
                  onClick={addObjective}
                  className="btn h-10 border-border bg-white text-sm"
                >
                  <Plus className="h-4 w-4" /> {t('addObjective')}
                </button>
              )}
            </div>
          </div>

          {/* Objectives list */}
          <div className="space-y-3">
            {objectives.map((obj) => {
              const objKpis = kpis.filter((k) => k.objective_local_id === obj.local_id)
              return (
                <ObjectiveAccordion
                  key={obj.local_id}
                  obj={obj}
                  kpis={objKpis}
                  readOnly={isLocked}
                  onUpdate={(change) => updateObjective(obj.local_id, change)}
                  onRemove={() => removeObjective(obj.local_id)}
                  onAddKpi={() => addKpi(obj.local_id)}
                  onUpdateKpi={updateKpi}
                  onRemoveKpi={removeKpi}
                  canRemove={objectives.length > 1}
                />
              )
            })}
          </div>
        </div>
      )}

      {!isLocked && (
        <FormStepActions
          isFirst={steps.isFirst}
          isLast={steps.isLast}
          onBack={steps.goBack}
          onNext={handleNext}
          nextDisabled={!stepValid(activeTab)}
          nextPending={savePending}
          hideNext={steps.isLast}
        >
          {steps.isLast ? (
            <>
              <button
                type="button"
                className="btn h-11 border-border bg-white px-6 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canSave || busy}
                onClick={handleSave}
              >
                {savePending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {savePending ? t('saving') : t('saveStrategy')}
              </button>
              <button
                type="button"
                className="btn btn-primary inline-flex h-11 items-center gap-2 px-6 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canSubmit || busy}
                onClick={handleSubmitToCto}
                title={
                  !weightsValid
                    ? 'BR-007: Objective weights must sum to 100%.'
                    : !hasTitleAndObjective
                      ? 'BR-006: Title and at least one objective are required.'
                      : 'Submit strategy to CTO for Gate G-S1 review.'
                }
              >
                {submitPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitPending ? t('submitting') : t('submitStrategy')}
              </button>
            </>
          ) : null}
        </FormStepActions>
      )}
    </div>
  )
}
