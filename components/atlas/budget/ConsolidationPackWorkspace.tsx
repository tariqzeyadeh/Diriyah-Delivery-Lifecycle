'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/src/i18n/navigation'
import {
  CheckCircle,
  AlertTriangle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  ArrowLeft,
} from 'lucide-react'
import {
  saveConsolidationPack,
  type ConsolidationSummary,
  type DecisionItem,
  type ConsolidationRisk,
  type ProposedCondition,
} from '@/src/actions/consolidation'
import { useAuth } from '@/src/providers/AuthProvider'
import { OfficialTag } from '@/components/atlas/records'
import {
  FormStepActions,
  FormStepRail,
  RequiredMark,
  useFormSteps,
} from '@/components/atlas/forms/FormStepper'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtSar(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v)
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const CONSOL_STEPS = ['summary', 'recommendation', 'items', 'risks', 'conditions'] as const
type ConsolStep = (typeof CONSOL_STEPS)[number]

function Section({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="overflow-hidden rounded-md border border-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-diriyah-bg-alt/50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">{title}</span>
          {badge}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

function StatusPill({
  v,
  map,
}: {
  v: string | null
  map: Record<string, 'success' | 'warning' | 'danger' | 'neutral'>
}) {
  if (!v) return <span className="text-text-muted">—</span>
  return <OfficialTag tone={map[v] ?? 'neutral'}>{v}</OfficialTag>
}

const phasingColors: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Pass: 'success',
  Fail: 'danger',
  Pending: 'warning',
}
const accountingColors: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Pass: 'success',
  Warning: 'warning',
  Fail: 'danger',
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components: repeatable item editors
// ─────────────────────────────────────────────────────────────────────────────

function DecisionItemsEditor({
  items,
  onChange,
  disabled,
}: {
  items: DecisionItem[]
  onChange: (items: DecisionItem[]) => void
  disabled: boolean
}) {
  const t = useTranslations('consolidation')

  function add() {
    onChange([
      ...items,
      {
        item_id: uid(),
        description: '',
        amount_impact_sar: null,
        status: 'PENDING',
      },
    ])
  }
  function remove(id: string) {
    onChange(items.filter((i) => i.item_id !== id))
  }
  function patch(id: string, patch: Partial<DecisionItem>) {
    onChange(items.map((i) => (i.item_id === id ? { ...i, ...patch } : i)))
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div
          key={item.item_id}
          className="flex flex-wrap items-start gap-2 rounded-md border border-border bg-diriyah-bg-alt/50 p-3"
        >
          <span className="mt-2 w-5 text-center text-xs font-bold text-text-muted">{idx + 1}</span>
          <input
            type="text"
            value={item.description}
            onChange={(e) => patch(item.item_id, { description: e.target.value })}
            placeholder={t('decisionDesc')}
            disabled={disabled}
            className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-diriyah-primary disabled:opacity-50"
          />
          <input
            type="number"
            value={item.amount_impact_sar ?? ''}
            onChange={(e) =>
              patch(item.item_id, {
                amount_impact_sar: e.target.value ? Number(e.target.value) : null,
              })
            }
            placeholder={t('amountImpact')}
            disabled={disabled}
            className="w-36 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-diriyah-primary disabled:opacity-50"
          />
          <select
            value={item.status}
            onChange={(e) =>
              patch(item.item_id, { status: e.target.value as DecisionItem['status'] })
            }
            disabled={disabled}
            className="rounded-lg border border-border bg-white px-2 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-diriyah-primary disabled:opacity-50"
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="DEFERRED">Deferred</option>
            <option value="REJECTED">Rejected</option>
          </select>
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(item.item_id)}
              className="mt-1.5 text-red-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-sm font-medium text-diriyah-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          {t('addDecisionItem')}
        </button>
      )}
    </div>
  )
}

