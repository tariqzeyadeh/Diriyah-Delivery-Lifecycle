'use client'

import { useMemo, useState, useTransition, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  Lock,
  Send,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/src/providers/AuthProvider'
import { useRouter } from '@/src/i18n/navigation'
import { cn } from '@/lib/utils'
import { saveDemand, submitDemand } from '@/src/actions/demand'
import {
  FormStepActions,
  FormStepRail,
  RequiredMark,
  useFormSteps,
} from '@/components/atlas/forms/FormStepper'
import { OfficialTag, WorkspaceMetaCard, WorkspaceMetaGrid } from '@/components/atlas/records'
import { recordStatusTagTone, sentenceCaseLabel } from '@/lib/atlas/record-label'
import { isDemandAwaitingOwner } from '@/lib/atlas/demand-handoff'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Tab =
  | 'identity'
  | 'case'
  | 'alignment'
  | 'options'
  | 'technical'
  | 'finance'
  | 'registers'

export type DemandOptionRow = {
  local_id: string
  option_description: string
  three_year_cost: number
  delivery_time: string
  risk_score: number
  weighted_score: number
  is_do_nothing: boolean
}

export type DemandBenefitRow = {
  local_id: string
  benefit_type: string
  benefit_description: string
  benefit_baseline: string
  benefit_target: string
  annual_financial_benefit_sar: number
  benefit_realization_start: string
  benefit_owner_user_id: string
  benefit_kpi_id: string
}

export type DemandRaidcRow = {
  local_id: string
  type: 'RISK' | 'ISSUE' | 'ASSUMPTION' | 'DEPENDENCY' | 'CONSTRAINT'
  description: string
  owner: string
  probability: string
  impact: string
  exposure_score: string
  response: string
  status: string
  due_date: string
}

// DEM-021
export type BaselineEvidenceRow = {
  local_id: string
  metric_name: string
  value: number
  unit: string
  period: string
  source: string
}

// DEM-031
export type BusinessRequirementRow = {
  local_id: string
  req_id: string
  statement: string
  priority: 'Must Have' | 'Should Have' | 'Could Have' | "Won't Have"
}

// DEM-078
export type KeyMilestoneRow = {
  local_id: string
  name: string
  target_date: string
  type: string
}

// DEM-090
export type StakeholderRow = {
  local_id: string
  party: string
  role: string
  influence: 'High' | 'Medium' | 'Low'
  engagement: 'Champion' | 'Supporter' | 'Neutral' | 'Resistant'
}

export type DemandFormState = {
  demand_title: string
  demand_type: string
  demand_category: string
  demand_subcategory: string
  requesting_department_id: string
  requester_user_id: string
  business_owner_user_id: string
  executive_sponsor_user_id: string
  strategic_classification: string
  origin_channel: string
  mandatory_driver: string
  problem_opportunity_statement: string
  current_state_description: string
  urgency: string
  business_impact: string
  do_nothing_impact: string
  business_objectives: string
  expected_outcomes: string
  success_criteria: string
  beneficiary_groups: string
  scope_in: string
  scope_out: string
  high_level_deliverables: string
  ad_hoc_justification: string
  strategy_id: string
  objective_ids: string[]
  kpi_ids: string[]
  strategic_contribution_statement: string
  architecture_impact: boolean
  architecture_assessment_summary: string
  security_privacy_impact: boolean
  security_requirements: string
  data_governance_impact: boolean
  hosting_requirement: string
  continuity_criticality: string
  recovery_time_objective: string
  recovery_point_objective: string
  indicative_one_time_cost_sar: string
  indicative_recurring_cost_sar: string
  tco_sar: string
  cost_estimate_basis: string
  estimate_confidence: string
  financial_evaluation_years: string
  discount_rate_pct: string
  npv_sar: string
  irr_pct: string
  roi_pct: string
  payback_period_months: string
  requested_start_date: string
  required_by_date: string
  delivery_mode: string
  operating_owner_unit_id: string
  support_model: string
  procurement_required: boolean
  indicative_sourcing_route: string
  preferred_option_id: string
  preferred_option_rationale: string
}

type StrategyOption = {
  strategy_id: string
  strategy_title: string
  objectives: {
    objective_id: string
    objective_name: string
    kpis: { kpi_id: string; kpi_name: string }[]
  }[]
}

type DemandWorkspaceProps = {
  demandId: string
  masterTraceId: string
  entryRoute: 'STRATEGIC' | 'ADHOC'
  initialForm: DemandFormState
  strategies: StrategyOption[]
  initialOptions?: DemandOptionRow[]
  initialBenefits?: DemandBenefitRow[]
  initialRaidc?: DemandRaidcRow[]
  initialBaselineEvidence?: BaselineEvidenceRow[]
  initialBusinessRequirements?: BusinessRequirementRow[]
  initialKeyMilestones?: KeyMilestoneRow[]
  initialStakeholders?: StakeholderRow[]
  recordStatus?: string | null
  isLocked?: boolean
  submittedBy?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEMAND_TAB_IDS: Tab[] = ['identity', 'case', 'alignment', 'options', 'technical', 'finance', 'registers']
const OWNER_ONLY_TABS: Tab[] = ['options', 'technical', 'finance', 'registers']
const DEMAND_TAB_LABELS: Record<Tab, string> = {
  identity: 'Identity',
  case: 'Business Case',
  alignment: 'Alignment',
  options: 'Options',
  technical: 'Technical',
  finance: 'Finance & Delivery',
  registers: 'Benefits & RAIDC',
}

const URGENCY_OPTIONS = ['Critical', 'High', 'Medium', 'Low']
const IMPACT_OPTIONS = ['Critical', 'High', 'Medium', 'Low']
const DEMAND_TYPES = ['New Capability', 'Enhancement', 'Compliance', 'Replacement', 'Research']
const DEMAND_CATEGORIES = ['Digital', 'Infrastructure', 'Security', 'Data', 'Applications', 'Operations']
const CLASSIFICATIONS = ['Strategic', 'Enabling', 'Mandatory', 'Discretionary']
const ORIGIN_CHANNELS = ['Strategy Cascade', 'Business Unit', 'Regulatory', 'Incident', 'Executive']
const CONFIDENCE_OPTIONS = ['High', 'Medium', 'Low', 'Indicative']
const DELIVERY_MODES = ['In-house', 'Outsourced', 'Hybrid', 'Managed Service']
const HOSTING_OPTIONS = ['On-premise', 'Private Cloud', 'Public Cloud', 'SaaS', 'Hybrid']
const CONTINUITY_OPTIONS = ['Mission Critical', 'Business Critical', 'Important', 'Standard']
const SOURCING_ROUTES = ['Open Tender', 'Limited Tender', 'Direct Award', 'Existing Contract', 'Framework']
const BENEFIT_TYPES = ['Financial', 'Efficiency', 'Risk Reduction', 'Citizen Experience', 'Compliance']
const RAIDC_TYPES: DemandRaidcRow['type'][] = ['RISK', 'ISSUE', 'ASSUMPTION', 'DEPENDENCY', 'CONSTRAINT']
const PROBABILITY_OPTIONS = ['Low', 'Medium', 'High', 'Very High']
const RAIDC_IMPACT_OPTIONS = ['Low', 'Medium', 'High', 'Critical']
const RAIDC_STATUS = ['Open', 'In Progress', 'Mitigated', 'Closed']
const REQ_PRIORITY = ['Must Have', 'Should Have', 'Could Have', "Won't Have"] as const
const MILESTONE_TYPES = ['Planning', 'Design', 'Procurement', 'Implementation', 'Acceptance', 'Go-Live']
const INFLUENCE_OPTIONS = ['High', 'Medium', 'Low']
const ENGAGEMENT_OPTIONS = ['Champion', 'Supporter', 'Neutral', 'Resistant']

function calcCompleteness(form: DemandFormState): number {
  const checks: boolean[] = [
    form.demand_title.trim().length > 0,
    form.demand_type.trim().length > 0,
    form.demand_category.trim().length > 0,
    form.requesting_department_id.trim().length > 0,
    form.business_owner_user_id.trim().length > 0,
    form.problem_opportunity_statement.trim().length > 0,
    form.urgency.trim().length > 0,
    form.business_impact.trim().length > 0,
    form.do_nothing_impact.trim().length > 0,
    form.business_objectives.trim().length > 0,
    form.expected_outcomes.trim().length > 0,
    form.success_criteria.trim().length > 0,
    form.scope_in.trim().length > 0,
    form.scope_out.trim().length > 0,
    form.strategy_id.trim().length > 0 || form.ad_hoc_justification.trim().length > 0,
    form.hosting_requirement.trim().length > 0,
    form.indicative_one_time_cost_sar.trim().length > 0,
    form.delivery_mode.trim().length > 0,
    form.requested_start_date.trim().length > 0,
    form.required_by_date.trim().length > 0,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

function newOption(): DemandOptionRow {
  return {
    local_id: crypto.randomUUID(),
    option_description: '',
    three_year_cost: 0,
    delivery_time: '',
    risk_score: 0,
    weighted_score: 0,
    is_do_nothing: false,
  }
}

function newBenefit(): DemandBenefitRow {
  return {
    local_id: crypto.randomUUID(),
    benefit_type: 'Financial',
    benefit_description: '',
    benefit_baseline: '',
    benefit_target: '',
    annual_financial_benefit_sar: 0,
    benefit_realization_start: '',
    benefit_owner_user_id: '',
    benefit_kpi_id: '',
  }
}

function newRaidc(): DemandRaidcRow {
  return {
    local_id: crypto.randomUUID(),
    type: 'RISK',
    description: '',
    owner: '',
    probability: 'Medium',
    impact: 'Medium',
    exposure_score: '',
    response: '',
    status: 'Open',
    due_date: '',
  }
}

function newBaselineEvidence(): BaselineEvidenceRow {
  return { local_id: crypto.randomUUID(), metric_name: '', value: 0, unit: '', period: '', source: '' }
}

let _reqSeq = 1
function newBusinessReq(): BusinessRequirementRow {
  return { local_id: crypto.randomUUID(), req_id: `REQ-${String(_reqSeq++).padStart(3, '0')}`, statement: '', priority: 'Must Have' }
}

function newKeyMilestone(): KeyMilestoneRow {
  return { local_id: crypto.randomUUID(), name: '', target_date: '', type: 'Planning' }
}

function newStakeholder(): StakeholderRow {
  return { local_id: crypto.randomUUID(), party: '', role: '', influence: 'Medium', engagement: 'Neutral' }
}

function formatSar(n: number) {
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(n || 0)
}

function linesToArray(s: string): string[] {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function numOrUndef(s: string): number | undefined {
  if (!s.trim()) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function persistedId(localId: string): string | undefined {
  // New client rows use crypto.randomUUID(); persisted rows use OPT-/BEN-/DRD- ids.
  const isClientUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      localId,
    )
  return isClientUuid ? undefined : localId
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DemandWorkspace({
  demandId,
  masterTraceId,
  entryRoute: _entryRoute,
  initialForm,
  strategies,
  initialOptions,
  initialBenefits,
  initialRaidc,
  initialBaselineEvidence,
  initialBusinessRequirements,
  initialKeyMilestones,
  initialStakeholders,
  recordStatus,
  isLocked,
  submittedBy,
}: DemandWorkspaceProps) {
  const t = useTranslations('demand')
  const tc = useTranslations('common')
  const { canEditDemand, currentUser, isRole } = useAuth()
  const router = useRouter()
  const isBusinessOwner = isRole('Business Owner')
  const awaitingOwner = isDemandAwaitingOwner(recordStatus)
  const ownerHandoffLock = awaitingOwner && !isBusinessOwner
  const readOnly = !canEditDemand || isLocked === true || ownerHandoffLock

  const visibleTabs = useMemo(
    () => DEMAND_TAB_IDS.filter((tabId) => isBusinessOwner || !OWNER_ONLY_TABS.includes(tabId)),
    [isBusinessOwner],
  )
  const steps = useFormSteps(visibleTabs, 'identity', readOnly)
  const activeTab = steps.currentId as Tab
  const [form, setForm] = useState<DemandFormState>(initialForm)
  const [options, setOptions] = useState<DemandOptionRow[]>(
    initialOptions?.length
      ? initialOptions
      : isBusinessOwner && !awaitingOwner
        ? [newOption(), newOption()]
        : [],
  )
  const [benefits, setBenefits] = useState<DemandBenefitRow[]>(initialBenefits ?? [])
  const [raidc, setRaidc] = useState<DemandRaidcRow[]>(initialRaidc ?? [])
  const [baselineEvidence, setBaselineEvidence] = useState<BaselineEvidenceRow[]>(initialBaselineEvidence ?? [])
  const [businessReqs, setBusinessReqs] = useState<BusinessRequirementRow[]>(initialBusinessRequirements ?? [])
  const [keyMilestones, setKeyMilestones] = useState<KeyMilestoneRow[]>(initialKeyMilestones ?? [])
  const [stakeholders, setStakeholders] = useState<StakeholderRow[]>(initialStakeholders ?? [])
  const [attestationChecked, setAttestationChecked] = useState(false)
  const [notification, setNotification] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const [savePending, startSave] = useTransition()
  const [submitPending, startSubmit] = useTransition()
  const busy = savePending || submitPending

  const selectedStrategy = useMemo(
    () => strategies.find((s) => s.strategy_id === form.strategy_id) ?? null,
    [strategies, form.strategy_id],
  )
  const availableObjectives = useMemo(() => selectedStrategy?.objectives ?? [], [selectedStrategy])
  const availableKpis = useMemo(() => {
    const selected = new Set(form.objective_ids)
    return availableObjectives.filter((o) => selected.has(o.objective_id)).flatMap((o) => o.kpis)
  }, [availableObjectives, form.objective_ids])

  const hasStrategy = Boolean(form.strategy_id)
  const isStandalone = !hasStrategy
  const br016Valid =
    form.demand_title.trim().length > 0 && form.problem_opportunity_statement.trim().length > 0
  const hasDoNothing = options.some((o) => o.is_do_nothing)
  const br017Valid = options.length === 0 || hasDoNothing
  const canSave = !readOnly && form.demand_title.trim().length > 0
  const canSubmit = isBusinessOwner
    ? canSave && br016Valid && br017Valid && attestationChecked
    : canSave && br016Valid && !awaitingOwner

  function stepValid(tab: Tab): boolean {
    switch (tab) {
      case 'identity':
        return (
          form.demand_title.trim().length > 0 &&
          (hasStrategy || form.ad_hoc_justification.trim().length >= 20)
        )
      case 'case':
        return form.problem_opportunity_statement.trim().length > 0
      case 'alignment':
        return true
      case 'options':
        return br017Valid
      case 'technical':
      case 'finance':
      case 'registers':
        return true
    }
  }

  function patch(field: keyof DemandFormState) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (readOnly) return
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      setNotification(null)
    }
  }

  function toggleBool(field: 'architecture_impact' | 'security_privacy_impact' | 'data_governance_impact' | 'procurement_required') {
    if (readOnly) return
    setForm((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  function toggleMulti(field: 'objective_ids' | 'kpi_ids', id: string) {
    if (readOnly) return
    setForm((prev) => {
      const set = new Set(prev[field])
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...prev, [field]: Array.from(set) }
    })
  }

  function updateOption(localId: string, change: Partial<DemandOptionRow>) {
    if (readOnly) return
    setOptions((rows) => rows.map((r) => (r.local_id === localId ? { ...r, ...change } : r)))
  }

  function updateBenefit(localId: string, change: Partial<DemandBenefitRow>) {
    if (readOnly) return
    setBenefits((rows) => rows.map((r) => (r.local_id === localId ? { ...r, ...change } : r)))
  }

  function updateRaidc(localId: string, change: Partial<DemandRaidcRow>) {
    if (readOnly) return
    setRaidc((rows) => rows.map((r) => (r.local_id === localId ? { ...r, ...change } : r)))
  }

  function buildSavePayload() {
    return {
      demand_id: demandId,
      demand_title: form.demand_title,
      demand_type: form.demand_type || undefined,
      demand_category: form.demand_category || undefined,
      demand_subcategory: form.demand_subcategory || undefined,
      requesting_department_id: form.requesting_department_id || undefined,
      requester_user_id: form.requester_user_id || undefined,
      business_owner_user_id: form.business_owner_user_id || undefined,
      executive_sponsor_user_id: form.executive_sponsor_user_id || undefined,
      strategic_classification: form.strategic_classification || undefined,
      origin_channel: form.origin_channel || undefined,
      mandatory_driver: form.mandatory_driver || undefined,
      urgency: form.urgency || undefined,
      business_impact: form.business_impact || undefined,
      problem_opportunity_statement: form.problem_opportunity_statement || undefined,
      current_state_description: form.current_state_description || form.problem_opportunity_statement || undefined,
      do_nothing_impact: form.do_nothing_impact || undefined,
      business_objectives: linesToArray(form.business_objectives),
      expected_outcomes: linesToArray(form.expected_outcomes),
      success_criteria: linesToArray(form.success_criteria),
      beneficiary_groups: linesToArray(form.beneficiary_groups),
      scope_in: form.scope_in || undefined,
      scope_out: form.scope_out || undefined,
      high_level_deliverables: linesToArray(form.high_level_deliverables),
      ad_hoc_justification: isStandalone ? form.ad_hoc_justification : undefined,
      strategy_id: form.strategy_id || undefined,
      objective_ids: hasStrategy && form.objective_ids.length ? form.objective_ids : undefined,
      kpi_ids: hasStrategy && form.kpi_ids.length ? form.kpi_ids : undefined,
      strategic_contribution_statement: form.strategic_contribution_statement || undefined,
      architecture_impact: form.architecture_impact,
      architecture_assessment_summary: form.architecture_assessment_summary || undefined,
      security_privacy_impact: form.security_privacy_impact,
      security_requirements: form.security_requirements || undefined,
      data_governance_impact: form.data_governance_impact,
      hosting_requirement: form.hosting_requirement || undefined,
      continuity_criticality: form.continuity_criticality || undefined,
      recovery_time_objective: form.recovery_time_objective || undefined,
      recovery_point_objective: form.recovery_point_objective || undefined,
      indicative_one_time_cost_sar: numOrUndef(form.indicative_one_time_cost_sar),
      indicative_recurring_cost_sar: numOrUndef(form.indicative_recurring_cost_sar),
      tco_sar: numOrUndef(form.tco_sar),
      cost_estimate_basis: form.cost_estimate_basis || undefined,
      estimate_confidence: form.estimate_confidence || undefined,
      financial_evaluation_years: numOrUndef(form.financial_evaluation_years),
      discount_rate_pct: numOrUndef(form.discount_rate_pct),
      npv_sar: numOrUndef(form.npv_sar),
      irr_pct: numOrUndef(form.irr_pct),
      roi_pct: numOrUndef(form.roi_pct),
      payback_period_months: numOrUndef(form.payback_period_months),
      requested_start_date: form.requested_start_date || undefined,
      required_by_date: form.required_by_date || undefined,
      delivery_mode: form.delivery_mode || undefined,
      operating_owner_unit_id: form.operating_owner_unit_id || undefined,
      support_model: form.support_model || undefined,
      procurement_required: form.procurement_required,
      indicative_sourcing_route: form.indicative_sourcing_route || undefined,
      preferred_option_id: form.preferred_option_id || undefined,
      preferred_option_rationale: form.preferred_option_rationale || undefined,
      options: options
        .filter((o) => o.is_do_nothing || o.option_description.trim().length > 0)
        .map((o) => ({
          option_id: persistedId(o.local_id),
          option_name: o.option_description || 'Option',
          option_description: o.option_description,
          option_estimated_cost_sar: o.three_year_cost || undefined,
          option_delivery_duration: o.delivery_time || undefined,
          option_risk_score: o.risk_score || undefined,
          option_weighted_score: o.weighted_score || undefined,
          is_do_nothing: o.is_do_nothing,
        })),
      benefits: benefits
        .filter((b) => b.benefit_description.trim())
        .map((b) => ({
          benefit_id: persistedId(b.local_id),
          benefit_type: b.benefit_type || undefined,
          benefit_description: b.benefit_description,
          benefit_baseline: b.benefit_baseline || undefined,
          benefit_target: b.benefit_target || undefined,
          annual_financial_benefit_sar: b.annual_financial_benefit_sar || undefined,
          benefit_realization_start: b.benefit_realization_start || undefined,
          benefit_owner_user_id: b.benefit_owner_user_id || undefined,
          benefit_kpi_id: b.benefit_kpi_id || undefined,
        })),
      raidc_items: raidc
        .filter((r) => r.description.trim())
        .map((r) => ({
          demand_item_id: persistedId(r.local_id),
          type: r.type,
          description: r.description,
          owner: r.owner || undefined,
          probability: r.probability || undefined,
          impact: r.impact || undefined,
          exposure_score: r.exposure_score || undefined,
          response: r.response || undefined,
          status: r.status || undefined,
          due_date: r.due_date || undefined,
        })),
      baseline_evidence: baselineEvidence.filter((r) => r.metric_name.trim()).map((r) => ({
        metric_name: r.metric_name,
        value: r.value,
        unit: r.unit || undefined,
        period: r.period || undefined,
        source: r.source || undefined,
      })),
      business_requirements: businessReqs.filter((r) => r.statement.trim()).map((r) => ({
        req_id: r.req_id,
        statement: r.statement,
        priority: r.priority,
      })),
      key_milestones: keyMilestones.filter((r) => r.name.trim()).map((r) => ({
        name: r.name,
        target_date: r.target_date || undefined,
        type: r.type || undefined,
      })),
      stakeholders: stakeholders.filter((r) => r.party.trim()).map((r) => ({
        party: r.party,
        role: r.role || undefined,
        influence: r.influence,
        engagement: r.engagement,
      })),
      business_owner_attestation: attestationChecked
        ? { confirmed: true, confirmed_by: currentUser.email, confirmed_at: new Date().toISOString() }
        : undefined,
      modified_by: currentUser.email,
    }
  }

  async function persist(): Promise<boolean> {
    if (readOnly) return false
    const result = await saveDemand(buildSavePayload())
    if (result.ok) {
      setNotification({ type: 'success', message: 'Demand saved successfully.' })
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
    if (busy || readOnly) return
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

  function handleSubmit() {
    if (!canSubmit || busy) return
    setNotification(null)
    startSubmit(async () => {
      const saveResult = await saveDemand(buildSavePayload())
      if (!saveResult.ok) {
        setNotification({ type: 'error', message: saveResult.error })
        return
      }
      const submitResult = await submitDemand({
        demand_id: demandId,
        submitted_by: currentUser.email,
      })
      if (submitResult.ok) {
        const reviewCount = submitResult.review_gates.length
        setNotification({
          type: 'success',
          message: submitResult.awaiting_owner
            ? t('prelimSuccess')
            : reviewCount > 0
              ? `Demand submitted. ${reviewCount} conditional review(s) opened (PI-05). Record is locked.`
              : 'Demand submitted for commercial validation (PI-06). Record is now locked.',
        })
        router.refresh()
      } else {
        setNotification({ type: 'error', message: submitResult.error })
      }
    })
  }

  const completeness = calcCompleteness(form)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
            PI-04 · Demand Business Case
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-text">
            Demand Workspace
          </h1>
          <p className="max-w-xl text-sm text-text-muted">
            Capture identity, business case, options, technical impact, and financial appraisal.
          </p>
        </div>
        <WorkspaceMetaGrid>
          <WorkspaceMetaCard label="Demand ID" value={demandId} mono />
          <WorkspaceMetaCard label="Master Trace" value={masterTraceId} mono />
          <WorkspaceMetaCard label="Route">
            <div className="mt-1">
              <OfficialTag variant="outlined">
                {isStandalone ? 'Ad-hoc' : 'Strategic'}
              </OfficialTag>
            </div>
          </WorkspaceMetaCard>
          <WorkspaceMetaCard label="Status">
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <OfficialTag tone={recordStatusTagTone(recordStatus)}>
                {sentenceCaseLabel(recordStatus, 'Draft')}
              </OfficialTag>
              <span className="text-xs font-semibold tabular-nums text-text-muted">{completeness}%</span>
            </div>
          </WorkspaceMetaCard>
        </WorkspaceMetaGrid>
      </div>

      {isLocked && (
        <div className="flex items-start gap-3 rounded-md border border-diriyah-primary/30 bg-diriyah-primary/10 px-4 py-3 text-sm text-text">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-diriyah-primary" />
          <p>
            This demand is <strong>locked</strong> ({recordStatus}). It has been submitted for
            validation. You may not edit until it is returned or approved.
          </p>
        </div>
      )}

      {awaitingOwner && isBusinessOwner && (
        <div className="flex items-start gap-3 rounded-md border border-diriyah-amber/40 bg-diriyah-amber/10 px-4 py-3 text-sm text-text">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-diriyah-primary" />
          <p>{t('awaitingOwnerBanner')}</p>
        </div>
      )}

      {awaitingOwner && !isBusinessOwner && (
        <div className="flex items-start gap-3 rounded-md border border-diriyah-primary/30 bg-diriyah-primary/10 px-4 py-3 text-sm text-text">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-diriyah-primary" />
          <p>
            {submittedBy && submittedBy === currentUser.email
              ? t('awaitingOwnerLockedBanner')
              : t('awaitingOwnerWaitBanner')}
          </p>
        </div>
      )}

      {!isLocked && !awaitingOwner && readOnly && (
        <div className="flex items-start gap-3 rounded-md border border-diriyah-amber/40 bg-diriyah-amber/10 px-4 py-3 text-sm text-text">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-diriyah-primary" />
          <p>
            Read-only for <strong>{currentUser.role}</strong>. Switch the persona in the header
            to <strong>Ahmed Khalid (Business Owner)</strong>,{' '}
            <strong>Sarah Al Mansouri (Strategy &amp; Governance)</strong>, or{' '}
            <strong>Mohammed Al Nuaimi (CTO Office)</strong> to edit an unlocked draft.
            Seeded records such as DEM-2027-0001 are already funded and stay locked — use{' '}
            <strong>+ New Record</strong> to create a new demand.
          </p>
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
        steps={visibleTabs.map((tabId) => ({ id: tabId, label: DEMAND_TAB_LABELS[tabId] }))}
        currentId={activeTab}
        maxReached={steps.maxReached}
        onSelect={(id) => steps.select(id)}
      />

      {activeTab === 'identity' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">Identity</h2>
            <p className="text-sm text-text-muted">Title, optional strategy link, classification, owners, and origin.</p>
          </div>
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">
                Demand Title <RequiredMark />
              </span>
              <input
                className="input-base"
                value={form.demand_title}
                onChange={patch('demand_title')}
                placeholder="e.g. Enterprise Identity Modernisation"
                required
                disabled={readOnly}
              />
            </label>
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">Linked strategy</span>
              <select
                className="input-base"
                value={form.strategy_id}
                onChange={(e) => {
                  if (readOnly) return
                  setForm((prev) => ({
                    ...prev,
                    strategy_id: e.target.value,
                    objective_ids: [],
                    kpi_ids: [],
                  }))
                  setNotification(null)
                }}
                disabled={readOnly}
              >
                <option value="">Standalone (ad-hoc) — no strategy</option>
                {strategies.map((s) => (
                  <option key={s.strategy_id} value={s.strategy_id}>
                    {s.strategy_title} ({s.strategy_id})
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-muted">
                Optional. Leave empty to keep this demand standalone (ad-hoc). Choose an approved
                strategy to align it.
              </p>
            </label>
            {!hasStrategy ? (
              <label className="block space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium text-text">
                  Ad-hoc justification <RequiredMark />
                </span>
                <textarea
                  className="input-base min-h-24 py-3"
                  value={form.ad_hoc_justification}
                  onChange={patch('ad_hoc_justification')}
                  placeholder="Why this demand is standalone and not linked to a strategy…"
                  disabled={readOnly}
                />
                <p className="text-xs text-text-muted">At least 20 characters when no strategy is linked.</p>
              </label>
            ) : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Demand Type</span>
              <select className="input-base" value={form.demand_type} onChange={patch('demand_type')} disabled={readOnly}>
                <option value="">Select…</option>
                {DEMAND_TYPES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Category</span>
              <select className="input-base" value={form.demand_category} onChange={patch('demand_category')} disabled={readOnly}>
                <option value="">Select…</option>
                {DEMAND_CATEGORIES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Subcategory</span>
              <input className="input-base" value={form.demand_subcategory} onChange={patch('demand_subcategory')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Requesting Department</span>
              <input className="input-base" value={form.requesting_department_id} onChange={patch('requesting_department_id')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Requester</span>
              <input className="input-base" value={form.requester_user_id} onChange={patch('requester_user_id')} placeholder="user@diriyah.sa" disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Business Owner</span>
              <input className="input-base" value={form.business_owner_user_id} onChange={patch('business_owner_user_id')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Executive Sponsor</span>
              <input className="input-base" value={form.executive_sponsor_user_id} onChange={patch('executive_sponsor_user_id')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Strategic Classification</span>
              <select className="input-base" value={form.strategic_classification} onChange={patch('strategic_classification')} disabled={readOnly}>
                <option value="">Select…</option>
                {CLASSIFICATIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Origin Channel</span>
              <select className="input-base" value={form.origin_channel} onChange={patch('origin_channel')} disabled={readOnly}>
                <option value="">Select…</option>
                {ORIGIN_CHANNELS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Mandatory Driver</span>
              <input className="input-base" value={form.mandatory_driver} onChange={patch('mandatory_driver')} placeholder="e.g. Regulatory / Safety" disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Urgency</span>
              <select className="input-base" value={form.urgency} onChange={patch('urgency')} disabled={readOnly}>
                {URGENCY_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Business Impact</span>
              <select className="input-base" value={form.business_impact} onChange={patch('business_impact')} disabled={readOnly}>
                <option value="">Select…</option>
                {IMPACT_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}

      {activeTab === 'case' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">Business Case</h2>
            <p className="text-sm text-text-muted">
              Problem, scope, outcomes, and success criteria (BR-016). This tab is the business case — no separate file upload.
            </p>
          </div>
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">
                Problem / Opportunity Statement <RequiredMark />
              </span>
              <textarea
                className="input-base min-h-28 py-3"
                value={form.problem_opportunity_statement}
                onChange={patch('problem_opportunity_statement')}
                required
                disabled={readOnly}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Current State</span>
              <textarea className="input-base min-h-24 py-3" value={form.current_state_description} onChange={patch('current_state_description')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Do-Nothing Impact</span>
              <textarea className="input-base min-h-24 py-3" value={form.do_nothing_impact} onChange={patch('do_nothing_impact')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Scope In</span>
              <textarea className="input-base min-h-24 py-3" value={form.scope_in} onChange={patch('scope_in')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Scope Out</span>
              <textarea className="input-base min-h-24 py-3" value={form.scope_out} onChange={patch('scope_out')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Business Objectives</span>
              <p className="text-xs text-text-muted">One per line.</p>
              <textarea className="input-base min-h-24 py-3" value={form.business_objectives} onChange={patch('business_objectives')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Expected Outcomes</span>
              <p className="text-xs text-text-muted">One per line.</p>
              <textarea className="input-base min-h-24 py-3" value={form.expected_outcomes} onChange={patch('expected_outcomes')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Success Criteria</span>
              <p className="text-xs text-text-muted">One per line.</p>
              <textarea className="input-base min-h-24 py-3" value={form.success_criteria} onChange={patch('success_criteria')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Beneficiary Groups</span>
              <p className="text-xs text-text-muted">One per line.</p>
              <textarea className="input-base min-h-24 py-3" value={form.beneficiary_groups} onChange={patch('beneficiary_groups')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">High-Level Deliverables</span>
              <p className="text-xs text-text-muted">One per line.</p>
              <textarea className="input-base min-h-24 py-3" value={form.high_level_deliverables} onChange={patch('high_level_deliverables')} disabled={readOnly} />
            </label>
          </div>
        </section>
      )}

      {activeTab === 'alignment' && (
        isStandalone ? (
          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="border-b border-border bg-diriyah-amber/15 px-6 py-4">
              <h2 className="text-sm font-semibold text-text">Standalone / ad-hoc demand</h2>
              <p className="text-sm text-text-muted">
                No strategy is linked. Add an optional note, or pick a strategy on the Identity tab.
              </p>
            </div>
            <div className="px-6 py-6">
              <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Ad-hoc note</span>
                <textarea
                  className="input-base min-h-32 py-3"
                  value={form.ad_hoc_justification}
                  onChange={patch('ad_hoc_justification')}
                  placeholder="Why this demand is standalone and not linked to a strategy…"
                  disabled={readOnly}
                />
              </label>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text">Strategic Alignment</h2>
              <p className="text-sm text-text-muted">
                Map this demand to objectives and KPIs for{' '}
                <span className="font-medium text-text">{selectedStrategy?.strategy_title ?? form.strategy_id}</span>.
                Change the strategy on the Identity tab.
              </p>
            </div>
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <label className="block space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium text-text">Strategic Contribution</span>
                <textarea className="input-base min-h-20 py-3" value={form.strategic_contribution_statement} onChange={patch('strategic_contribution_statement')} disabled={readOnly} />
              </label>
              <div className="space-y-2">
                <p className="text-sm font-medium text-text">Objectives</p>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border bg-diriyah-bg-alt/50 p-3">
                  {availableObjectives.length === 0 ? (
                    <p className="text-sm text-text-muted">This strategy has no objectives yet.</p>
                  ) : (
                    availableObjectives.map((o) => (
                      <label key={o.objective_id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.objective_ids.includes(o.objective_id)}
                          onChange={() => toggleMulti('objective_ids', o.objective_id)}
                          className="accent-[var(--diriyah-primary)]"
                          disabled={readOnly}
                        />
                        <span>{o.objective_name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-text">KPIs</p>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border bg-diriyah-bg-alt/50 p-3">
                  {availableKpis.length === 0 ? (
                    <p className="text-sm text-text-muted">Select objectives to load KPIs.</p>
                  ) : (
                    availableKpis.map((k) => (
                      <label key={k.kpi_id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.kpi_ids.includes(k.kpi_id)}
                          onChange={() => toggleMulti('kpi_ids', k.kpi_id)}
                          className="accent-[var(--diriyah-primary)]"
                          disabled={readOnly}
                        />
                        <span>{k.kpi_name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )
      )}

      {activeTab === 'options' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="flex flex-col gap-3 border-b border-border bg-diriyah-bg-alt/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text">Options Appraisal</h2>
              <p className="text-sm text-text-muted">
                BR-017: mark one option as &ldquo;Do Nothing&rdquo; before submission.
              </p>
            </div>
            {!readOnly && (
              <button type="button" onClick={() => setOptions((rows) => [...rows, newOption()])} className="btn h-10 border-border bg-white text-sm">
                <Plus className="h-4 w-4" />
                Add option
              </button>
            )}
          </div>
          {options.length > 0 && !hasDoNothing && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-700">
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              BR-017: Mark one option as &ldquo;Do Nothing / Base Case&rdquo; before submission.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold">3-Year Cost (SAR)</th>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Risk (0–10)</th>
                  <th className="px-4 py-3 font-semibold">Score (0–100)</th>
                  <th className="px-4 py-3 font-semibold text-center">Do Nothing</th>
                  <th className="w-12 px-4 py-3"><span className="sr-only">Delete</span></th>
                </tr>
              </thead>
              <tbody>
                {options.map((row) => (
                  <tr key={row.local_id} className={cn('border-b border-border/80 last:border-0', row.is_do_nothing && 'bg-amber-50/60')}>
                    <td className="px-4 py-3">
                      <input className="input-base h-10" value={row.option_description} onChange={(e) => updateOption(row.local_id, { option_description: e.target.value })} disabled={readOnly} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" min={0} step={1000} className="input-base h-10 tabular-nums" value={row.three_year_cost} onChange={(e) => updateOption(row.local_id, { three_year_cost: Number(e.target.value) || 0 })} disabled={readOnly} />
                      <p className="mt-0.5 text-[11px] text-text-muted">{formatSar(row.three_year_cost)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <input className="input-base h-10" value={row.delivery_time} onChange={(e) => updateOption(row.local_id, { delivery_time: e.target.value })} disabled={readOnly} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" min={0} max={10} step={0.1} className="input-base h-10 tabular-nums" value={row.risk_score} onChange={(e) => updateOption(row.local_id, { risk_score: Number(e.target.value) || 0 })} disabled={readOnly} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" min={0} max={100} step={0.1} className="input-base h-10 tabular-nums" value={row.weighted_score} onChange={(e) => updateOption(row.local_id, { weighted_score: Number(e.target.value) || 0 })} disabled={readOnly} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={row.is_do_nothing}
                        onChange={(e) => {
                          if (readOnly) return
                          if (e.target.checked) {
                            setOptions((rows) => rows.map((r) => ({ ...r, is_do_nothing: r.local_id === row.local_id })))
                            setForm((prev) => ({ ...prev, preferred_option_id: prev.preferred_option_id === row.local_id ? '' : prev.preferred_option_id }))
                          } else {
                            updateOption(row.local_id, { is_do_nothing: false })
                          }
                        }}
                        className="h-5 w-5 accent-[var(--diriyah-amber)]"
                        disabled={readOnly}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {!readOnly && (
                        <button
                          type="button"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-diriyah-red hover:bg-diriyah-red/10 disabled:opacity-40"
                          disabled={options.length <= 1}
                          onClick={() => setOptions((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.local_id !== row.local_id)))}
                          aria-label="Remove option"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-5 border-t border-border px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Preferred Option</span>
              <select className="input-base" value={form.preferred_option_id} onChange={patch('preferred_option_id')} disabled={readOnly}>
                <option value="">Select…</option>
                {options.filter((o) => !o.is_do_nothing && o.option_description.trim()).map((o) => (
                  <option key={o.local_id} value={o.local_id}>{o.option_description}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Preferred Option Rationale</span>
              <textarea className="input-base min-h-20 py-3" value={form.preferred_option_rationale} onChange={patch('preferred_option_rationale')} disabled={readOnly} />
            </label>
          </div>
        </section>
      )}

      {activeTab === 'technical' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">Technical Requirements</h2>
            <p className="text-sm text-text-muted">Architecture, security, data, hosting, and continuity flags (BR-015).</p>
          </div>
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
              <input type="checkbox" checked={form.architecture_impact} onChange={() => toggleBool('architecture_impact')} className="h-4 w-4 accent-[var(--diriyah-primary)]" disabled={readOnly} />
              <span className="text-sm font-medium text-text">Architecture impact</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
              <input type="checkbox" checked={form.security_privacy_impact} onChange={() => toggleBool('security_privacy_impact')} className="h-4 w-4 accent-[var(--diriyah-primary)]" disabled={readOnly} />
              <span className="text-sm font-medium text-text">Security / privacy impact</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
              <input type="checkbox" checked={form.data_governance_impact} onChange={() => toggleBool('data_governance_impact')} className="h-4 w-4 accent-[var(--diriyah-primary)]" disabled={readOnly} />
              <span className="text-sm font-medium text-text">Data governance impact</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Hosting Requirement</span>
              <select className="input-base" value={form.hosting_requirement} onChange={patch('hosting_requirement')} disabled={readOnly}>
                <option value="">Select…</option>
                {HOSTING_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">Architecture Assessment</span>
              <textarea className="input-base min-h-20 py-3" value={form.architecture_assessment_summary} onChange={patch('architecture_assessment_summary')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">Security Requirements</span>
              <textarea className="input-base min-h-20 py-3" value={form.security_requirements} onChange={patch('security_requirements')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Continuity Criticality</span>
              <select className="input-base" value={form.continuity_criticality} onChange={patch('continuity_criticality')} disabled={readOnly}>
                <option value="">Select…</option>
                {CONTINUITY_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">RTO</span>
              <input className="input-base" value={form.recovery_time_objective} onChange={patch('recovery_time_objective')} placeholder="e.g. 4 hours" disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">RPO</span>
              <input className="input-base" value={form.recovery_point_objective} onChange={patch('recovery_point_objective')} placeholder="e.g. 15 minutes" disabled={readOnly} />
            </label>
          </div>
        </section>
      )}

      {activeTab === 'finance' && (
        <section className="overflow-hidden rounded-md border border-border bg-white p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">Finance &amp; Delivery</h2>
            <p className="text-sm text-text-muted">Indicative costs, investment metrics, and delivery model.</p>
          </div>
          <div className="grid gap-5 px-6 py-6 md:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">One-time Cost (SAR)</span>
              <input type="number" min={0} className="input-base tabular-nums" value={form.indicative_one_time_cost_sar} onChange={patch('indicative_one_time_cost_sar')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Recurring Cost (SAR)</span>
              <input type="number" min={0} className="input-base tabular-nums" value={form.indicative_recurring_cost_sar} onChange={patch('indicative_recurring_cost_sar')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">TCO (SAR)</span>
              <input type="number" min={0} className="input-base tabular-nums" value={form.tco_sar} onChange={patch('tco_sar')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">NPV (SAR)</span>
              <input type="number" className="input-base tabular-nums" value={form.npv_sar} onChange={patch('npv_sar')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">IRR %</span>
              <input type="number" className="input-base tabular-nums" value={form.irr_pct} onChange={patch('irr_pct')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">ROI %</span>
              <input type="number" className="input-base tabular-nums" value={form.roi_pct} onChange={patch('roi_pct')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Payback (months)</span>
              <input type="number" min={0} className="input-base tabular-nums" value={form.payback_period_months} onChange={patch('payback_period_months')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Discount Rate %</span>
              <input type="number" min={0} className="input-base tabular-nums" value={form.discount_rate_pct} onChange={patch('discount_rate_pct')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Evaluation Years</span>
              <input type="number" min={1} className="input-base tabular-nums" value={form.financial_evaluation_years} onChange={patch('financial_evaluation_years')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Estimate Confidence</span>
              <select className="input-base" value={form.estimate_confidence} onChange={patch('estimate_confidence')} disabled={readOnly}>
                <option value="">Select…</option>
                {CONFIDENCE_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">Cost Estimate Basis</span>
              <input className="input-base" value={form.cost_estimate_basis} onChange={patch('cost_estimate_basis')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Requested Start</span>
              <input type="date" className="input-base" value={form.requested_start_date} onChange={patch('requested_start_date')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Required By</span>
              <input type="date" className="input-base" value={form.required_by_date} onChange={patch('required_by_date')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Delivery Mode</span>
              <select className="input-base" value={form.delivery_mode} onChange={patch('delivery_mode')} disabled={readOnly}>
                <option value="">Select…</option>
                {DELIVERY_MODES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Operating Owner Unit</span>
              <input className="input-base" value={form.operating_owner_unit_id} onChange={patch('operating_owner_unit_id')} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Sourcing Route</span>
              <select className="input-base" value={form.indicative_sourcing_route} onChange={patch('indicative_sourcing_route')} disabled={readOnly}>
                <option value="">Select…</option>
                {SOURCING_ROUTES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
              <input type="checkbox" checked={form.procurement_required} onChange={() => toggleBool('procurement_required')} className="h-4 w-4 accent-[var(--diriyah-primary)]" disabled={readOnly} />
              <span className="text-sm font-medium text-text">Procurement required</span>
            </label>
            <label className="block space-y-1.5 md:col-span-3">
              <span className="text-sm font-medium text-text">Support Model</span>
              <textarea className="input-base min-h-20 py-3" value={form.support_model} onChange={patch('support_model')} disabled={readOnly} />
            </label>
          </div>
        </section>
      )}

      {activeTab === 'registers' && (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="flex flex-col gap-3 border-b border-border bg-diriyah-bg-alt/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text">Benefits Register</h2>
                <p className="text-sm text-text-muted">Expected benefits linked to this demand.</p>
              </div>
              {!readOnly && (
                <button type="button" onClick={() => setBenefits((rows) => [...rows, newBenefit()])} className="btn h-10 border-border bg-white text-sm">
                  <Plus className="h-4 w-4" /> Add benefit
                </button>
              )}
            </div>
            {benefits.length === 0 ? (
              <p className="px-6 py-8 text-sm text-text-muted">No benefits recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Description</th>
                      <th className="px-4 py-3 font-semibold">Baseline</th>
                      <th className="px-4 py-3 font-semibold">Target</th>
                      <th className="px-4 py-3 font-semibold">Annual SAR</th>
                      <th className="px-4 py-3 font-semibold">Start</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {benefits.map((row) => (
                      <tr key={row.local_id} className="border-b border-border/80 last:border-0">
                        <td className="px-4 py-3">
                          <select className="input-base h-10" value={row.benefit_type} onChange={(e) => updateBenefit(row.local_id, { benefit_type: e.target.value })} disabled={readOnly}>
                            {BENEFIT_TYPES.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input className="input-base h-10" value={row.benefit_description} onChange={(e) => updateBenefit(row.local_id, { benefit_description: e.target.value })} disabled={readOnly} />
                        </td>
                        <td className="px-4 py-3">
                          <input className="input-base h-10" value={row.benefit_baseline} onChange={(e) => updateBenefit(row.local_id, { benefit_baseline: e.target.value })} disabled={readOnly} />
                        </td>
                        <td className="px-4 py-3">
                          <input className="input-base h-10" value={row.benefit_target} onChange={(e) => updateBenefit(row.local_id, { benefit_target: e.target.value })} disabled={readOnly} />
                        </td>
                        <td className="px-4 py-3">
                          <input type="number" min={0} className="input-base h-10 tabular-nums" value={row.annual_financial_benefit_sar} onChange={(e) => updateBenefit(row.local_id, { annual_financial_benefit_sar: Number(e.target.value) || 0 })} disabled={readOnly} />
                        </td>
                        <td className="px-4 py-3">
                          <input type="date" className="input-base h-10" value={row.benefit_realization_start} onChange={(e) => updateBenefit(row.local_id, { benefit_realization_start: e.target.value })} disabled={readOnly} />
                        </td>
                        <td className="px-4 py-3">
                          {!readOnly && (
                            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-diriyah-red hover:bg-diriyah-red/10" onClick={() => setBenefits((rows) => rows.filter((r) => r.local_id !== row.local_id))} aria-label="Remove benefit">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* DEM-021: Baseline Evidence */}
          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="flex flex-col gap-3 border-b border-border bg-diriyah-bg-alt/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text">Baseline Evidence <span className="text-xs font-normal text-diriyah-accent">(DEM-021)</span></h2>
                <p className="text-sm text-text-muted">Metrics proving the current problem / opportunity.</p>
              </div>
              {!readOnly && (
                <button type="button" onClick={() => setBaselineEvidence((r) => [...r, newBaselineEvidence()])} className="btn h-10 border-border bg-white text-sm">
                  <Plus className="h-4 w-4" /> Add metric
                </button>
              )}
            </div>
            {baselineEvidence.length === 0 ? (
              <p className="px-6 py-8 text-sm text-text-muted">No baseline metrics recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3 font-semibold">Metric</th>
                      <th className="px-4 py-3 font-semibold">Value</th>
                      <th className="px-4 py-3 font-semibold">Unit</th>
                      <th className="px-4 py-3 font-semibold">Period</th>
                      <th className="px-4 py-3 font-semibold">Source</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {baselineEvidence.map((row) => (
                      <tr key={row.local_id} className="border-b border-border/80 last:border-0">
                        <td className="px-4 py-3"><input className="input-base h-10" value={row.metric_name} onChange={(e) => setBaselineEvidence((r) => r.map((x) => x.local_id === row.local_id ? { ...x, metric_name: e.target.value } : x))} disabled={readOnly} placeholder="e.g. Average wait time" /></td>
                        <td className="px-4 py-3"><input type="number" className="input-base h-10 tabular-nums" value={row.value} onChange={(e) => setBaselineEvidence((r) => r.map((x) => x.local_id === row.local_id ? { ...x, value: Number(e.target.value) || 0 } : x))} disabled={readOnly} /></td>
                        <td className="px-4 py-3"><input className="input-base h-10" value={row.unit} onChange={(e) => setBaselineEvidence((r) => r.map((x) => x.local_id === row.local_id ? { ...x, unit: e.target.value } : x))} disabled={readOnly} placeholder="days / % / SAR" /></td>
                        <td className="px-4 py-3"><input className="input-base h-10" value={row.period} onChange={(e) => setBaselineEvidence((r) => r.map((x) => x.local_id === row.local_id ? { ...x, period: e.target.value } : x))} disabled={readOnly} placeholder="Q1 2026" /></td>
                        <td className="px-4 py-3"><input className="input-base h-10" value={row.source} onChange={(e) => setBaselineEvidence((r) => r.map((x) => x.local_id === row.local_id ? { ...x, source: e.target.value } : x))} disabled={readOnly} placeholder="System / report" /></td>
                        <td className="px-4 py-3">
                          {!readOnly && (
                            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-diriyah-red hover:bg-diriyah-red/10" onClick={() => setBaselineEvidence((r) => r.filter((x) => x.local_id !== row.local_id))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* DEM-031: Business Requirements */}
          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="flex flex-col gap-3 border-b border-border bg-diriyah-bg-alt/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text">Business Requirements <span className="text-xs font-normal text-diriyah-accent">(DEM-031)</span></h2>
                <p className="text-sm text-text-muted">MoSCoW-prioritised business requirements.</p>
              </div>
              {!readOnly && (
                <button type="button" onClick={() => setBusinessReqs((r) => [...r, newBusinessReq()])} className="btn h-10 border-border bg-white text-sm">
                  <Plus className="h-4 w-4" /> Add requirement
                </button>
              )}
            </div>
            {businessReqs.length === 0 ? (
              <p className="px-6 py-8 text-sm text-text-muted">No requirements recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="w-28 px-4 py-3 font-semibold">Req ID</th>
                      <th className="px-4 py-3 font-semibold">Statement</th>
                      <th className="w-44 px-4 py-3 font-semibold">Priority</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {businessReqs.map((row) => (
                      <tr key={row.local_id} className="border-b border-border/80 last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">{row.req_id}</td>
                        <td className="px-4 py-3"><input className="input-base h-10" value={row.statement} onChange={(e) => setBusinessReqs((r) => r.map((x) => x.local_id === row.local_id ? { ...x, statement: e.target.value } : x))} disabled={readOnly} /></td>
                        <td className="px-4 py-3">
                          <select className="input-base h-10" value={row.priority} onChange={(e) => setBusinessReqs((r) => r.map((x) => x.local_id === row.local_id ? { ...x, priority: e.target.value as BusinessRequirementRow['priority'] } : x))} disabled={readOnly}>
                            {REQ_PRIORITY.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {!readOnly && (
                            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-diriyah-red hover:bg-diriyah-red/10" onClick={() => setBusinessReqs((r) => r.filter((x) => x.local_id !== row.local_id))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* DEM-078: Key Milestones */}
          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="flex flex-col gap-3 border-b border-border bg-diriyah-bg-alt/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text">Key Milestones <span className="text-xs font-normal text-diriyah-accent">(DEM-078)</span></h2>
                <p className="text-sm text-text-muted">High-level delivery milestones.</p>
              </div>
              {!readOnly && (
                <button type="button" onClick={() => setKeyMilestones((r) => [...r, newKeyMilestone()])} className="btn h-10 border-border bg-white text-sm">
                  <Plus className="h-4 w-4" /> Add milestone
                </button>
              )}
            </div>
            {keyMilestones.length === 0 ? (
              <p className="px-6 py-8 text-sm text-text-muted">No milestones recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3 font-semibold">Milestone</th>
                      <th className="w-44 px-4 py-3 font-semibold">Target Date</th>
                      <th className="w-44 px-4 py-3 font-semibold">Type</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {keyMilestones.map((row) => (
                      <tr key={row.local_id} className="border-b border-border/80 last:border-0">
                        <td className="px-4 py-3"><input className="input-base h-10" value={row.name} onChange={(e) => setKeyMilestones((r) => r.map((x) => x.local_id === row.local_id ? { ...x, name: e.target.value } : x))} disabled={readOnly} /></td>
                        <td className="px-4 py-3"><input type="date" className="input-base h-10" value={row.target_date} onChange={(e) => setKeyMilestones((r) => r.map((x) => x.local_id === row.local_id ? { ...x, target_date: e.target.value } : x))} disabled={readOnly} /></td>
                        <td className="px-4 py-3">
                          <select className="input-base h-10" value={row.type} onChange={(e) => setKeyMilestones((r) => r.map((x) => x.local_id === row.local_id ? { ...x, type: e.target.value } : x))} disabled={readOnly}>
                            {MILESTONE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {!readOnly && (
                            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-diriyah-red hover:bg-diriyah-red/10" onClick={() => setKeyMilestones((r) => r.filter((x) => x.local_id !== row.local_id))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* DEM-090: Key Stakeholders */}
          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="flex flex-col gap-3 border-b border-border bg-diriyah-bg-alt/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text">Key Stakeholders <span className="text-xs font-normal text-diriyah-accent">(DEM-090)</span></h2>
                <p className="text-sm text-text-muted">Stakeholder influence and engagement mapping.</p>
              </div>
              {!readOnly && (
                <button type="button" onClick={() => setStakeholders((r) => [...r, newStakeholder()])} className="btn h-10 border-border bg-white text-sm">
                  <Plus className="h-4 w-4" /> Add stakeholder
                </button>
              )}
            </div>
            {stakeholders.length === 0 ? (
              <p className="px-6 py-8 text-sm text-text-muted">No stakeholders recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3 font-semibold">Party / Organisation</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="w-36 px-4 py-3 font-semibold">Influence</th>
                      <th className="w-40 px-4 py-3 font-semibold">Engagement</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {stakeholders.map((row) => (
                      <tr key={row.local_id} className="border-b border-border/80 last:border-0">
                        <td className="px-4 py-3"><input className="input-base h-10" value={row.party} onChange={(e) => setStakeholders((r) => r.map((x) => x.local_id === row.local_id ? { ...x, party: e.target.value } : x))} disabled={readOnly} /></td>
                        <td className="px-4 py-3"><input className="input-base h-10" value={row.role} onChange={(e) => setStakeholders((r) => r.map((x) => x.local_id === row.local_id ? { ...x, role: e.target.value } : x))} disabled={readOnly} /></td>
                        <td className="px-4 py-3">
                          <select className="input-base h-10" value={row.influence} onChange={(e) => setStakeholders((r) => r.map((x) => x.local_id === row.local_id ? { ...x, influence: e.target.value as StakeholderRow['influence'] } : x))} disabled={readOnly}>
                            {INFLUENCE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select className="input-base h-10" value={row.engagement} onChange={(e) => setStakeholders((r) => r.map((x) => x.local_id === row.local_id ? { ...x, engagement: e.target.value as StakeholderRow['engagement'] } : x))} disabled={readOnly}>
                            {ENGAGEMENT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {!readOnly && (
                            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-diriyah-red hover:bg-diriyah-red/10" onClick={() => setStakeholders((r) => r.filter((x) => x.local_id !== row.local_id))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-md border border-border bg-white p-0">
            <div className="flex flex-col gap-3 border-b border-border bg-diriyah-bg-alt/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text">RAIDC Register</h2>
                <p className="text-sm text-text-muted">Risks, issues, assumptions, dependencies, and constraints.</p>
              </div>
              {!readOnly && (
                <button type="button" onClick={() => setRaidc((rows) => [...rows, newRaidc()])} className="btn h-10 border-border bg-white text-sm">
                  <Plus className="h-4 w-4" /> Add item
                </button>
              )}
            </div>
            {raidc.length === 0 ? (
              <p className="px-6 py-8 text-sm text-text-muted">No RAIDC items recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-diriyah-bg-secondary/40 text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Description</th>
                      <th className="px-4 py-3 font-semibold">Owner</th>
                      <th className="px-4 py-3 font-semibold">Prob.</th>
                      <th className="px-4 py-3 font-semibold">Impact</th>
                      <th className="px-4 py-3 font-semibold">Response</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="w-12 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {raidc.map((row) => (
                      <tr key={row.local_id} className="border-b border-border/80 last:border-0">
                        <td className="px-4 py-3">
                          <select className="input-base h-10" value={row.type} onChange={(e) => updateRaidc(row.local_id, { type: e.target.value as DemandRaidcRow['type'] })} disabled={readOnly}>
                            {RAIDC_TYPES.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input className="input-base h-10" value={row.description} onChange={(e) => updateRaidc(row.local_id, { description: e.target.value })} disabled={readOnly} />
                        </td>
                        <td className="px-4 py-3">
                          <input className="input-base h-10" value={row.owner} onChange={(e) => updateRaidc(row.local_id, { owner: e.target.value })} disabled={readOnly} />
                        </td>
                        <td className="px-4 py-3">
                          <select className="input-base h-10" value={row.probability} onChange={(e) => updateRaidc(row.local_id, { probability: e.target.value })} disabled={readOnly}>
                            {PROBABILITY_OPTIONS.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select className="input-base h-10" value={row.impact} onChange={(e) => updateRaidc(row.local_id, { impact: e.target.value })} disabled={readOnly}>
                            {RAIDC_IMPACT_OPTIONS.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input className="input-base h-10" value={row.response} onChange={(e) => updateRaidc(row.local_id, { response: e.target.value })} disabled={readOnly} />
                        </td>
                        <td className="px-4 py-3">
                          <select className="input-base h-10" value={row.status} onChange={(e) => updateRaidc(row.local_id, { status: e.target.value })} disabled={readOnly}>
                            {RAIDC_STATUS.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {!readOnly && (
                            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-diriyah-red hover:bg-diriyah-red/10" onClick={() => setRaidc((rows) => rows.filter((r) => r.local_id !== row.local_id))} aria-label="Remove RAIDC item">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* DEM-091: Business Owner Attestation */}
          {!readOnly && (
            <div className="rounded-md border border-diriyah-primary/20 bg-diriyah-bg-alt/60 px-6 py-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={attestationChecked}
                  onChange={(e) => setAttestationChecked(e.target.checked)}
                  className="mt-0.5 h-5 w-5 accent-[var(--diriyah-primary)]"
                />
                <div>
                  <p className="text-sm font-semibold text-text">
                    Business Owner Attestation <span className="text-xs font-normal text-diriyah-accent">(DEM-091)</span>
                  </p>
                  <p className="mt-0.5 text-sm text-text-muted">
                    I confirm that the business case content, stated benefits, requirements and ownership are accurate and complete.
                  </p>
                  {!attestationChecked && (
                    <p className="mt-1 text-xs font-medium text-diriyah-amber">
                      This attestation is required before the demand can be submitted.
                    </p>
                  )}
                </div>
              </label>
            </div>
          )}
        </div>
      )}

      {!readOnly && (
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
                {savePending ? t('saving') : t('saveDemand')}
              </button>
              <button
                type="button"
                className="btn btn-primary inline-flex h-11 items-center gap-2 px-6 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canSubmit || busy}
                onClick={handleSubmit}
                title={
                  !br016Valid
                    ? 'BR-016: Title and Problem Statement are required.'
                    : isBusinessOwner && !br017Valid
                      ? 'BR-017: Mark one option as "Do Nothing" before submission.'
                      : isBusinessOwner
                        ? 'Submit demand for validation.'
                        : 'Send to the Business Owner to complete and submit.'
                }
              >
                {submitPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitPending
                  ? t('submitting')
                  : isBusinessOwner
                    ? t('submitDemand')
                    : t('submitToOwner')}
              </button>
            </>
          ) : null}
        </FormStepActions>
      )}
    </div>
  )
}
