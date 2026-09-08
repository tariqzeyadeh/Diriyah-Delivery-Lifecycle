'use client'

import { useState, useTransition } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  RotateCcw,
  Shield,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/src/i18n/navigation'
import { useAuth } from '@/src/providers/AuthProvider'
import { submitDemandReview } from '@/src/actions/demand-reviews'
import {
  REVIEW_ATLAS_ROLE,
  REVIEW_LABEL,
  type DemandReviewType,
} from '@/lib/atlas/demand-reviews'
import { OfficialTag } from '@/components/atlas/records'
import { cn } from '@/lib/utils'

export type DemandReviewWorkspaceProps = {
  demandId: string
  demandTitle: string
  masterTraceId: string
  entryRoute: string
  recordStatus: string | null
  submittedBy: string | null
  submittedAt: string | null
  problem: string | null
  currentState: string | null
  scopeIn: string | null
  scopeOut: string | null
  architectureImpact: boolean
  securityImpact: boolean
  dataImpact: boolean
  reviewType: DemandReviewType
  gateCode: string
  latestDecision: string
  latestComments: string | null
  options: { option_name: string; is_do_nothing: boolean }[]
  existingAssessment: string
}

export function DemandReviewWorkspace(props: DemandReviewWorkspaceProps) {
  const t = useTranslations('demandReviews')
  const router = useRouter()
  const { currentUser, canDecideGate } = useAuth()
  const canDecide = canDecideGate(props.gateCode)
  const requiredRole = REVIEW_ATLAS_ROLE[props.reviewType]
  const alreadyDecided = props.latestDecision !== 'PENDING'
  const [assessment, setAssessment] = useState(props.existingAssessment)
  const [critical, setCritical] = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function run(decision: 'ENDORSE' | 'RETURN') {
    startTransition(async () => {
      setResult(null)
      const res = await submitDemandReview({
        demand_id: props.demandId,
        review_type: props.reviewType,
        decision,
        assessment,
        critical_finding: decision === 'ENDORSE' && critical,
        reviewed_by: currentUser.email,
      })
      if (res.ok) {
        setResult({
          ok: true,
          message:
            decision === 'RETURN'
              ? t('returnSuccess')
              : res.reviews_clear
                ? t('endorseAllClear')
                : critical
                  ? t('endorseCritical')
                  : t('endorseSuccess'),
        })
        router.refresh()
      } else {
        setResult({ ok: false, message: res.error })
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-diriyah-accent">
            PI-05 · {props.gateCode}
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-text">
            {t('reviewTitle', { type: REVIEW_LABEL[props.reviewType] })}
          </h1>
          <p className="max-w-2xl text-sm text-text-muted">{t('reviewDesc')}</p>
        </div>
        <Link
          href="/demand/reviews"
          className="text-sm font-semibold text-diriyah-primary no-underline hover:underline"
        >
          ← {t('backToQueue')}
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetaCard label={t('demandId')} value={props.demandId} mono />
        <MetaCard label={t('masterTrace')} value={props.masterTraceId} mono />
        <MetaCard label={t('status')} value={props.recordStatus ?? '—'} />
      </div>

      {!canDecide && (
        <div className="flex items-start gap-3 rounded-md border border-diriyah-amber/40 bg-diriyah-amber/10 px-4 py-3 text-sm text-text">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-diriyah-primary" />
          <p>
            {t('roleBanner', { role: requiredRole, current: currentUser.role })}
          </p>
        </div>
      )}

      <section className="overflow-hidden rounded-md border border-border bg-white">
        <div className="border-b border-border bg-diriyah-bg-alt/80 px-5 py-3">
          <h2 className="text-base font-semibold text-text">{props.demandTitle}</h2>
          <p className="text-xs text-text-muted">
            {props.entryRoute} · {props.submittedBy ?? '—'}
            {props.submittedAt ? ` · ${new Date(props.submittedAt).toLocaleDateString()}` : ''}
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <FlagRow
            architecture={props.architectureImpact}
            security={props.securityImpact}
            data={props.dataImpact}
            labels={{
              architecture: t('flagArchitecture'),
              security: t('flagSecurity'),
              data: t('flagData'),
            }}
          />
          <SnapshotBlock title={t('problem')} body={props.problem} />
          <SnapshotBlock title={t('currentState')} body={props.currentState} />
          <div className="grid gap-4 md:grid-cols-2">
            <SnapshotBlock title={t('scopeIn')} body={props.scopeIn} />
            <SnapshotBlock title={t('scopeOut')} body={props.scopeOut} />
          </div>
          {props.options.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                {t('options')}
              </p>
              <ul className="space-y-1 text-sm text-text">
                {props.options.map((opt) => (
                  <li key={opt.option_name}>
                    {opt.option_name}
                    {opt.is_do_nothing ? ` (${t('doNothing')})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link
            href={`/demand/${encodeURIComponent(props.demandId)}`}
            className="inline-block text-sm font-semibold text-diriyah-primary no-underline hover:underline"
          >
            {t('openFullCase')} →
          </Link>
        </div>
      </section>

      {alreadyDecided && (
        <div className="rounded-md border border-border bg-diriyah-bg-alt px-4 py-3 text-sm text-text">
          <p className="font-semibold">
            {t('alreadyDecided', { decision: props.latestDecision })}
          </p>
          {props.latestComments && (
            <p className="mt-1 text-text-muted">{props.latestComments}</p>
          )}
        </div>
      )}

      {result && (
        <div
          className={cn(
            'rounded-md border px-4 py-3 text-sm font-medium',
            result.ok
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700',
          )}
        >
          {result.message}
        </div>
      )}

      {!alreadyDecided && !result?.ok && (
        <section className="rounded-md border border-border bg-white p-4">
          <label className="mb-1.5 block text-sm font-semibold text-text">
            {t('assessmentLabel')}
            <span className="ml-1 text-red-500">*</span>
          </label>
          <textarea
            value={assessment}
            onChange={(e) => setAssessment(e.target.value)}
            rows={6}
            disabled={!canDecide || pending}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text shadow-sm focus:outline-none focus:ring-2 focus:ring-diriyah-amber/40 disabled:bg-diriyah-bg-alt"
            placeholder={t('assessmentPlaceholder')}
          />
          <label className="mt-3 flex items-start gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={critical}
              onChange={() => setCritical((v) => !v)}
              disabled={!canDecide || pending}
              className="mt-0.5 h-4 w-4 accent-[var(--diriyah-primary)]"
            />
            <span>
              <span className="font-semibold">{t('criticalLabel')}</span>
              <span className="block text-text-muted">{t('criticalHint')}</span>
            </span>
          </label>

          {showReturn && (
            <p className="mt-3 flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t('returnHint')}
            </p>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowReturn((v) => !v)}
              disabled={!canDecide || pending}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              {t('returnForRevision')}
            </button>
            {showReturn ? (
              <button
                type="button"
                onClick={() => run('RETURN')}
                disabled={!canDecide || pending}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-amber-500 px-5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {t('confirmReturn')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => run('ENDORSE')}
                disabled={!canDecide || pending}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-diriyah-primary px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {t('endorse')}
              </button>
            )}
          </div>
        </section>
      )}

      <p className="flex items-center gap-2 text-xs text-text-muted">
        <Shield className="h-3.5 w-3.5" />
        {t('policyHint')}
      </p>
    </div>
  )
}

function MetaCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold text-diriyah-primary', mono && 'font-mono')}>
        {value}
      </p>
    </div>
  )
}

function SnapshotBlock({ title, body }: { title: string; body: string | null }) {
  if (!body?.trim()) return null
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <p className="text-sm leading-relaxed text-text">{body}</p>
    </div>
  )
}

function FlagRow({
  architecture,
  security,
  data,
  labels,
}: {
  architecture: boolean
  security: boolean
  data: boolean
  labels: { architecture: string; security: string; data: string }
}) {
  const flags = [
    { on: architecture, label: labels.architecture },
    { on: security, label: labels.security },
    { on: data, label: labels.data },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {flags.map((f) => (
        <OfficialTag key={f.label} tone={f.on ? 'warning' : 'neutral'}>
          {f.label}: {f.on ? 'Yes' : 'No'}
        </OfficialTag>
      ))}
    </div>
  )
}
