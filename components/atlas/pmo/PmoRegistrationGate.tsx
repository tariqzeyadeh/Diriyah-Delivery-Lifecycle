'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { Lock, Unlock, Loader2, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { activateProjectRegistration } from '@/src/actions/gates'
import { ApprovalGate } from '@/src/components/ApprovalGate'
import { useAuth } from '@/src/providers/AuthProvider'
import { isPmoReadyStage } from '@/lib/atlas/procurement'
import { DefinitionList, OfficialTag, RecordNotice } from '@/components/atlas/records'
import { sentenceCaseLabel, stageTagTone } from '@/lib/atlas/record-label'
import {
  FormStepActions,
  FormStepRail,
  RequiredMark,
  useFormSteps,
} from '@/components/atlas/forms/FormStepper'

type RaidcRow = {
  id: string
  type: 'Risk' | 'Assumption' | 'Issue' | 'Decision' | 'Change'
  title: string
  description: string
  owner: string
  status: 'Open' | 'In Progress' | 'Closed'
  due_date: string
}

type PaymentRow = {
  id: string
  milestone_name: string
  amount_sar: string
  due_date: string
  status: 'Pending' | 'Invoiced' | 'Paid' | 'Disputed'
}

type Tab = 'identity' | 'people' | 'scope' | 'finance' | 'governance' | 'raidc' | 'payments'

type Props = {
  procurementItemId: string
  masterTraceId: string
  itemTitle: string
  stage: string
  demandTitle?: string | null
  alreadyRegistered?: boolean
  existingProjectId?: string | null
  approvedBudgetSar?: number | null
  /** BR-035 system-derived readiness checks (G-39) */
  derivedReadiness?: {
    check_approved_demand: boolean
    check_approved_budget: boolean
    check_procurement_complete: boolean
    check_document_pack: boolean
  } | null
}

const TAB_IDS: Tab[] = ['identity', 'people', 'scope', 'finance', 'governance', 'raidc', 'payments']

function linesToArray(s: string): string[] {
  return s.split('\n').map((l) => l.trim()).filter(Boolean)
}

