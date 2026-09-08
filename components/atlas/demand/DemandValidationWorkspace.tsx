'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/src/i18n/navigation'
import { AlertTriangle, CheckCircle, RotateCcw, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import {
  VALIDATION_DECISION_LABELS,
  type ValidationDecision,
} from '@/lib/atlas/demand-validation'
import {
  validateDemand,
  type DemandValidationDetail,
} from '@/src/actions/demand-validation'
import { useAuth } from '@/src/providers/AuthProvider'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtSar(v: number | null): string {
  if (!v) return '—'
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(v)
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</dt>
      <dd className="text-sm text-text">{value ?? '—'}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-md border border-border bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-diriyah-bg-alt/50"
      >
        <span className="text-sm font-semibold text-text">{title}</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type DemandValidationWorkspaceProps = {
  detail: DemandValidationDetail
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DemandValidationWorkspace({ detail }: DemandValidationWorkspaceProps) {
  const t = useTranslations('demandValidation')
  const router = useRouter()
  const { currentUser } = useAuth()

  const alreadyDecided =
    detail.budget_validation_decision &&
    !['SUBMITTED', 'UNDER_VALIDATION'].includes(detail.record_status ?? '')

  const [decision, setDecision] = useState<ValidationDecision>(
    (detail.budget_validation_decision as ValidationDecision) ?? 'VALIDATED',
  )
  const [comments, setComments] = useState(detail.budget_validation_comments ?? '')
  const [dupDisposition, setDupDisposition] = useState('')
  const [dupRelatedIds, setDupRelatedIds] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const hasDuplicate =
    detail.duplicate_check_result.status === 'POTENTIAL_DUPLICATE' ||
    detail.duplicate_check_result.status === 'DUPLICATE'

  function submit() {
    startTransition(async () => {
      setResult(null)
      const res = await validateDemand({
        demand_id: detail.demand_id,
        decision,
        comments,
        duplicate_disposition: dupDisposition || undefined,
        duplicate_related_ids: dupRelatedIds
          ? dupRelatedIds.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        validated_by: currentUser.email,
      })
      if (res.ok) {
        setResult({
          ok: true,
          message:
            res.decision === 'VALIDATED'
              ? t('successValidated')
              : res.decision === 'VALIDATED_COND'
                ? t('successValidatedCond')
                : res.decision === 'RETURNED'
                  ? t('successReturned')
                  : `Decision recorded: ${VALIDATION_DECISION_LABELS[res.decision] ?? res.decision}`,
        })
        router.refresh()
      } else {
        setResult({ ok: false, message: res.error })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
          PI-06 · {t('stageLabel')}
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-text">
          {t('workspaceTitle')}
        </h1>
        <p className="max-w-2xl text-sm text-text-muted">{t('workspaceDesc')}</p>
      </div>

      {/* Identity + completeness */}
      <div className="rounded-md border border-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-text-muted">{detail.master_trace_id}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-text">{detail.demand_title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-diriyah-bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-text-muted">
                {detail.entry_route}
              </span>
              {detail.urgency && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  {detail.urgency}
                </span>
              )}
              {detail.submitted_at && (
                <span className="text-xs text-text-muted">
                  {t('submittedOn')} {new Date(detail.submitted_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          {/* Completeness gauge */}
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {t('completeness')}
            </p>
            <span
              className={cn(
                'text-xl font-bold tabular-nums',
                detail.completeness_score_pct >= 80
                  ? 'text-green-600'
                  : detail.completeness_score_pct >= 60
                    ? 'text-amber-600'
                    : 'text-red-600',
              )}
            >
              {detail.completeness_score_pct}%
            </span>
          </div>
        </div>
      </div>

      {/* Duplicate check alert */}
      {hasDuplicate && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1 space-y-3">
              <div>
                <p className="font-semibold text-amber-800">{t('duplicateAlert')}</p>
                <p className="mt-0.5 text-sm text-amber-700">{t('duplicateAlertDesc')}</p>
              </div>
              <ul className="space-y-1.5">
                {detail.duplicate_check_result.potential_matches.map((m) => (
                  <li
                    key={m.demand_id}
                    className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-text">{m.demand_title}</span>
                    <span className="font-mono text-xs text-text-muted">{m.demand_id}</span>
                  </li>
                ))}
              </ul>
              {/* BR-020 disposition */}
              <div className="space-y-3 border-t border-amber-200 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  {t('br020Disposition')}
                </p>
                <textarea
                  value={dupDisposition}
                  onChange={(e) => setDupDisposition(e.target.value)}
                  rows={3}
                  placeholder={t('br020DispositionPlaceholder')}
                  disabled={!!alreadyDecided}
                  className="w-full resize-y rounded-md border border-amber-200 bg-white px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
                />
                <input
                  type="text"
                  value={dupRelatedIds}
                  onChange={(e) => setDupRelatedIds(e.target.value)}
                  placeholder={t('br020RelatedIds')}
                  disabled={!!alreadyDecided}
                  className="w-full rounded-md border border-amber-200 bg-white px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
                />
                <p className="text-xs text-amber-700">{t('br020Hint')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Financial summary */}
      <Section title={t('financialSection')}>
        <dl className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label={t('oneTimeCost')} value={fmtSar(detail.indicative_one_time_cost_sar)} />
          <Field label={t('recurringCost')} value={fmtSar(detail.indicative_recurring_cost_sar)} />
          <Field label={t('tco')} value={fmtSar(detail.tco_sar)} />
          <Field label={t('estimateBasis')} value={detail.cost_estimate_basis} />
          <Field label={t('estimateConf')} value={detail.estimate_confidence} />
          <Field label={t('deliveryMode')} value={detail.delivery_mode} />
        </dl>
        {detail.options.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {t('optionsLabel')}
            </p>
            <ul className="space-y-1.5">
              {detail.options.map((o, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-md border border-border bg-diriyah-bg-alt px-4 py-2.5 text-sm"
                >
                  <span className={cn('font-medium text-text', o.is_do_nothing && 'italic text-text-muted')}>
                    {o.option_name}
                    {o.is_do_nothing && ' (Do Nothing)'}
                  </span>
                  <span className="text-xs text-text-muted">
                    {fmtSar(o.option_estimated_cost_sar)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Scope & problem */}
      <Section title={t('scopeSection')}>
        <dl className="mt-2 grid gap-4">
          <Field label={t('problemStatement')} value={detail.problem_opportunity_statement} />
          <Field label={t('scopeIn')} value={detail.scope_in} />
          <Field label={t('scopeOut')} value={detail.scope_out} />
          {detail.ad_hoc_justification && (
            <Field label={t('adHocJustification')} value={detail.ad_hoc_justification} />
          )}
        </dl>
      </Section>

      {/* Review outputs */}
      {(detail.architecture_assessment_summary || detail.security_requirements) && (
        <Section title={t('reviewOutputsSection')}>
          <dl className="mt-2 grid gap-4">
            {detail.architecture_assessment_summary && (
              <Field label={t('archAssessment')} value={detail.architecture_assessment_summary} />
            )}
            {detail.security_requirements && (
              <Field label={t('secReqs')} value={detail.security_requirements} />
            )}
          </dl>
        </Section>
      )}

      {/* Decision area */}
      {alreadyDecided ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-5">
          <p className="font-semibold text-green-800">
            {t('alreadyDecidedLabel')}: {detail.budget_validation_decision}
          </p>
          {detail.budget_validation_comments && (
            <p className="mt-1 text-sm text-green-700">{detail.budget_validation_comments}</p>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-white p-5 space-y-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            {t('decisionLabel')}
          </p>

          {/* Decision selector */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(
              [
                'VALIDATED',
                'VALIDATED_COND',
                'CONDITIONAL',
                'RETURNED',
                'DEFERRED',
                'NOT_FUNDABLE',
              ] as ValidationDecision[]
            ).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDecision(d)}
                className={cn(
                  'rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors',
                  decision === d
                    ? d === 'VALIDATED'
                      ? 'border-green-400 bg-green-50 text-green-700'
                      : d === 'VALIDATED_COND' || d === 'CONDITIONAL'
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : d === 'RETURNED'
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : d === 'DEFERRED'
                            ? 'border-purple-400 bg-purple-50 text-purple-700'
                            : 'border-red-400 bg-red-50 text-red-700'
                    : 'border-border bg-white text-text-muted hover:bg-diriyah-bg-alt',
                )}
              >
                {VALIDATION_DECISION_LABELS[d]}
              </button>
            ))}
          </div>

          {/* Comments */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {t('commentsLabel')}
              {(['VALIDATED_COND', 'CONDITIONAL', 'RETURNED', 'NOT_FUNDABLE', 'DEFERRED'] as ValidationDecision[]).includes(decision) && (
                <span className="ml-1 text-red-500">*</span>
              )}
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              placeholder={
                decision === 'VALIDATED'
                  ? t('commentsOptionalPlaceholder')
                  : t('commentsRequiredPlaceholder')
              }
              className="w-full resize-y rounded-md border border-border bg-diriyah-bg-alt px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted/60 focus:border-diriyah-primary focus:outline-none focus:ring-2 focus:ring-diriyah-primary/20"
            />
          </div>

          {/* Result banner */}
          {result && (
            <div
              className={cn(
                'flex items-start gap-2.5 rounded-md px-4 py-3 text-sm',
                result.ok
                  ? 'bg-green-50 text-green-800'
                  : 'bg-red-50 text-red-800',
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

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-semibold text-white disabled:opacity-50',
                decision === 'VALIDATED' || decision === 'VALIDATED_COND'
                  ? 'bg-green-600 hover:bg-green-700'
                  : decision === 'CONDITIONAL'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : decision === 'RETURNED'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : decision === 'DEFERRED'
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-red-600 hover:bg-red-700',
              )}
            >
              {decision === 'VALIDATED' && <CheckCircle className="h-4 w-4" />}
              {decision === 'VALIDATED_COND' && <CheckCircle className="h-4 w-4" />}
              {decision === 'CONDITIONAL' && <CheckCircle className="h-4 w-4" />}
              {decision === 'RETURNED' && <RotateCcw className="h-4 w-4" />}
              {decision === 'DEFERRED' && <RotateCcw className="h-4 w-4" />}
              {decision === 'NOT_FUNDABLE' && <XCircle className="h-4 w-4" />}
              {pending ? t('submitting') : VALIDATION_DECISION_LABELS[decision]}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
