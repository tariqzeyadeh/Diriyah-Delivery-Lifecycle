'use client'

import { Fragment, useMemo, useState, useTransition, type ChangeEvent } from 'react'
import { Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, Send, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/src/providers/AuthProvider'
import { Link, useRouter } from '@/src/i18n/navigation'
import { cn } from '@/lib/utils'
import { saveBudgetLines, saveBudgetGovernance, submitBudget } from '@/src/actions/budget'
import {
  FormStepActions,
  FormStepRail,
  RequiredMark,
  useFormSteps,
} from '@/components/atlas/forms/FormStepper'

export type LineType = 'OPEX' | 'CAPEX'
export type LineCategory = 'License' | 'Services' | 'Hardware' | 'Software' | 'Other'

export type BudgetLineRow = {
  local_id: string
  is_persisted: boolean
  description: string
  category: LineCategory
  line_type: LineType
  quantity: number
  unit_cost: number
  discount_amount: number
  contingency_pct: number
  tax_rate_pct: number
  company_code: string
  cost_center_code: string
  gl_account_code: string
  wbs_internal_order: string
  funding_source: string
  is_recurring: boolean
  recurrence_frequency: string
  commitment_type: string
  estimate_confidence: string
  // G-31 additions
  estimate_basis: string
  expected_commitment_date: string
  budget_recommendation: string
  line_fiscal_year: string
}

export type BudgetGovernanceRow<T extends object = object> = T & { local_id: string }

export type BudgetAssumptionRow = {
  local_id: string
  statement: string
  owner: string
  source: string
}

export type BudgetRiskRow = {
  local_id: string
  risk: string
  owner: string
  rating: 'High' | 'Medium' | 'Low'
  response: string
}

export type ExcludedDemandRow = {
  local_id: string
  demand_title: string
  disposition: string
  reason: string
}

export type BudgetGovernanceState = {
  budget_assumptions: BudgetAssumptionRow[]
  budget_risks: BudgetRiskRow[]
  management_recommendations: string
  excluded_deferred_demands: ExcludedDemandRow[]
}

export type BudgetHeaderState = {
  budget_cycle: string
  budget_scenario: string
  planning_start_fy: string
  planning_end_fy: string
  funding_ceiling_sar: string
  base_currency: string
  budget_owner_user_id: string
}

export type BudgetLinesWorkspaceProps = {
  budgetSubmissionId: string
  masterTraceId: string
  strategyTitle?: string | null
  recordStatus?: string | null
  isLocked?: boolean
  initialHeader?: Partial<BudgetHeaderState>
  initialLines?: {
    budget_line_id: string
    line_description?: string | null
    cost_classification?: string | null
    line_category?: string | null
    quantity?: number | null
    unit_cost?: number | null
    discount_amount?: number | null
    contingency_pct?: number | null
    tax_rate_pct?: number | null
    company_code?: string | null
    cost_center_code?: string | null
    gl_account_code?: string | null
    wbs_internal_order?: string | null
    funding_source?: string | null
    is_recurring?: boolean | null
    recurrence_frequency?: string | null
    commitment_type?: string | null
    estimate_confidence?: string | null
  }[]
}

function newLine(partial?: Partial<BudgetLineRow>): BudgetLineRow {
  return {
    local_id: crypto.randomUUID(),
    is_persisted: false,
    description: '',
    category: 'Services',
    line_type: 'OPEX',
    quantity: 1,
    unit_cost: 0,
    discount_amount: 0,
    contingency_pct: 10,
    tax_rate_pct: 15,
    company_code: '',
    cost_center_code: '',
    gl_account_code: '',
    wbs_internal_order: '',
    funding_source: '',
    is_recurring: false,
    recurrence_frequency: '',
    commitment_type: 'New',
    estimate_confidence: 'Medium',
    estimate_basis: '',
    expected_commitment_date: '',
    budget_recommendation: '',
    line_fiscal_year: '',
    ...partial,
  }
}

function newAssumption(): BudgetAssumptionRow {
  return { local_id: crypto.randomUUID(), statement: '', owner: '', source: '' }
}
function newBudgetRisk(): BudgetRiskRow {
  return { local_id: crypto.randomUUID(), risk: '', owner: '', rating: 'Medium', response: '' }
}
function newExcludedDemand(): ExcludedDemandRow {
  return { local_id: crypto.randomUUID(), demand_title: '', disposition: '', reason: '' }
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** BR-025: gross → discount → contingency → tax → requested total */
function calcRow(row: BudgetLineRow) {
  const gross = round2((Number(row.quantity) || 0) * (Number(row.unit_cost) || 0))
  const discount = round2(Number(row.discount_amount) || 0)
  const afterDiscount = round2(Math.max(0, gross - discount))
  const contingency = round2(afterDiscount * ((Number(row.contingency_pct) || 0) / 100))
  const net = round2(afterDiscount + contingency)
  const tax = round2(net * ((Number(row.tax_rate_pct) || 0) / 100))
  const total = round2(net + tax)
  return { gross, discount, contingency, net, tax, total }
}

function formatSar(n: number) {
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 2,
  }).format(n || 0)
}

function formatSarCompact(n: number) {
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(n || 0)
}