export function PmoRegistrationGate({
  procurementItemId,
  masterTraceId,
  itemTitle,
  stage,
  demandTitle,
  alreadyRegistered,
  existingProjectId,
  approvedBudgetSar,
  derivedReadiness,
}: Props) {
  const t = useTranslations('pmo')
  const tc = useTranslations('common')
  const { currentUser } = useAuth()
  const ready = isPmoReadyStage(stage)
  const unlocked = ready && !alreadyRegistered
  const steps = useFormSteps(TAB_IDS, 'identity', !unlocked)
  const activeTab = steps.currentId as Tab
  const [form, setForm] = useState({
    project_name: itemTitle ? `${itemTitle} — Project` : '',
    project_type: 'Delivery',
    project_category: 'Technology',
    complexity_rating: 'Medium',
    project_priority: 'High',
    delivery_approach: 'Agile',
    project_manager_id: '',
    project_sponsor_user_id: '',
    business_owner_user_id: '',
    technology_owner_user_id: '',
    planned_start: '',
    planned_finish: '',
    project_purpose: '',
    project_scope_in: '',
    project_scope_out: '',
    project_deliverables: '',
    project_success_measures: '',
    approved_project_budget_sar: approvedBudgetSar ? String(approvedBudgetSar) : '',
    contract_value_sar: '',
    project_contingency_sar: '',
    contract_id: '',
    initial_risk_rating: 'Medium',
    governance_tier: 'Tier 2',
    steering_committee_required: false,
    project_reporting_frequency: 'Monthly',
    check_approved_demand: false,
    check_approved_budget: false,
    check_procurement_complete: true,
    check_document_pack: false,
  })
  const [activatedId, setActivatedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // G-40: RAIDC register rows
  const [raidcRows, setRaidcRows] = useState<RaidcRow[]>([])
  // G-40: Payment milestone rows
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([])

  // G-39: Use system-derived checks when available (BR-035), else fall back to manual
  const checksReady = derivedReadiness
    ? derivedReadiness.check_approved_demand &&
      derivedReadiness.check_approved_budget &&
      derivedReadiness.check_procurement_complete
    : form.check_approved_demand && form.check_approved_budget && form.check_document_pack

  function patch(field: keyof typeof form) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (!unlocked) return
      setForm((f) => ({ ...f, [field]: e.target.value }))
    }
  }

  function toggle(field: 'steering_committee_required' | 'check_approved_demand' | 'check_approved_budget' | 'check_procurement_complete' | 'check_document_pack') {
    if (!unlocked) return
    setForm((f) => ({ ...f, [field]: !f[field] }))
  }

  // G-40: RAIDC row helpers
  function addRaidcRow() {
    if (!unlocked) return
    setRaidcRows((prev) => [
      ...prev,
      { id: `r-${Date.now()}`, type: 'Risk', title: '', description: '', owner: '', status: 'Open', due_date: '' },
    ])
  }
  function removeRaidcRow(id: string) {
    if (!unlocked) return
    setRaidcRows((prev) => prev.filter((r) => r.id !== id))
  }
  function patchRaidcRow(id: string, field: keyof Omit<RaidcRow, 'id'>, value: string) {
    if (!unlocked) return
    setRaidcRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  // G-40: Payment row helpers
  function addPaymentRow() {
    if (!unlocked) return
    setPaymentRows((prev) => [
      ...prev,
      { id: `p-${Date.now()}`, milestone_name: '', amount_sar: '', due_date: '', status: 'Pending' },
    ])
  }
  function removePaymentRow(id: string) {
    if (!unlocked) return
    setPaymentRows((prev) => prev.filter((r) => r.id !== id))
  }
  function patchPaymentRow(id: string, field: keyof Omit<PaymentRow, 'id'>, value: string) {
    if (!unlocked) return
    setPaymentRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  function handleNext() {
    if (!unlocked) {
      steps.advance()
      return
    }
    if (activeTab === 'identity' && !form.project_name.trim()) {
      setError(tc('fillRequired'))
      return
    }
    if (activeTab === 'people' && !form.project_manager_id.trim()) {
      setError(tc('fillRequired'))
      return
    }
    setError(null)
    steps.advance()
  }

  function activate() {
    if (!unlocked) return
    startTransition(async () => {
      setError(null)
      const result = await activateProjectRegistration({
        procurement_item_id: procurementItemId,
        project_name: form.project_name,
        project_manager_id: form.project_manager_id,
        delivery_approach: form.delivery_approach,
        planned_start: form.planned_start,
        planned_finish: form.planned_finish,
        project_type: form.project_type,
        project_category: form.project_category,
        complexity_rating: form.complexity_rating,
        project_priority: form.project_priority,
        project_sponsor_user_id: form.project_sponsor_user_id || undefined,
        business_owner_user_id: form.business_owner_user_id || undefined,
        technology_owner_user_id: form.technology_owner_user_id || undefined,
        project_purpose: form.project_purpose || undefined,
        project_scope_in: form.project_scope_in || undefined,
        project_scope_out: form.project_scope_out || undefined,
        project_deliverables: linesToArray(form.project_deliverables),
        project_success_measures: linesToArray(form.project_success_measures),
        approved_project_budget_sar: form.approved_project_budget_sar
          ? Number(form.approved_project_budget_sar)
          : undefined,
        contract_value_sar: form.contract_value_sar ? Number(form.contract_value_sar) : undefined,
        project_contingency_sar: form.project_contingency_sar
          ? Number(form.project_contingency_sar)
          : undefined,
        contract_id: form.contract_id || undefined,
        initial_risk_rating: form.initial_risk_rating || undefined,
        governance_tier: form.governance_tier || undefined,
        steering_committee_required: form.steering_committee_required,
        project_reporting_frequency: form.project_reporting_frequency || undefined,
        // G-39: Use system-derived values when available
        check_approved_demand: derivedReadiness?.check_approved_demand ?? form.check_approved_demand,
        check_approved_budget: derivedReadiness?.check_approved_budget ?? form.check_approved_budget,
        check_procurement_complete: derivedReadiness?.check_procurement_complete ?? form.check_procurement_complete,
        check_document_pack: derivedReadiness?.check_document_pack ?? form.check_document_pack,
        created_by: currentUser.email,
        // G-40: RAIDC register and payment milestones
        raidc_register: raidcRows.length ? JSON.stringify(raidcRows) : undefined,
        payment_milestones: paymentRows.length ? JSON.stringify(paymentRows) : undefined,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setActivatedId(result.project_id)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
            PI-09 · PMO Handoff
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-text">
            Project Registration Gate
          </h1>
          <p className="text-sm text-text-muted">
            Register delivery after procurement reaches <strong>Acceptance</strong> or{' '}
            <strong>Completed</strong>.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-md border border-border bg-white px-4 py-3">
            <DefinitionList
              items={[
                { label: t('procurementItem'), value: <span className="font-mono">{procurementItemId}</span> },
                { label: t('masterTrace'), value: <span className="font-mono">{masterTraceId}</span> },
              ]}
            />
          </div>
          <div className="flex items-center rounded-md border border-border bg-white px-4 py-3">
            <OfficialTag tone={stageTagTone(stage)}>{sentenceCaseLabel(stage)}</OfficialTag>
          </div>
        </div>
      </div>

      {activatedId ? (
        <RecordNotice title={t('activateSuccessTitle')} tone="success" role="alert">
          {t('alreadyRegistered')} — {activatedId}
        </RecordNotice>
      ) : null}

      {!ready ? (
        <RecordNotice title={t('activationLocked')} tone="warning">
          {t('activationLockedBody')}
          {demandTitle ? <> {t('linkedDemand')}: {demandTitle}.</> : null}
        </RecordNotice>
      ) : null}

      {alreadyRegistered && existingProjectId && !activatedId ? (
        <RecordNotice title={t('alreadyRegistered')} tone="info">
          {existingProjectId}
        </RecordNotice>
      ) : null}

      <FormStepRail
        steps={TAB_IDS.map((tabId) => ({
          id: tabId,
          label: t(
            tabId === 'identity'
              ? 'identityTab'
              : tabId === 'people'
                ? 'peopleTab'
                : tabId === 'scope'
                  ? 'scopeTab'
                  : tabId === 'finance'
                    ? 'financeTab'
                    : tabId === 'governance'
                      ? 'governanceTab'
                      : tabId === 'raidc'
                        ? 'raidcTab'
                        : 'paymentsTab',
          ),
        }))}
        currentId={activeTab}
        maxReached={steps.maxReached}
        onSelect={(id) => steps.select(id)}
      />

      <section className="overflow-hidden rounded-md border border-border bg-white p-0">
        <div className="border-b border-border bg-diriyah-bg-alt/80 px-6 py-4">
          <h2 className="text-lg font-semibold text-text">{t('formTitle')}</h2>
          <p className="text-sm text-text-muted">Master Trace {masterTraceId}</p>
        </div>

        {activeTab === 'identity' && (
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">
                {t('projectName')} <RequiredMark />
              </span>
              <input className="input-base" disabled={!unlocked} value={form.project_name} onChange={patch('project_name')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('projectType')}</span>
              <select className="input-base" disabled={!unlocked} value={form.project_type} onChange={patch('project_type')}>
                {['Delivery', 'Transformation', 'Compliance', 'Run'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('projectCategory')}</span>
              <input className="input-base" disabled={!unlocked} value={form.project_category} onChange={patch('project_category')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('complexity')}</span>
              <select className="input-base" disabled={!unlocked} value={form.complexity_rating} onChange={patch('complexity_rating')}>
                {['Low', 'Medium', 'High', 'Very High'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('priority')}</span>
              <select className="input-base" disabled={!unlocked} value={form.project_priority} onChange={patch('project_priority')}>
                {['Critical', 'High', 'Medium', 'Low'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('deliveryApproach')}</span>
              <select className="input-base" disabled={!unlocked} value={form.delivery_approach} onChange={patch('delivery_approach')}>
                {['Agile', 'Waterfall', 'Hybrid', 'Managed Service'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Initial Risk Rating</span>
              <select className="input-base" disabled={!unlocked} value={form.initial_risk_rating} onChange={patch('initial_risk_rating')}>
                {['Low', 'Medium', 'High', 'Critical'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('plannedStart')}</span>
              <input type="date" className="input-base" disabled={!unlocked} value={form.planned_start} onChange={patch('planned_start')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('plannedEnd')}</span>
              <input type="date" className="input-base" disabled={!unlocked} value={form.planned_finish} onChange={patch('planned_finish')} />
            </label>
          </div>
        )}

        {activeTab === 'people' && (
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">
                {t('projectManager')} <RequiredMark />
              </span>
              <input className="input-base" disabled={!unlocked} value={form.project_manager_id} onChange={patch('project_manager_id')} placeholder="user@diriyah.sa" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('sponsor')}</span>
              <input className="input-base" disabled={!unlocked} value={form.project_sponsor_user_id} onChange={patch('project_sponsor_user_id')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('businessOwner')}</span>
              <input className="input-base" disabled={!unlocked} value={form.business_owner_user_id} onChange={patch('business_owner_user_id')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('technologyOwner')}</span>
              <input className="input-base" disabled={!unlocked} value={form.technology_owner_user_id} onChange={patch('technology_owner_user_id')} />
            </label>
          </div>
        )}

        {activeTab === 'scope' && (
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-text">{t('purpose')}</span>
              <textarea className="input-base min-h-24 py-3" disabled={!unlocked} value={form.project_purpose} onChange={patch('project_purpose')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('scopeIn')}</span>
              <textarea className="input-base min-h-24 py-3" disabled={!unlocked} value={form.project_scope_in} onChange={patch('project_scope_in')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('scopeOut')}</span>
              <textarea className="input-base min-h-24 py-3" disabled={!unlocked} value={form.project_scope_out} onChange={patch('project_scope_out')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('deliverables')}</span>
              <p className="text-xs text-text-muted">One per line.</p>
              <textarea className="input-base min-h-24 py-3" disabled={!unlocked} value={form.project_deliverables} onChange={patch('project_deliverables')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('acceptanceCriteria')}</span>
              <p className="text-xs text-text-muted">One per line.</p>
              <textarea className="input-base min-h-24 py-3" disabled={!unlocked} value={form.project_success_measures} onChange={patch('project_success_measures')} />
            </label>
          </div>
        )}

        {activeTab === 'finance' && (
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('approvedBudget')}</span>
              <input type="number" min={0} className="input-base tabular-nums" disabled={!unlocked} value={form.approved_project_budget_sar} onChange={patch('approved_project_budget_sar')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('contractValue')}</span>
              <input type="number" min={0} className="input-base tabular-nums" disabled={!unlocked} value={form.contract_value_sar} onChange={patch('contract_value_sar')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">{t('contingency')}</span>
              <input type="number" min={0} className="input-base tabular-nums" disabled={!unlocked} value={form.project_contingency_sar} onChange={patch('project_contingency_sar')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Contract ID</span>
              <input className="input-base" disabled={!unlocked} value={form.contract_id} onChange={patch('contract_id')} />
            </label>
          </div>
        )}

        {activeTab === 'governance' && (
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Governance Tier</span>
              <select className="input-base" disabled={!unlocked} value={form.governance_tier} onChange={patch('governance_tier')}>
                {['Tier 1', 'Tier 2', 'Tier 3'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text">Reporting Frequency</span>
              <select className="input-base" disabled={!unlocked} value={form.project_reporting_frequency} onChange={patch('project_reporting_frequency')}>
                {['Weekly', 'Monthly', 'Quarterly'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 md:col-span-2">
              <input type="checkbox" checked={form.steering_committee_required} onChange={() => toggle('steering_committee_required')} disabled={!unlocked} className="accent-[var(--diriyah-primary)]" />
              <span className="text-sm font-medium text-text">Steering committee required</span>
            </label>
            <div className="md:col-span-2">
              <p className="mb-2 text-sm font-semibold text-text">{t('readinessChecks')}</p>
              {derivedReadiness ? (
                <div className="space-y-1">
                  <p className="text-xs text-text-muted">{t('checksDerivedHint')}</p>
                  <ul className="divide-y divide-border border-y border-border">
                    {[
                      { key: 'check_approved_demand', label: t('checkDemand'), value: derivedReadiness.check_approved_demand },
                      { key: 'check_approved_budget', label: t('checkBudget'), value: derivedReadiness.check_approved_budget },
                      { key: 'check_procurement_complete', label: t('checkProcurement'), value: derivedReadiness.check_procurement_complete },
                      { key: 'check_document_pack', label: t('checkDocPack'), value: derivedReadiness.check_document_pack },
                    ].map(({ key, label, value }) => (
                      <li key={key} className="flex items-center justify-between gap-3 py-3">
                        <span className="text-sm text-text">{label}</span>
                        {value ? (
                          <span className="text-sm font-medium text-text">{t('checkCompleted')}</span>
                        ) : (
                          <OfficialTag tone="warning">{t('checkNotMet')}</OfficialTag>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                    <input type="checkbox" checked={form.check_approved_demand} onChange={() => toggle('check_approved_demand')} disabled={!unlocked} className="accent-[var(--diriyah-primary)]" />
                    <span className="text-sm text-text">{t('checkDemand')}</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                    <input type="checkbox" checked={form.check_approved_budget} onChange={() => toggle('check_approved_budget')} disabled={!unlocked} className="accent-[var(--diriyah-primary)]" />
                    <span className="text-sm text-text">{t('checkBudget')}</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                    <input type="checkbox" checked={form.check_procurement_complete} onChange={() => toggle('check_procurement_complete')} disabled={!unlocked} className="accent-[var(--diriyah-primary)]" />
                    <span className="text-sm text-text">{t('checkProcurement')}</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                    <input type="checkbox" checked={form.check_document_pack} onChange={() => toggle('check_document_pack')} disabled={!unlocked} className="accent-[var(--diriyah-primary)]" />
                    <span className="text-sm text-text">{t('checkDocPack')}</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'raidc' && (
          <div className="px-6 py-6 space-y-4">
            <div>
              <p className="text-sm font-semibold text-text">RAIDC Register</p>
              <p className="text-xs text-text-muted mt-0.5">Log Risks, Assumptions, Issues, Decisions, and Changes for this project.</p>
            </div>
            {raidcRows.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-diriyah-bg-alt/80 border-b border-border">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">{t('raidcType')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">{t('raidcTitle')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">{t('raidcDesc')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">{t('raidcOwner')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">{t('raidcStatus')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">{t('raidcDue')}</th>
                      <th className="px-3 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {raidcRows.map((row) => (
                      <tr key={row.id} className="bg-white">
                        <td className="px-3 py-2">
                          <select
                            className="input-base text-sm py-1.5"
                            disabled={!unlocked}
                            value={row.type}
                            onChange={(e) => patchRaidcRow(row.id, 'type', e.target.value)}
                          >
                            {(['Risk', 'Assumption', 'Issue', 'Decision', 'Change'] as const).map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input-base text-sm py-1.5"
                            disabled={!unlocked}
                            value={row.title}
                            placeholder="Title"
                            onChange={(e) => patchRaidcRow(row.id, 'title', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <textarea
                            className="input-base text-sm py-1.5 min-h-[60px] resize-none"
                            disabled={!unlocked}
                            value={row.description}
                            placeholder="Description"
                            onChange={(e) => patchRaidcRow(row.id, 'description', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input-base text-sm py-1.5"
                            disabled={!unlocked}
                            value={row.owner}
                            placeholder="Owner"
                            onChange={(e) => patchRaidcRow(row.id, 'owner', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="input-base text-sm py-1.5"
                            disabled={!unlocked}
                            value={row.status}
                            onChange={(e) => patchRaidcRow(row.id, 'status', e.target.value)}
                          >
                            {(['Open', 'In Progress', 'Closed'] as const).map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            className="input-base text-sm py-1.5"
                            disabled={!unlocked}
                            value={row.due_date}
                            onChange={(e) => patchRaidcRow(row.id, 'due_date', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={!unlocked}
                            onClick={() => removeRaidcRow(row.id)}
                            className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-500 transition disabled:opacity-40"
                            title="Delete row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {raidcRows.length === 0 && (
              <div className="rounded-md border border-border bg-diriyah-bg-alt/40 px-6 py-8 text-center">
                <p className="text-sm text-text-muted">No RAIDC items yet. Click &ldquo;Add Row&rdquo; to start logging.</p>
              </div>
            )}
            <button
              type="button"
              disabled={!unlocked}
              onClick={addRaidcRow}
              className="flex items-center gap-2 rounded-md border border-diriyah-primary/40 bg-diriyah-primary/5 px-4 py-2 text-sm font-medium text-diriyah-primary hover:bg-diriyah-primary/10 transition disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {t('addRaidcRow')}
            </button>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="px-6 py-6 space-y-4">
            <div>
              <p className="text-sm font-semibold text-text">Payment Milestones</p>
              <p className="text-xs text-text-muted mt-0.5">Track payment schedule and status for this project.</p>
            </div>
            {paymentRows.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-diriyah-bg-alt/80 border-b border-border">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">{t('paymentMilestone')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">{t('paymentAmount')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">{t('paymentDue')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">{t('paymentStatus')}</th>
                      <th className="px-3 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paymentRows.map((row) => (
                      <tr key={row.id} className="bg-white">
                        <td className="px-3 py-2">
                          <input
                            className="input-base text-sm py-1.5"
                            disabled={!unlocked}
                            value={row.milestone_name}
                            placeholder="Milestone name"
                            onChange={(e) => patchPaymentRow(row.id, 'milestone_name', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            className="input-base text-sm py-1.5 tabular-nums"
                            disabled={!unlocked}
                            value={row.amount_sar}
                            placeholder="0"
                            onChange={(e) => patchPaymentRow(row.id, 'amount_sar', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            className="input-base text-sm py-1.5"
                            disabled={!unlocked}
                            value={row.due_date}
                            onChange={(e) => patchPaymentRow(row.id, 'due_date', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="input-base text-sm py-1.5"
                            disabled={!unlocked}
                            value={row.status}
                            onChange={(e) => patchPaymentRow(row.id, 'status', e.target.value)}
                          >
                            {(['Pending', 'Invoiced', 'Paid', 'Disputed'] as const).map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={!unlocked}
                            onClick={() => removePaymentRow(row.id)}
                            className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-500 transition disabled:opacity-40"
                            title="Delete row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-diriyah-bg-alt/60">
                      <td className="px-3 py-2.5 text-sm font-semibold text-text" colSpan={2}>
                        {t('totalPayments')}: SAR{' '}
                        {paymentRows
                          .reduce((sum, r) => sum + (parseFloat(r.amount_sar) || 0), 0)
                          .toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {paymentRows.length === 0 && (
              <div className="rounded-md border border-border bg-diriyah-bg-alt/40 px-6 py-8 text-center">
                <p className="text-sm text-text-muted">No payment milestones yet. Click &ldquo;Add Row&rdquo; to start.</p>
              </div>
            )}
            <button
              type="button"
              disabled={!unlocked}
              onClick={addPaymentRow}
              className="flex items-center gap-2 rounded-md border border-diriyah-primary/40 bg-diriyah-primary/5 px-4 py-2 text-sm font-medium text-diriyah-primary hover:bg-diriyah-primary/10 transition disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {t('addPaymentRow')}
            </button>
          </div>
        )}

        {error ? <p className="px-6 text-sm text-diriyah-red">{error}</p> : null}
        <div className="px-6 pb-4">
        <FormStepActions
          isFirst={steps.isFirst}
          isLast={steps.isLast}
          onBack={steps.goBack}
          onNext={handleNext}
          nextDisabled={
            unlocked &&
            ((activeTab === 'identity' && !form.project_name.trim()) ||
              (activeTab === 'people' && !form.project_manager_id.trim()))
          }
          hideNext={steps.isLast}
        >
          {steps.isLast ? (
            <button
              type="button"
              className="btn btn-primary h-11 px-6 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!unlocked || pending || !form.project_name || !form.project_manager_id || !checksReady}
              onClick={activate}
              title={!ready ? 'Locked until Acceptance/Completed' : !checksReady ? 'BR-035: complete the checklist' : undefined}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : !ready ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
              {pending ? t('activating') : t('activateProject')}
            </button>
          ) : null}
        </FormStepActions>
        </div>
      </section>

      <ApprovalGate
        entityType="PROJECT_REGISTRATION"
        entityId={procurementItemId}
        masterTraceId={masterTraceId}
        gateCode="G-PMO1"
        title="PMO Gate — Evidence & Approval"
        approverUserId="pmo.office"
      />
    </div>
  )
}