function RisksEditor({
  items,
  onChange,
  disabled,
}: {
  items: ConsolidationRisk[]
  onChange: (items: ConsolidationRisk[]) => void
  disabled: boolean
}) {
  const t = useTranslations('consolidation')

  function add() {
    onChange([
      ...items,
      {
        risk_id: uid(),
        description: '',
        probability: 'Medium',
        impact: 'Medium',
        mitigation: '',
      },
    ])
  }
  function remove(id: string) {
    onChange(items.filter((i) => i.risk_id !== id))
  }
  function patch(id: string, p: Partial<ConsolidationRisk>) {
    onChange(items.map((i) => (i.risk_id === id ? { ...i, ...p } : i)))
  }

  return (
    <div className="space-y-3">
      {items.map((risk, idx) => (
        <div
          key={risk.risk_id}
          className="space-y-2 rounded-md border border-border bg-diriyah-bg-alt/50 p-3"
        >
          <div className="flex items-center gap-2">
            <span className="w-5 text-center text-xs font-bold text-text-muted">{idx + 1}</span>
            <input
              type="text"
              value={risk.description}
              onChange={(e) => patch(risk.risk_id, { description: e.target.value })}
              placeholder={t('riskDesc')}
              disabled={disabled}
              className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-diriyah-primary disabled:opacity-50"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(risk.risk_id)}
                className="text-red-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pl-7">
            <select
              value={risk.probability}
              onChange={(e) =>
                patch(risk.risk_id, {
                  probability: e.target.value as ConsolidationRisk['probability'],
                })
              }
              disabled={disabled}
              className="rounded-lg border border-border bg-white px-2 py-2 text-sm text-text focus:outline-none disabled:opacity-50"
            >
              <option value="Low">Low probability</option>
              <option value="Medium">Medium probability</option>
              <option value="High">High probability</option>
            </select>
            <select
              value={risk.impact}
              onChange={(e) =>
                patch(risk.risk_id, { impact: e.target.value as ConsolidationRisk['impact'] })
              }
              disabled={disabled}
              className="rounded-lg border border-border bg-white px-2 py-2 text-sm text-text focus:outline-none disabled:opacity-50"
            >
              <option value="Low">Low impact</option>
              <option value="Medium">Medium impact</option>
              <option value="High">High impact</option>
            </select>
            <input
              type="text"
              value={risk.mitigation}
              onChange={(e) => patch(risk.risk_id, { mitigation: e.target.value })}
              placeholder={t('riskMitigation')}
              disabled={disabled}
              className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-diriyah-primary disabled:opacity-50"
            />
          </div>
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-sm font-medium text-diriyah-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          {t('addRisk')}
        </button>
      )}
    </div>
  )
}

function ConditionsEditor({
  items,
  onChange,
  disabled,
}: {
  items: ProposedCondition[]
  onChange: (items: ProposedCondition[]) => void
  disabled: boolean
}) {
  const t = useTranslations('consolidation')

  function add() {
    onChange([
      ...items,
      { condition_id: uid(), condition_text: '', owner: '', due_date: null },
    ])
  }
  function remove(id: string) {
    onChange(items.filter((i) => i.condition_id !== id))
  }
  function patch(id: string, p: Partial<ProposedCondition>) {
    onChange(items.map((i) => (i.condition_id === id ? { ...i, ...p } : i)))
  }

  return (
    <div className="space-y-3">
      {items.map((cond, idx) => (
        <div
          key={cond.condition_id}
          className="flex flex-wrap items-start gap-2 rounded-md border border-border bg-diriyah-bg-alt/50 p-3"
        >
          <span className="mt-2 w-5 text-center text-xs font-bold text-text-muted">{idx + 1}</span>
          <input
            type="text"
            value={cond.condition_text}
            onChange={(e) => patch(cond.condition_id, { condition_text: e.target.value })}
            placeholder={t('conditionText')}
            disabled={disabled}
            className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-diriyah-primary disabled:opacity-50"
          />
          <input
            type="text"
            value={cond.owner}
            onChange={(e) => patch(cond.condition_id, { owner: e.target.value })}
            placeholder={t('conditionOwner')}
            disabled={disabled}
            className="w-40 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-diriyah-primary disabled:opacity-50"
          />
          <input
            type="date"
            value={cond.due_date ?? ''}
            onChange={(e) =>
              patch(cond.condition_id, { due_date: e.target.value || null })
            }
            disabled={disabled}
            className="w-36 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-diriyah-primary disabled:opacity-50"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(cond.condition_id)}
              className="mt-1.5 text-red-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-sm font-medium text-diriyah-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          {t('addCondition')}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export type ConsolidationPackWorkspaceProps = {
  pack: ConsolidationSummary
  budgetSubmissionId: string
}

export function ConsolidationPackWorkspace({
  pack,
  budgetSubmissionId,
}: ConsolidationPackWorkspaceProps) {
  const t = useTranslations('consolidation')
  const tc = useTranslations('common')
  const router = useRouter()
  const { currentUser } = useAuth()

  const isLocked = pack.is_locked
  const steps = useFormSteps([...CONSOL_STEPS], 'summary', isLocked)
  const activeStep = steps.currentId as ConsolStep

  const [summary, setSummary] = useState(pack.funding_recommendation_summary ?? '')
  const [recommendedAmt, setRecommendedAmt] = useState(
    pack.recommended_amount_sar != null ? String(pack.recommended_amount_sar) : '',
  )
  const [decisionItems, setDecisionItems] = useState<DecisionItem[]>(pack.specific_decision_items)
  const [risks, setRisks] = useState<ConsolidationRisk[]>(pack.consolidation_risks)
  const [conditions, setConditions] = useState<ProposedCondition[]>(pack.proposed_conditions)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function persist(): Promise<boolean> {
    const res = await saveConsolidationPack({
      budget_submission_id: budgetSubmissionId,
      funding_recommendation_summary: summary,
      specific_decision_items: decisionItems,
      consolidation_risks: risks,
      proposed_conditions: conditions,
      recommended_amount_sar: recommendedAmt ? Number(recommendedAmt) : null,
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
    if (activeStep === 'recommendation' && summary.trim().length < 20) {
      setResult({ ok: false, message: tc('fillRequired') })
      return
    }
    startTransition(async () => {
      setResult(null)
      const ok = await persist()
      if (ok) steps.advance()
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/budget"
            className="inline-flex items-center gap-1 text-xs font-semibold text-diriyah-accent no-underline hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            Back to Budget
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
            PI-03 · {t('module')}
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-text">
            {t('pageTitle')}
          </h1>
          <p className="max-w-2xl text-sm text-text-muted">{t('desc')}</p>
        </div>
        <Link
          href={`/budget/${encodeURIComponent(budgetSubmissionId)}/lines`}
          className="btn h-9 shrink-0 self-start border-border bg-white px-3 text-xs no-underline"
        >
          Back to Lines
        </Link>
      </div>

      {isLocked && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <PackageCheck className="h-4 w-4 shrink-0" />
          {t('lockedByApproval')}
        </div>
      )}

      {pack.requested_amount_sar != null &&
        pack.funding_ceiling_sar != null &&
        pack.funding_ceiling_sar > 0 &&
        pack.requested_amount_sar > pack.funding_ceiling_sar && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t('overCommitWarning')}
          </div>
        )}

      <FormStepRail
        steps={[
          { id: 'summary', label: t('summarySection') },
          { id: 'recommendation', label: t('con018Title') },
          { id: 'items', label: t('con019Title') },
          { id: 'risks', label: t('con020Title') },
          { id: 'conditions', label: t('con021Title') },
        ]}
        currentId={activeStep}
        maxReached={steps.maxReached}
        onSelect={(id) => steps.select(id)}
      />

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

      {/* Computed summary */}
      {activeStep === 'summary' && (
      <Section title={t('summarySection')} defaultOpen>
        <dl className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: t('requestedAmount'), value: fmtSar(pack.requested_amount_sar) },
            { label: t('fundingCeiling'), value: fmtSar(pack.funding_ceiling_sar) },
            { label: t('fundingGap'), value: fmtSar(pack.funding_gap_sar) },
            {
              label: t('includedDemands'),
              value: String(pack.included_demand_count),
            },
          ].map((f) => (
            <div key={f.label}>
              <dt className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {f.label}
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-text">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-3">
          <div>
            <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('phasingCheck')}
            </span>
            <StatusPill v={pack.line_phasing_reconciliation} map={phasingColors} />
          </div>
          <div>
            <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t('accountingCheck')}
            </span>
            <StatusPill v={pack.accounting_dimensions_check} map={accountingColors} />
          </div>
          {pack.unresolved_findings_count > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {pack.unresolved_findings_count} {t('unresolvedFindings')}
            </div>
          )}
        </div>
      </Section>
      )}

      {/* CON-018: Funding Recommendation Summary */}
      {activeStep === 'recommendation' && (
      <Section
        title={t('con018Title')}
        badge={
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
            REQUIRED
          </span>
        }
      >
        <div className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {t('recommendedAmount')}
            </label>
            <input
              type="number"
              value={recommendedAmt}
              onChange={(e) => setRecommendedAmt(e.target.value)}
              disabled={isLocked}
              placeholder="SAR"
              className="w-52 rounded-md border border-border bg-diriyah-bg-alt px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted/60 focus:border-diriyah-primary focus:outline-none focus:ring-2 focus:ring-diriyah-primary/20 disabled:opacity-50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {t('summaryNarrative')} <RequiredMark />
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={6}
              disabled={isLocked}
              placeholder={t('summaryPlaceholder')}
              className="w-full resize-y rounded-md border border-border bg-diriyah-bg-alt px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted/60 focus:border-diriyah-primary focus:outline-none focus:ring-2 focus:ring-diriyah-primary/20 disabled:opacity-50"
            />
            <p className="text-xs text-text-muted">
              {t('con018Hint')}
            </p>
          </div>
        </div>
      </Section>
      )}

      {/* CON-019: Specific Decision Items */}
      {activeStep === 'items' && (
      <Section title={t('con019Title')} defaultOpen={decisionItems.length > 0}>
        <div className="mt-2">
          <p className="mb-3 text-xs text-text-muted">{t('con019Hint')}</p>
          <DecisionItemsEditor
            items={decisionItems}
            onChange={setDecisionItems}
            disabled={isLocked}
          />
        </div>
      </Section>
      )}

      {/* CON-020: Consolidation Risks */}
      {activeStep === 'risks' && (
      <Section title={t('con020Title')} defaultOpen={risks.length > 0}>
        <div className="mt-2">
          <p className="mb-3 text-xs text-text-muted">{t('con020Hint')}</p>
          <RisksEditor items={risks} onChange={setRisks} disabled={isLocked} />
        </div>
      </Section>
      )}

      {/* CON-021: Proposed Conditions */}
      {activeStep === 'conditions' && (
      <Section title={t('con021Title')} defaultOpen={conditions.length > 0}>
        <div className="mt-2">
          <p className="mb-3 text-xs text-text-muted">{t('con021Hint')}</p>
          <ConditionsEditor items={conditions} onChange={setConditions} disabled={isLocked} />
        </div>
      </Section>
      )}

      {!isLocked && (
        <FormStepActions
          isFirst={steps.isFirst}
          isLast={steps.isLast}
          onBack={steps.goBack}
          onNext={handleNext}
          nextDisabled={activeStep === 'recommendation' && summary.trim().length < 20}
          nextPending={pending}
          hideNext={steps.isLast}
        >
          {steps.isLast ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="inline-flex h-11 items-center rounded-md bg-diriyah-primary px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? t('saving') : t('saveGovernance')}
              </button>
              <p className="text-xs text-text-muted">{t('saveHint')}</p>
            </div>
          ) : null}
        </FormStepActions>
      )}
    </div>
  )
}