const CATEGORIES: LineCategory[] = ['License', 'Services', 'Hardware', 'Software', 'Other']
const SCENARIOS = ['Baseline', 'Optimistic', 'Conservative', 'Mandatory Only']
const CURRENCIES = ['SAR', 'USD', 'EUR']
const COMMITMENT_TYPES = ['New', 'Renewal', 'Amendment', 'Contingent']
const FREQUENCIES = ['Monthly', 'Quarterly', 'Annual']
const CONFIDENCE = ['High', 'Medium', 'Low', 'Indicative']
const ESTIMATE_BASIS = ['Supplier Quote', 'Contract Rate', 'Catalogue', 'Benchmark', 'Historical', 'Expert Estimate']
const BUDGET_RECS = ['Recommend Full', 'Recommend Partial', 'Defer', 'Reject', 'Hold']
const RISK_RATINGS = ['High', 'Medium', 'Low']

type BudgetTab = 'lines' | 'funding_profile' | 'governance'
const BUDGET_TABS: BudgetTab[] = ['lines', 'funding_profile', 'governance']

export function BudgetLinesWorkspace({
  budgetSubmissionId,
  masterTraceId,
  strategyTitle,
  recordStatus,
  isLocked,
  initialHeader,
  initialLines,
}: BudgetLinesWorkspaceProps) {
  const t = useTranslations('budget')
  const tc = useTranslations('common')
  const { canSubmitBudgetToCto, canEditBudgetGovernance, currentUser } = useAuth()
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const steps = useFormSteps(BUDGET_TABS, 'lines', isLocked)
  const activeTab = steps.currentId as BudgetTab
  const [governance, setGovernance] = useState<BudgetGovernanceState>({
    budget_assumptions: [],
    budget_risks: [],
    management_recommendations: '',
    excluded_deferred_demands: [],
  })
  const [govSavePending, startGovSave] = useTransition()

  const [header, setHeader] = useState<BudgetHeaderState>({
    budget_cycle: initialHeader?.budget_cycle ?? '',
    budget_scenario: initialHeader?.budget_scenario ?? 'Baseline',
    planning_start_fy: initialHeader?.planning_start_fy ?? '',
    planning_end_fy: initialHeader?.planning_end_fy ?? '',
    funding_ceiling_sar: initialHeader?.funding_ceiling_sar ?? '',
    base_currency: initialHeader?.base_currency ?? 'SAR',
    budget_owner_user_id: initialHeader?.budget_owner_user_id ?? '',
  })

  const [lines, setLines] = useState<BudgetLineRow[]>(() => {
    if (initialLines?.length) {
      return initialLines.map((l) => ({
        local_id: l.budget_line_id,
        is_persisted: true,
        description: l.line_description ?? '',
        category: (l.line_category as LineCategory) ?? 'Services',
        line_type: (l.cost_classification as LineType) ?? 'OPEX',
        quantity: l.quantity ? Number(l.quantity) : 1,
        unit_cost: l.unit_cost ? Number(l.unit_cost) : 0,
        discount_amount: l.discount_amount ? Number(l.discount_amount) : 0,
        contingency_pct: l.contingency_pct ? Number(l.contingency_pct) : 10,
        tax_rate_pct: l.tax_rate_pct ? Number(l.tax_rate_pct) : 15,
        company_code: l.company_code ?? '',
        cost_center_code: l.cost_center_code ?? '',
        gl_account_code: l.gl_account_code ?? '',
        wbs_internal_order: l.wbs_internal_order ?? '',
        funding_source: l.funding_source ?? '',
        is_recurring: l.is_recurring ?? false,
        recurrence_frequency: l.recurrence_frequency ?? '',
        commitment_type: l.commitment_type ?? 'New',
        estimate_confidence: l.estimate_confidence ?? 'Medium',
        estimate_basis: '',
        expected_commitment_date: '',
        budget_recommendation: '',
        line_fiscal_year: '',
      }))
    }
    return [
      newLine({ description: 'Platform licenses', category: 'License', line_type: 'OPEX', unit_cost: 250000 }),
      newLine({ description: 'Implementation services', category: 'Services', line_type: 'CAPEX', quantity: 120, unit_cost: 4500, contingency_pct: 12 }),
    ]
  })

  const [savePending, startSave] = useTransition()
  const [submitPending, startSubmit] = useTransition()
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const busy = savePending || submitPending

  const computed = useMemo(() => {
    const rows = lines.map((row) => ({ ...row, ...calcRow(row) }))
    const totalOpex = round2(rows.filter((r) => r.line_type === 'OPEX').reduce((s, r) => s + r.total, 0))
    const totalCapex = round2(rows.filter((r) => r.line_type === 'CAPEX').reduce((s, r) => s + r.total, 0))
    const totalTax = round2(rows.reduce((s, r) => s + r.tax, 0))
    const totalContingency = round2(rows.reduce((s, r) => s + r.contingency, 0))
    const totalEnvelope = round2(totalOpex + totalCapex)
    const ceiling = Number(header.funding_ceiling_sar) || 0
    const fundingGap = ceiling > 0 ? round2(totalEnvelope - ceiling) : 0
    return { rows, totalOpex, totalCapex, totalTax, totalContingency, totalEnvelope, ceiling, fundingGap }
  }, [lines, header.funding_ceiling_sar])

  function patchHeader(field: keyof BudgetHeaderState) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      if (isLocked) return
      setHeader((prev) => ({ ...prev, [field]: e.target.value }))
      setNotification(null)
    }
  }

  function updateLine(localId: string, patch: Partial<BudgetLineRow>) {
    if (isLocked) return
    setLines((rows) => rows.map((r) => (r.local_id === localId ? { ...r, ...patch } : r)))
    setNotification(null)
  }

  function applySavedIds(lineIds: string[]) {
    setLines((rows) =>
      rows.map((r, i) => ({
        ...r,
        local_id: lineIds[i] ?? r.local_id,
        is_persisted: Boolean(lineIds[i] || r.is_persisted),
      })),
    )
  }

  function buildPayload() {
    return {
      budget_submission_id: budgetSubmissionId,
      header: {
        budget_cycle: header.budget_cycle || undefined,
        budget_scenario: header.budget_scenario || undefined,
        planning_start_fy: header.planning_start_fy ? Number(header.planning_start_fy) : undefined,
        planning_end_fy: header.planning_end_fy ? Number(header.planning_end_fy) : undefined,
        funding_ceiling_sar: header.funding_ceiling_sar ? Number(header.funding_ceiling_sar) : undefined,
        base_currency: header.base_currency || undefined,
        budget_owner_user_id: header.budget_owner_user_id || undefined,
      },
      lines: computed.rows.map((r) => ({
        budget_line_id: r.is_persisted ? r.local_id : undefined,
        line_description: r.description,
        cost_classification: r.line_type,
        line_category: r.category,
        quantity: r.quantity,
        unit_cost: r.unit_cost,
        discount_amount: r.discount_amount,
        gross_amount: r.gross,
        contingency_pct: r.contingency_pct,
        contingency_amount: r.contingency,
        net_before_tax: r.net,
        tax_rate_pct: r.tax_rate_pct,
        tax_amount: r.tax,
        requested_total_sar: r.total,
        company_code: r.company_code || undefined,
        cost_center_code: r.cost_center_code || undefined,
        gl_account_code: r.gl_account_code || undefined,
        wbs_internal_order: r.wbs_internal_order || undefined,
        funding_source: r.funding_source || undefined,
        is_recurring: r.is_recurring,
        recurrence_frequency: r.recurrence_frequency || undefined,
        commitment_type: r.commitment_type || undefined,
        estimate_confidence: r.estimate_confidence || undefined,
      })),
      modified_by: currentUser.email,
    }
  }

  async function persistLines(): Promise<boolean> {
    if (isLocked) return false
    if (!lines.length) {
      setNotification({ type: 'error', message: 'Add at least one budget line before saving.' })
      return false
    }
    const result = await saveBudgetLines(buildPayload())
    if (result.ok) {
      applySavedIds(result.line_ids)
      setNotification({
        type: 'success',
        message: `${result.line_count} budget line(s) saved. Total envelope: ${formatSar(computed.totalEnvelope)}`,
      })
      router.refresh()
      return true
    }
    setNotification({ type: 'error', message: result.error })
    return false
  }

  function handleSave() {
    if (busy || isLocked) return
    setNotification(null)
    startSave(async () => {
      await persistLines()
    })
  }

  function handleNext() {
    if (busy || isLocked) return
    if (activeTab === 'lines' && !lines.length) {
      setNotification({ type: 'error', message: tc('fillRequired') })
      return
    }
    setNotification(null)
    startSave(async () => {
      const ok = await persistLines()
      if (ok) steps.advance()
    })
  }

  function handleSubmitToCto() {
    if (busy || isLocked || !canSubmitBudgetToCto) return
    setNotification(null)
    startSubmit(async () => {
      const saveResult = await saveBudgetLines(buildPayload())
      if (!saveResult.ok) {
        setNotification({ type: 'error', message: saveResult.error })
        return
      }
      applySavedIds(saveResult.line_ids)
      const submitResult = await submitBudget({
        budget_submission_id: budgetSubmissionId,
        submitted_by: currentUser.email,
      })
      if (submitResult.ok) {
        setNotification({
          type: 'success',
          message: 'Budget submitted to CTO for Gate G-B1 review. Record is now locked.',
        })
        router.refresh()
      } else {
        setNotification({ type: 'error', message: submitResult.error })
      }
    })
  }

  function handleSaveGovernance() {
    if (govSavePending || isLocked) return
    startGovSave(async () => {
      const result = await saveBudgetGovernance({
        budget_submission_id: budgetSubmissionId,
        budget_assumptions: governance.budget_assumptions,
        budget_risks: governance.budget_risks,
        management_recommendations: governance.management_recommendations,
        excluded_deferred_demands: governance.excluded_deferred_demands,
        modified_by: currentUser.email,
      })
      if (result.ok) {
        setNotification({ type: 'success', message: 'Budget governance saved.' })
      } else {
        setNotification({ type: 'error', message: result.error })
      }
    })
  }

  // Funding profile: group lines by fiscal year
  const fundingProfile = useMemo(() => {
    const yearMap = new Map<string, { capex: number; opex: number }>()
    for (const row of computed.rows) {
      const fy = row.line_fiscal_year || 'Unassigned'
      const existing = yearMap.get(fy) ?? { capex: 0, opex: 0 }
      if (row.line_type === 'CAPEX') existing.capex = round2(existing.capex + row.total)
      else existing.opex = round2(existing.opex + row.total)
      yearMap.set(fy, existing)
    }
    return Array.from(yearMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fy, { capex, opex }]) => ({
        fy,
        capex,
        opex,
        total: round2(capex + opex),
      }))
  }, [computed.rows])

  return (
    <div className="space-y-6">
      <div className="space-y-4 border-b border-border pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <Link
              href="/budget"
              className="inline-flex items-center gap-1 text-xs font-semibold text-diriyah-accent no-underline hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              Back to Budget
            </Link>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
              PI-05 · Commercial &amp; Budgeting
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-text">Budget Lines Grid</h1>
            <p className="max-w-2xl text-sm text-text-muted">
              Header, accounting dimensions, and live CAPEX/OPEX/tax roll-ups (BR-025).
              {strategyTitle ? (
                <>
                  {' '}
                  Strategy: <span className="font-medium text-text">{strategyTitle}</span>
                </>
              ) : null}
            </p>
          </div>
          <Link
            href={`/budget/${encodeURIComponent(budgetSubmissionId)}/consolidation`}
            className="btn h-9 shrink-0 self-start border-border bg-white px-3 text-xs no-underline"
          >
            Open Consolidation Pack
          </Link>
        </div>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-white px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Budget Submission
            </dt>
            <dd className="mt-0.5 font-mono text-xs font-semibold text-diriyah-primary">
              {budgetSubmissionId}
            </dd>
          </div>
          <div className="rounded-md border border-border bg-white px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Master Trace
            </dt>
            <dd className="mt-0.5 font-mono text-xs font-semibold text-diriyah-primary">
              {masterTraceId}
            </dd>
          </div>
          {recordStatus ? (
            <div className="rounded-md border border-border bg-white px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Status
              </dt>
              <dd className="mt-0.5 text-xs font-semibold text-text">{recordStatus}</dd>
            </div>
          ) : null}
        </dl>
      </div>

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
          {notification.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <p>{notification.message}</p>
        </div>
      )}

      <section className="overflow-hidden rounded-md border border-border bg-white p-0">
        <div className="border-b border-border bg-diriyah-bg-alt/80 px-6 py-4">
          <h2 className="text-lg font-semibold text-text">Submission Header</h2>
          <p className="text-sm text-text-muted">Cycle, scenario, planning years, and funding ceiling.</p>
        </div>
        <div className="grid gap-5 px-6 py-6 md:grid-cols-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text">Budget Cycle</span>
            <input className="input-base" value={header.budget_cycle} onChange={patchHeader('budget_cycle')} placeholder="e.g. FY2027" disabled={isLocked} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text">Scenario</span>
            <select className="input-base" value={header.budget_scenario} onChange={patchHeader('budget_scenario')} disabled={isLocked}>
              {SCENARIOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text">Currency</span>
            <select className="input-base" value={header.base_currency} onChange={patchHeader('base_currency')} disabled={isLocked}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text">Planning Start FY</span>
            <input type="number" min={2020} max={2050} className="input-base" value={header.planning_start_fy} onChange={patchHeader('planning_start_fy')} disabled={isLocked} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text">Planning End FY</span>
            <input type="number" min={2020} max={2050} className="input-base" value={header.planning_end_fy} onChange={patchHeader('planning_end_fy')} disabled={isLocked} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text">Funding Ceiling (SAR)</span>
            <input type="number" min={0} className="input-base tabular-nums" value={header.funding_ceiling_sar} onChange={patchHeader('funding_ceiling_sar')} disabled={isLocked} />
          </label>
          <label className="block space-y-1.5 md:col-span-3">
            <span className="text-sm font-medium text-text">Budget Owner</span>
            <input className="input-base" value={header.budget_owner_user_id} onChange={patchHeader('budget_owner_user_id')} placeholder="user@diriyah.sa" disabled={isLocked} />
          </label>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Total OPEX" value={formatSarCompact(computed.totalOpex)} tone="opex" />
        <MetricCard label="Total CAPEX" value={formatSarCompact(computed.totalCapex)} tone="capex" />
        <MetricCard
          label="Tax + Contingency"
          value={formatSarCompact(computed.totalTax)}
          hint={`Contingency ${formatSarCompact(computed.totalContingency)}`}
          tone="opex"
        />
        <MetricCard
          label={computed.ceiling > 0 ? (computed.fundingGap > 0 ? 'Over Ceiling' : 'Within Ceiling') : 'Total Envelope'}
          value={computed.ceiling > 0 ? formatSarCompact(Math.abs(computed.fundingGap)) : formatSarCompact(computed.totalEnvelope)}
          tone={computed.ceiling > 0 && computed.fundingGap > 0 ? 'capex' : 'envelope'}
        />
      </div>

      <FormStepRail
        steps={BUDGET_TABS.map((tab) => ({
          id: tab,
          label: tab === 'lines' ? t('linesTab') : tab === 'funding_profile' ? t('fundingTab') : t('governanceTab'),
        }))}
        currentId={activeTab}
        maxReached={steps.maxReached}
        onSelect={(id) => steps.select(id)}
      />

      {activeTab === 'lines' && (
      <section className="overflow-hidden rounded-md border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border bg-diriyah-bg-alt/80 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-text">
              Cost Lines <RequiredMark />
            </h2>
            <p className="text-xs text-text-muted">
              total = (qty × unit − discount + contingency) + tax
            </p>
          </div>
          {!isLocked && (
            <button type="button" className="btn h-9 border-border bg-white px-3 text-xs" onClick={() => setLines((rows) => [...rows, newLine()])}>
              <Plus className="h-3.5 w-3.5" />
              {t('addLine')}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse font-mono text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-muted">
                <th className="w-8 px-2 py-2.5" />
                <th className="px-3 py-2.5 font-semibold">Description</th>
                <th className="px-3 py-2.5 font-semibold">Type</th>
                <th className="px-3 py-2.5 font-semibold">Qty</th>
                <th className="px-3 py-2.5 font-semibold">Unit</th>
                <th className="px-3 py-2.5 font-semibold">Gross</th>
                <th className="px-3 py-2.5 font-semibold">Cont. %</th>
                <th className="px-3 py-2.5 font-semibold">Tax %</th>
                <th className="px-3 py-2.5 font-semibold">Total</th>
                <th className="px-3 py-2.5"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {computed.rows.map((row, idx) => {
                const open = expandedId === row.local_id
                return (
                  <Fragment key={row.local_id}>
                    <tr className={cn('border-b border-border/60', idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/30')}>
                      <td className="px-2 py-1.5">
                        <button type="button" onClick={() => setExpandedId(open ? null : row.local_id)} className="inline-flex h-8 w-8 items-center justify-center rounded text-text-muted hover:bg-diriyah-bg-alt" aria-expanded={open}>
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-1.5">
                        <input className="h-9 w-full min-w-[160px] rounded border-0 bg-transparent px-1 text-[13px] text-text focus:bg-white focus:ring-1 focus:ring-diriyah-primary/40" value={row.description} onChange={(e) => updateLine(row.local_id, { description: e.target.value })} disabled={isLocked} />
                      </td>
                      <td className="px-3 py-1.5">
                        <select className="h-9 rounded border-0 bg-transparent text-[13px] text-text" value={row.line_type} onChange={(e) => updateLine(row.local_id, { line_type: e.target.value as LineType })} disabled={isLocked}>
                          <option value="OPEX">OPEX</option>
                          <option value="CAPEX">CAPEX</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" min={0} className="h-9 w-20 rounded border-0 bg-transparent text-right tabular-nums" value={row.quantity} onChange={(e) => updateLine(row.local_id, { quantity: Number(e.target.value) || 0 })} disabled={isLocked} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" min={0} className="h-9 w-28 rounded border-0 bg-transparent text-right tabular-nums" value={row.unit_cost} onChange={(e) => updateLine(row.local_id, { unit_cost: Number(e.target.value) || 0 })} disabled={isLocked} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-text-muted">{formatSar(row.gross)}</td>
                      <td className="px-3 py-1.5">
                        <input type="number" min={0} max={100} className="h-9 w-16 rounded border-0 bg-transparent text-right tabular-nums" value={row.contingency_pct} onChange={(e) => updateLine(row.local_id, { contingency_pct: Number(e.target.value) || 0 })} disabled={isLocked} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" min={0} max={100} className="h-9 w-16 rounded border-0 bg-transparent text-right tabular-nums" value={row.tax_rate_pct} onChange={(e) => updateLine(row.local_id, { tax_rate_pct: Number(e.target.value) || 0 })} disabled={isLocked} />
                      </td>
                      <td className="px-3 py-1.5 text-right font-sans text-sm font-semibold tabular-nums text-diriyah-primary">{formatSar(row.total)}</td>
                      <td className="px-2 py-1.5">
                        {!isLocked && (
                          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded text-diriyah-red hover:bg-diriyah-red/10 disabled:opacity-30" disabled={lines.length <= 1} onClick={() => setLines((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.local_id !== row.local_id)))} aria-label="Remove line">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-border bg-diriyah-bg-alt/40">
                        <td colSpan={10} className="px-6 py-4">
                          <div className="grid gap-4 md:grid-cols-4 font-sans">
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Category</span>
                              <select className="input-base h-9" value={row.category} onChange={(e) => updateLine(row.local_id, { category: e.target.value as LineCategory })} disabled={isLocked}>
                                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Discount</span>
                              <input type="number" min={0} className="input-base h-9 tabular-nums" value={row.discount_amount} onChange={(e) => updateLine(row.local_id, { discount_amount: Number(e.target.value) || 0 })} disabled={isLocked} />
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Company Code</span>
                              <input className="input-base h-9" value={row.company_code} onChange={(e) => updateLine(row.local_id, { company_code: e.target.value })} disabled={isLocked} />
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Cost Center</span>
                              <input className="input-base h-9" value={row.cost_center_code} onChange={(e) => updateLine(row.local_id, { cost_center_code: e.target.value })} disabled={isLocked} />
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">GL Account</span>
                              <input className="input-base h-9" value={row.gl_account_code} onChange={(e) => updateLine(row.local_id, { gl_account_code: e.target.value })} disabled={isLocked} />
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">WBS / Internal Order</span>
                              <input className="input-base h-9" value={row.wbs_internal_order} onChange={(e) => updateLine(row.local_id, { wbs_internal_order: e.target.value })} disabled={isLocked} />
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Funding Source</span>
                              <input className="input-base h-9" value={row.funding_source} onChange={(e) => updateLine(row.local_id, { funding_source: e.target.value })} disabled={isLocked} />
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Commitment Type</span>
                              <select className="input-base h-9" value={row.commitment_type} onChange={(e) => updateLine(row.local_id, { commitment_type: e.target.value })} disabled={isLocked}>
                                {COMMITMENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </label>
                            <label className="flex items-center gap-2 pt-5">
                              <input type="checkbox" checked={row.is_recurring} onChange={(e) => updateLine(row.local_id, { is_recurring: e.target.checked })} disabled={isLocked} className="accent-[var(--diriyah-primary)]" />
                              <span className="text-xs font-medium text-text">Recurring</span>
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Frequency</span>
                              <select className="input-base h-9" value={row.recurrence_frequency} onChange={(e) => updateLine(row.local_id, { recurrence_frequency: e.target.value })} disabled={isLocked}>
                                <option value="">Select…</option>
                                {FREQUENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Estimate Confidence</span>
                              <select className="input-base h-9" value={row.estimate_confidence} onChange={(e) => updateLine(row.local_id, { estimate_confidence: e.target.value })} disabled={isLocked}>
                                {CONFIDENCE.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </label>
                            {/* G-31 additions */}
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Estimate Basis</span>
                              <select className="input-base h-9" value={row.estimate_basis} onChange={(e) => updateLine(row.local_id, { estimate_basis: e.target.value })} disabled={isLocked}>
                                <option value="">Select…</option>
                                {ESTIMATE_BASIS.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Expected Commitment Date</span>
                              <input type="date" className="input-base h-9" value={row.expected_commitment_date} onChange={(e) => updateLine(row.local_id, { expected_commitment_date: e.target.value })} disabled={isLocked} />
                            </label>
                            <label className="block space-y-1">
                              <span className="text-xs font-medium text-text">Fiscal Year</span>
                              <input className="input-base h-9" value={row.line_fiscal_year} onChange={(e) => updateLine(row.local_id, { line_fiscal_year: e.target.value })} disabled={isLocked} placeholder="e.g. FY2027" />
                            </label>
                            {canEditBudgetGovernance && (
                              <label className="block space-y-1">
                                <span className="text-xs font-medium text-text">Budget Recommendation</span>
                                <select className="input-base h-9" value={row.budget_recommendation} onChange={(e) => updateLine(row.local_id, { budget_recommendation: e.target.value })} disabled={isLocked}>
                                  <option value="">Select…</option>
                                  {BUDGET_RECS.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </label>
                            )}
                            <p className="md:col-span-4 text-xs text-text-muted">
                              Net {formatSar(row.net)} · Tax {formatSar(row.tax)} · Contingency {formatSar(row.contingency)}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Funding Profile Tab */}
      {activeTab === 'funding_profile' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="border-b border-border bg-diriyah-bg-alt/80 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text">Funding Profile by Fiscal Year</h2>
                <p className="text-sm text-text-muted">Auto-calculated from budget lines grouped by fiscal year.</p>
              </div>
              {computed.ceiling > 0 && (
                <span className={cn(
                  'rounded-full px-3 py-1 text-xs font-bold',
                  computed.fundingGap <= 0 ? 'bg-diriyah-green/10 text-diriyah-green' : 'bg-diriyah-red/10 text-diriyah-red',
                )}>
                  {computed.fundingGap <= 0 ? '✓ Within Envelope' : `⚠ Over Budget by ${formatSar(computed.fundingGap)}`}
                </span>
              )}
            </div>
            {computed.ceiling > 0 && (
              <p className="mt-1 text-xs text-text-muted">
                Funding ceiling: <span className="font-semibold tabular-nums text-diriyah-primary">{formatSar(computed.ceiling)}</span>
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-3 font-semibold">Fiscal Year</th>
                  <th className="px-5 py-3 text-right font-semibold">CAPEX (SAR)</th>
                  <th className="px-5 py-3 text-right font-semibold">OPEX (SAR)</th>
                  <th className="px-5 py-3 text-right font-semibold">Total (SAR)</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {fundingProfile.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-text-muted">Assign fiscal years to budget lines to see the profile.</td></tr>
                ) : (
                  fundingProfile.map((row, idx) => (
                    <tr key={row.fy} className={cn('border-b border-border/60', idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/30')}>
                      <td className="px-5 py-3 font-semibold text-diriyah-primary">{row.fy}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-diriyah-green">{formatSar(row.capex)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-diriyah-primary">{formatSar(row.opex)}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-diriyah-primary">{formatSar(row.total)}</td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-diriyah-green/10 px-2.5 py-0.5 text-[11px] font-semibold text-diriyah-green">Included</span>
                      </td>
                    </tr>
                  ))
                )}
                {fundingProfile.length > 0 && (
                  <tr className="border-t-2 border-diriyah-primary/20 bg-diriyah-bg-alt font-semibold">
                    <td className="px-5 py-3 text-xs uppercase tracking-wide text-text-muted">Grand Total</td>
                    <td className="px-5 py-3 text-right tabular-nums text-diriyah-green">{formatSar(computed.totalCapex)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-diriyah-primary">{formatSar(computed.totalOpex)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-diriyah-primary">{formatSar(computed.totalEnvelope)}</td>
                    <td className="px-5 py-3" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Governance Tab */}
      {activeTab === 'governance' && (
        <div className="space-y-6">
          {/* Budget Assumptions (BUD-029) */}
          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="flex items-center justify-between border-b border-border bg-diriyah-bg-alt/80 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text">Budget Assumptions <span className="text-xs font-normal text-diriyah-accent">(BUD-029)</span></h2>
                <p className="text-sm text-text-muted">Key assumptions underpinning the budget.</p>
              </div>
              {!isLocked && (
                <button type="button" className="btn h-9 border-border bg-white px-3 text-xs" onClick={() => setGovernance((g) => ({ ...g, budget_assumptions: [...g.budget_assumptions, newAssumption()] }))}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              )}
            </div>
            {governance.budget_assumptions.length === 0 ? (
              <p className="px-6 py-6 text-sm text-text-muted">No assumptions recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3 font-semibold">Statement</th>
                      <th className="w-44 px-4 py-3 font-semibold">Owner</th>
                      <th className="w-44 px-4 py-3 font-semibold">Source</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {governance.budget_assumptions.map((row) => (
                      <tr key={row.local_id} className="border-b border-border/80 last:border-0">
                        <td className="px-4 py-2"><input className="input-base h-9" value={row.statement} onChange={(e) => setGovernance((g) => ({ ...g, budget_assumptions: g.budget_assumptions.map((x) => x.local_id === row.local_id ? { ...x, statement: e.target.value } : x) }))} disabled={isLocked} /></td>
                        <td className="px-4 py-2"><input className="input-base h-9" value={row.owner} onChange={(e) => setGovernance((g) => ({ ...g, budget_assumptions: g.budget_assumptions.map((x) => x.local_id === row.local_id ? { ...x, owner: e.target.value } : x) }))} disabled={isLocked} /></td>
                        <td className="px-4 py-2"><input className="input-base h-9" value={row.source} onChange={(e) => setGovernance((g) => ({ ...g, budget_assumptions: g.budget_assumptions.map((x) => x.local_id === row.local_id ? { ...x, source: e.target.value } : x) }))} disabled={isLocked} /></td>
                        <td className="px-4 py-2">{!isLocked && <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded text-diriyah-red hover:bg-diriyah-red/10" onClick={() => setGovernance((g) => ({ ...g, budget_assumptions: g.budget_assumptions.filter((x) => x.local_id !== row.local_id) }))}><Trash2 className="h-4 w-4" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Budget Risks (BUD-030) */}
          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="flex items-center justify-between border-b border-border bg-diriyah-bg-alt/80 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text">Budget Risks <span className="text-xs font-normal text-diriyah-accent">(BUD-030)</span></h2>
                <p className="text-sm text-text-muted">Risks to budget delivery and recommended responses.</p>
              </div>
              {!isLocked && (
                <button type="button" className="btn h-9 border-border bg-white px-3 text-xs" onClick={() => setGovernance((g) => ({ ...g, budget_risks: [...g.budget_risks, newBudgetRisk()] }))}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              )}
            </div>
            {governance.budget_risks.length === 0 ? (
              <p className="px-6 py-6 text-sm text-text-muted">No budget risks recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3 font-semibold">Risk</th>
                      <th className="w-40 px-4 py-3 font-semibold">Owner</th>
                      <th className="w-28 px-4 py-3 font-semibold">Rating</th>
                      <th className="w-48 px-4 py-3 font-semibold">Response</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {governance.budget_risks.map((row) => (
                      <tr key={row.local_id} className="border-b border-border/80 last:border-0">
                        <td className="px-4 py-2"><input className="input-base h-9" value={row.risk} onChange={(e) => setGovernance((g) => ({ ...g, budget_risks: g.budget_risks.map((x) => x.local_id === row.local_id ? { ...x, risk: e.target.value } : x) }))} disabled={isLocked} /></td>
                        <td className="px-4 py-2"><input className="input-base h-9" value={row.owner} onChange={(e) => setGovernance((g) => ({ ...g, budget_risks: g.budget_risks.map((x) => x.local_id === row.local_id ? { ...x, owner: e.target.value } : x) }))} disabled={isLocked} /></td>
                        <td className="px-4 py-2">
                          <select className="input-base h-9" value={row.rating} onChange={(e) => setGovernance((g) => ({ ...g, budget_risks: g.budget_risks.map((x) => x.local_id === row.local_id ? { ...x, rating: e.target.value as BudgetRiskRow['rating'] } : x) }))} disabled={isLocked}>
                            {RISK_RATINGS.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2"><input className="input-base h-9" value={row.response} onChange={(e) => setGovernance((g) => ({ ...g, budget_risks: g.budget_risks.map((x) => x.local_id === row.local_id ? { ...x, response: e.target.value } : x) }))} disabled={isLocked} /></td>
                        <td className="px-4 py-2">{!isLocked && <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded text-diriyah-red hover:bg-diriyah-red/10" onClick={() => setGovernance((g) => ({ ...g, budget_risks: g.budget_risks.filter((x) => x.local_id !== row.local_id) }))}><Trash2 className="h-4 w-4" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Management Recommendations (BUD-031) */}
          <section className="overflow-hidden rounded-md border border-border bg-white p-4">
            <h2 className="mb-1 text-base font-semibold text-text">Management Recommendations <span className="text-xs font-normal text-diriyah-accent">(BUD-031)</span></h2>
            <p className="mb-3 text-sm text-text-muted">Overall CTO / Finance Director recommendation narrative.</p>
            <textarea
              className="input-base min-h-32 w-full py-3"
              value={governance.management_recommendations}
              onChange={(e) => setGovernance((g) => ({ ...g, management_recommendations: e.target.value }))}
              disabled={isLocked}
              placeholder="Enter management recommendation narrative…"
            />
          </section>

          {/* Excluded / Deferred Demands (BUD-032) */}
          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="flex items-center justify-between border-b border-border bg-diriyah-bg-alt/80 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text">Excluded / Deferred Demands <span className="text-xs font-normal text-diriyah-accent">(BUD-032)</span></h2>
                <p className="text-sm text-text-muted">Demands considered but excluded from this budget cycle.</p>
              </div>
              {!isLocked && (
                <button type="button" className="btn h-9 border-border bg-white px-3 text-xs" onClick={() => setGovernance((g) => ({ ...g, excluded_deferred_demands: [...g.excluded_deferred_demands, newExcludedDemand()] }))}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              )}
            </div>
            {governance.excluded_deferred_demands.length === 0 ? (
              <p className="px-6 py-6 text-sm text-text-muted">No excluded demands recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3 font-semibold">Demand Title</th>
                      <th className="w-44 px-4 py-3 font-semibold">Disposition</th>
                      <th className="px-4 py-3 font-semibold">Reason</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {governance.excluded_deferred_demands.map((row) => (
                      <tr key={row.local_id} className="border-b border-border/80 last:border-0">
                        <td className="px-4 py-2"><input className="input-base h-9" value={row.demand_title} onChange={(e) => setGovernance((g) => ({ ...g, excluded_deferred_demands: g.excluded_deferred_demands.map((x) => x.local_id === row.local_id ? { ...x, demand_title: e.target.value } : x) }))} disabled={isLocked} /></td>
                        <td className="px-4 py-2"><input className="input-base h-9" value={row.disposition} onChange={(e) => setGovernance((g) => ({ ...g, excluded_deferred_demands: g.excluded_deferred_demands.map((x) => x.local_id === row.local_id ? { ...x, disposition: e.target.value } : x) }))} disabled={isLocked} placeholder="Defer / Reject / Hold" /></td>
                        <td className="px-4 py-2"><input className="input-base h-9" value={row.reason} onChange={(e) => setGovernance((g) => ({ ...g, excluded_deferred_demands: g.excluded_deferred_demands.map((x) => x.local_id === row.local_id ? { ...x, reason: e.target.value } : x) }))} disabled={isLocked} /></td>
                        <td className="px-4 py-2">{!isLocked && <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded text-diriyah-red hover:bg-diriyah-red/10" onClick={() => setGovernance((g) => ({ ...g, excluded_deferred_demands: g.excluded_deferred_demands.filter((x) => x.local_id !== row.local_id) }))}><Trash2 className="h-4 w-4" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {!isLocked && (
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary inline-flex h-11 items-center gap-2 px-6 text-sm disabled:opacity-50" disabled={govSavePending} onClick={handleSaveGovernance}>
                {govSavePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {govSavePending ? 'Saving…' : 'Save Governance'}
              </button>
            </div>
          )}
        </div>
      )}

      {!isLocked && (
        <FormStepActions
          isFirst={steps.isFirst}
          isLast={steps.isLast}
          onBack={steps.goBack}
          onNext={handleNext}
          nextDisabled={activeTab === 'lines' && !lines.length}
          nextPending={savePending}
          hideNext={steps.isLast}
        >
          {steps.isLast ? (
            <>
              {!canSubmitBudgetToCto && (
                <p className="text-xs text-text-muted sm:me-auto">
                  &ldquo;Submit to CTO&rdquo; is visible to Commercial &amp; Budgeting role only (switch to Rami Noor).
                </p>
              )}
              <Link
                href={`/budget/${encodeURIComponent(budgetSubmissionId)}/consolidation`}
                className="btn h-11 border-border bg-white px-6 text-sm no-underline"
              >
                Open Consolidation Pack
              </Link>
              <button type="button" className="btn h-11 border-border bg-white px-6 text-sm disabled:opacity-50" disabled={busy} onClick={handleSave}>
                {savePending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {savePending ? t('saving') : t('saveBudget')}
              </button>
              {canSubmitBudgetToCto && (
                <button type="button" className="btn btn-primary inline-flex h-11 items-center gap-2 px-6 text-sm disabled:opacity-50" data-testid="budget-submit-cto" disabled={busy} onClick={handleSubmitToCto}>
                  {submitPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitPending ? t('submitting') : t('submitBudget')}
                </button>
              )}
            </>
          ) : null}
        </FormStepActions>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone: 'opex' | 'capex' | 'envelope'
}) {
  const accent =
    tone === 'opex'
      ? 'border-diriyah-primary/25 bg-white'
      : tone === 'capex'
        ? 'border-diriyah-green/25 bg-white'
        : 'border-diriyah-accent/30 bg-gradient-to-br from-white to-diriyah-bg-alt'
  const valueColor =
    tone === 'opex' ? 'text-diriyah-primary' : tone === 'capex' ? 'text-diriyah-green' : 'text-diriyah-accent'

  return (
    <div className={cn('rounded-md border px-4 py-3', accent)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className={cn('mt-1 text-sm font-semibold tabular-nums tracking-tight sm:text-base', valueColor)}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] tabular-nums text-text-muted">{hint}</p> : null}
    </div>
  )
}
