'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/src/i18n/navigation'
import { CheckCircle, AlertTriangle, ClipboardList, Plus, Trash2 } from 'lucide-react'
import {
  saveProcurementPlanHeader,
  type ProcurementPlanHeader,
} from '@/src/actions/procurement'
import { useAuth } from '@/src/providers/AuthProvider'
import { cn } from '@/lib/utils'
import {
  FormStepActions,
  FormStepRail,
  RequiredMark,
  useFormSteps,
} from '@/components/atlas/forms/FormStepper'

type PlanTab = 'header' | 'sourcing' | 'milestones'
const PLAN_TAB_IDS: PlanTab[] = ['header', 'sourcing', 'milestones']

type MilestoneRow = {
  id: string
  name: string
  target_date: string
  stage: string
  responsible: string
}

type SourcingStrategy = {
  category: string
  approach: string
  rationale: string
  estimated_value_sar: number | null
}

function fmtSar(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v)
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}
        {required ? <> <RequiredMark /></> : null}
      </label>
      {children}
    </div>
  )
}

export type ProcurementPlanHeaderFormProps = {
  plan: ProcurementPlanHeader
}

export function ProcurementPlanHeaderForm({ plan }: ProcurementPlanHeaderFormProps) {
  const t = useTranslations('procurementPlan')
  const tp = useTranslations('procurement')
  const tc = useTranslations('common')
  const router = useRouter()
  const { currentUser } = useAuth()

  const isLocked = plan.is_locked && plan.record_status !== 'DRAFT'
  const steps = useFormSteps(PLAN_TAB_IDS, 'header', isLocked)
  const activeTab = steps.currentId as PlanTab

  const [title, setTitle] = useState(plan.procurement_plan_title)
  const [startDate, setStartDate] = useState(plan.plan_start_date ?? '')
  const [endDate, setEndDate] = useState(plan.plan_end_date ?? '')
  const [owner, setOwner] = useState(plan.procurement_plan_owner_user_id ?? '')
  const [authStatus, setAuthStatus] = useState(plan.release_authorization_status ?? 'APPROVED')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  // G-33: Sourcing strategy rows
  const [sourcing, setSourcing] = useState<SourcingStrategy[]>([
    { category: 'Technology Infrastructure', approach: 'Open Tender', rationale: '', estimated_value_sar: null },
    { category: 'Implementation Services', approach: 'Restricted Tender', rationale: '', estimated_value_sar: null },
    { category: 'Maintenance & Support', approach: 'Direct Award', rationale: '', estimated_value_sar: null },
  ])

  // G-33: Milestone schedule rows
  const [milestones, setMilestones] = useState<MilestoneRow[]>([
    { id: 'ms-1', name: 'PR Submission', target_date: '', stage: 'PR_PREP', responsible: '' },
    { id: 'ms-2', name: 'RFx Issued', target_date: '', stage: 'RFX', responsible: '' },
    { id: 'ms-3', name: 'Award Decision', target_date: '', stage: 'AWARD', responsible: '' },
    { id: 'ms-4', name: 'Contract Signed', target_date: '', stage: 'COMMITMENT', responsible: '' },
    { id: 'ms-5', name: 'Delivery Complete', target_date: '', stage: 'DELIVERY', responsible: '' },
    { id: 'ms-6', name: 'Acceptance Sign-off', target_date: '', stage: 'ACCEPTANCE', responsible: '' },
  ])

  async function persist(): Promise<boolean> {
    const res = await saveProcurementPlanHeader({
      procurement_plan_id: plan.procurement_plan_id,
      procurement_plan_title: title,
      plan_start_date: startDate || null,
      plan_end_date: endDate || null,
      procurement_plan_owner_user_id: owner || null,
      release_authorization_status: authStatus || null,
      modified_by: currentUser.email,
    })
    if (res.ok) {
      setResult({ ok: true, message: t('saveSuccess') })
      router.refresh()
      return true
    }
    setResult({ ok: false, message: res.error })
    return false
  }

  function save() {
    startTransition(async () => {
      setResult(null)
      await persist()
    })
  }

  function handleNext() {
    if (pending || isLocked) return
    if (activeTab === 'header' && !title.trim()) {
      setResult({ ok: false, message: tc('fillRequired') })
      return
    }
    startTransition(async () => {
      setResult(null)
      const ok = await persist()
      if (ok) steps.advance()
    })
  }

  const PLAN_TABS: { id: PlanTab; label: string }[] = [
    { id: 'header', label: tp('planHeaderTab') },
    { id: 'sourcing', label: tp('sourcingTab') },
    { id: 'milestones', label: tp('milestonesTab') },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
          PI-07 · {t('module')}
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm text-text-muted">{t('desc')}</p>
      </div>

      <FormStepRail
        steps={PLAN_TABS}
        currentId={activeTab}
        maxReached={steps.maxReached}
        onSelect={(id) => steps.select(id)}
      />

      {/* ── Sourcing Strategy Tab ────────────────────────────────────────────── */}
      {activeTab === 'sourcing' && (
        <div className="rounded-md border border-border bg-white p-5">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
            Sourcing Strategy by Category
          </p>
          <p className="mb-4 text-xs text-text-muted">
            Define the sourcing approach for each procurement category. This informs the
            competitive method, approval thresholds, and risk assessment.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">{tp('deliveryMethod')}</th>
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">{tp('contractType')}</th>
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">{tp('estimatedValue')}</th>
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">{tp('stage')}</th>
              </tr>
            </thead>
            <tbody>
              {sourcing.map((row, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2 pr-3">
                    <input
                      className="w-full rounded-lg border border-border bg-diriyah-bg-alt px-2 py-1.5 text-sm"
                      value={row.category}
                      onChange={(e) => setSourcing((s) => s.map((r, j) => j === i ? { ...r, category: e.target.value } : r))}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className="w-full rounded-lg border border-border bg-diriyah-bg-alt px-2 py-1.5 text-sm"
                      value={row.approach}
                      onChange={(e) => setSourcing((s) => s.map((r, j) => j === i ? { ...r, approach: e.target.value } : r))}
                      disabled={isLocked}
                    >
                      {['Open Tender', 'Restricted Tender', 'Direct Award', 'Framework Agreement', 'Mini Competition'].map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number" min={0}
                      className="w-full rounded-lg border border-border bg-diriyah-bg-alt px-2 py-1.5 text-sm tabular-nums"
                      value={row.estimated_value_sar ?? ''}
                      onChange={(e) => setSourcing((s) => s.map((r, j) => j === i ? { ...r, estimated_value_sar: e.target.value ? Number(e.target.value) : null } : r))}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="py-2">
                    <input
                      className="w-full rounded-lg border border-border bg-diriyah-bg-alt px-2 py-1.5 text-sm"
                      value={row.rationale}
                      placeholder="Rationale…"
                      onChange={(e) => setSourcing((s) => s.map((r, j) => j === i ? { ...r, rationale: e.target.value } : r))}
                      disabled={isLocked}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLocked && (
            <button
              type="button"
              onClick={() => setSourcing((s) => [...s, { category: '', approach: 'Open Tender', rationale: '', estimated_value_sar: null }])}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-diriyah-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add row
            </button>
          )}
        </div>
      )}

      {/* ── Milestone Schedule Tab ────────────────────────────────────────────── */}
      {activeTab === 'milestones' && (
        <div className="rounded-md border border-border bg-white p-5">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
            Procurement Milestone Schedule
          </p>
          <p className="mb-4 text-xs text-text-muted">
            Map key procurement milestones to target dates and pipeline stages.
            These feed into the SLA monitor and delay exception engine.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">{tp('milestoneTitle')}</th>
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">{tp('stage')}</th>
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">{tp('milestoneDate')}</th>
                <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">{tp('milestoneStatus')}</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((ms, i) => {
                const isPast = ms.target_date && new Date(ms.target_date) < new Date()
                return (
                  <tr key={ms.id} className={cn('border-b border-border/50', isPast && ms.target_date ? 'bg-red-50' : '')}>
                    <td className="py-2 pr-3">
                      <input
                        className="w-full rounded-lg border border-border bg-diriyah-bg-alt px-2 py-1.5 text-sm"
                        value={ms.name}
                        onChange={(e) => setMilestones((m) => m.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                        disabled={isLocked}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        className="rounded-lg border border-border bg-diriyah-bg-alt px-2 py-1.5 text-sm"
                        value={ms.stage}
                        onChange={(e) => setMilestones((m) => m.map((r, j) => j === i ? { ...r, stage: e.target.value } : r))}
                        disabled={isLocked}
                      >
                        {['PR_PREP','PR_APPROVAL','RFX','EVALUATION','AWARD','COMMITMENT','DELIVERY','ACCEPTANCE','COMPLETED'].map((s) => (
                          <option key={s} value={s}>{s.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="date"
                        className={cn('rounded-lg border px-2 py-1.5 text-sm', isPast && ms.target_date ? 'border-red-400 bg-red-50' : 'border-border bg-diriyah-bg-alt')}
                        value={ms.target_date}
                        onChange={(e) => setMilestones((m) => m.map((r, j) => j === i ? { ...r, target_date: e.target.value } : r))}
                        disabled={isLocked}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="w-full rounded-lg border border-border bg-diriyah-bg-alt px-2 py-1.5 text-sm"
                        value={ms.responsible}
                        placeholder="User or team…"
                        onChange={(e) => setMilestones((m) => m.map((r, j) => j === i ? { ...r, responsible: e.target.value } : r))}
                        disabled={isLocked}
                      />
                    </td>
                    <td className="py-2">
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => setMilestones((m) => m.filter((_, j) => j !== i))}
                          className="text-text-muted/60 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!isLocked && (
            <button
              type="button"
              onClick={() => setMilestones((m) => [...m, { id: `ms-${Date.now()}`, name: '', target_date: '', stage: 'PLANNED', responsible: '' }])}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-diriyah-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> {tp('addMilestone')}
            </button>
          )}
        </div>
      )}

      {/* ── Plan Header Tab ────────────────────────────────────────────────── */}
      {activeTab === 'header' && <>

      {/* Identity card */}
      <div className="rounded-md border border-border bg-white p-5">
        <div className="flex flex-wrap items-center gap-4">
          <ClipboardList className="h-8 w-8 text-diriyah-primary" />
          <div>
            <p className="font-mono text-xs text-text-muted">{plan.master_trace_id}</p>
            <p className="text-base font-semibold text-text">{plan.procurement_plan_title}</p>
            <p className="font-mono text-xs text-text-muted">{plan.procurement_plan_id}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          {[
            { label: t('approvedFunding'), value: fmtSar(plan.approved_funding_available_sar) },
            { label: t('plannedValue'), value: fmtSar(plan.planned_procurement_value_sar) },
            { label: t('itemCount'), value: String(plan.procurement_item_count ?? '—') },
            { label: t('status'), value: plan.record_status ?? '—' },
          ].map((f) => (
            <div key={f.label}>
              <dt className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {f.label}
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-text">{f.value}</dd>
            </div>
          ))}
        </div>
      </div>

      {/* Editable fields */}
      <div className="rounded-md border border-border bg-white p-5">
        <p className="mb-5 text-sm font-semibold uppercase tracking-wide text-text-muted">
          {t('planDetails')}
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('planTitle')} required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLocked}
              className="w-full rounded-md border border-border bg-diriyah-bg-alt px-3.5 py-2.5 text-sm text-text focus:border-diriyah-primary focus:outline-none focus:ring-2 focus:ring-diriyah-primary/20 disabled:opacity-50"
            />
          </Field>

          <Field label={t('planOwner')}>
            <input
              type="email"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              disabled={isLocked}
              placeholder="user@diriyah.sa"
              className="w-full rounded-md border border-border bg-diriyah-bg-alt px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted/60 focus:border-diriyah-primary focus:outline-none focus:ring-2 focus:ring-diriyah-primary/20 disabled:opacity-50"
            />
          </Field>

          <Field label={t('startDate')}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={isLocked}
              className="w-full rounded-md border border-border bg-diriyah-bg-alt px-3.5 py-2.5 text-sm text-text focus:border-diriyah-primary focus:outline-none focus:ring-2 focus:ring-diriyah-primary/20 disabled:opacity-50"
            />
          </Field>

          <Field label={t('endDate')}>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={isLocked}
              className="w-full rounded-md border border-border bg-diriyah-bg-alt px-3.5 py-2.5 text-sm text-text focus:border-diriyah-primary focus:outline-none focus:ring-2 focus:ring-diriyah-primary/20 disabled:opacity-50"
            />
          </Field>

          <Field label={t('releaseAuthorization')}>
            <select
              value={authStatus}
              onChange={(e) => setAuthStatus(e.target.value)}
              disabled={isLocked}
              className="w-full rounded-md border border-border bg-diriyah-bg-alt px-3.5 py-2.5 text-sm text-text focus:border-diriyah-primary focus:outline-none focus:ring-2 focus:ring-diriyah-primary/20 disabled:opacity-50"
            >
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending Approval</option>
              <option value="CONDITIONAL">Conditional</option>
              <option value="ON_HOLD">On Hold</option>
            </select>
          </Field>
        </div>

        {/* Result + save */}
        <div className="mt-6 space-y-3 border-t border-border pt-5">
          {result && (
            <div
              className={cn(
                'flex items-start gap-2.5 rounded-md px-4 py-3 text-sm',
                result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800',
              )}
            >
              {result.ok ? (
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              )}
              <span>{result.message}</span>
            </div>
          )}
        </div>
      </div>

      </> /* end activeTab === 'header' */ }

      {!isLocked && (
        <FormStepActions
          isFirst={steps.isFirst}
          isLast={steps.isLast}
          onBack={steps.goBack}
          onNext={handleNext}
          nextDisabled={activeTab === 'header' && !title.trim()}
          nextPending={pending}
          hideNext={steps.isLast}
        >
          {steps.isLast ? (
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex h-11 items-center rounded-md bg-diriyah-primary px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? t('saving') : t('saveHeader')}
            </button>
          ) : null}
        </FormStepActions>
      )}
    </div>
  )
}
