'use client'

import { useTranslations } from 'next-intl'
import { formatSar, type FinancialPositionRow, type PendingDecision } from '@/lib/atlas/dashboard-data'

type FunnelStep = { key: string; label: string; count: number }

export function ProcessFunnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1)
  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const width = 40 + (step.count / max) * 60
        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className="w-36 shrink-0 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">
              {step.label}
            </div>
            <div className="relative min-h-10 flex-1">
              <div
                className="flex h-10 items-center justify-end rounded-r-md px-3 text-sm font-semibold text-white shadow-sm transition-all"
                style={{
                  width: `${width}%`,
                  background:
                    i === 0
                      ? 'var(--diriyah-primary)'
                      : i === steps.length - 1
                        ? 'var(--diriyah-green)'
                        : 'var(--diriyah-accent)',
                }}
              >
                {step.count}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

type ScorecardProps = {
  objectivesAchieved: number
  objectivesTotal: number
  procurementCommitted: number
  procurementPlanned: number
  strategyBudgetUsed: number
  strategyBudgetEnvelope: number
}

export function PortfolioScorecard(props: ScorecardProps) {
  const cards = [
    {
      label: 'Strategic Objectives Achieved',
      value: `${props.objectivesAchieved} / ${props.objectivesTotal}`,
      hint: 'Objectives on track or approved',
    },
    {
      label: 'Procurement Plans Committed',
      value: `${formatSar(props.procurementCommitted)} / ${formatSar(props.procurementPlanned)}`,
      hint: 'Actual commitment vs planned value',
    },
    {
      label: 'Strategy Budget Used',
      value: `${formatSar(props.strategyBudgetUsed)} / ${formatSar(props.strategyBudgetEnvelope)}`,
      hint: 'Approved budget vs funding envelope',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-md border border-border bg-white px-4 py-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            {c.label}
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-diriyah-primary md:text-2xl">
            {c.value}
          </p>
          <p className="mt-1 text-xs text-text-muted">{c.hint}</p>
        </div>
      ))}
    </div>
  )
}

type MatrixRow = {
  strategy_id: string
  strategy_title: string
  record_status: string | null
  master_trace_id: string
  demands_linked: number
  demands_submitted: number
  projects_registered: number
  projects_eligible: number
  procurement_actual: number
  procurement_total: number
  overall_progress_pct: number
}

export function TraceabilityMatrix({ rows }: { rows: MatrixRow[] }) {
  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-md border border-border bg-white [-webkit-overflow-scrolling:touch]">
      <table className="w-full min-w-[520px] border-collapse text-sm md:min-w-[960px]">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-muted">
            <th className="px-3 py-3 font-semibold">Strategy</th>
            <th className="px-3 py-3 font-semibold">
              <span className="md:hidden">Demands</span>
              <span className="hidden md:inline">Demands (Linked / Submitted)</span>
            </th>
            <th className="hidden px-3 py-3 font-semibold md:table-cell">
              Projects (Registered / Eligible)
            </th>
            <th className="hidden px-3 py-3 font-semibold md:table-cell">
              Procurement Budget (Actual / Total)
            </th>
            <th className="px-3 py-3 font-semibold">
              <span className="md:hidden">Progress</span>
              <span className="hidden md:inline">Overall Progress %</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-10 text-center text-text-muted">
                No strategies in the portfolio yet.
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr
                key={r.strategy_id}
                className={idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/70'}
              >
                <td className="px-3 py-3">
                  <p className="font-semibold text-text">{r.strategy_title}</p>
                  <p className="font-mono text-[11px] text-text-muted">{r.strategy_id}</p>
                  <p className="text-[11px] text-diriyah-accent">{r.master_trace_id}</p>
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {r.demands_linked} / {r.demands_submitted}
                </td>
                <td className="hidden px-3 py-3 tabular-nums md:table-cell">
                  {r.projects_registered} / {r.projects_eligible}
                </td>
                <td className="hidden px-3 py-3 tabular-nums md:table-cell">
                  {formatSar(r.procurement_actual)} / {formatSar(r.procurement_total)}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 overflow-hidden rounded-full bg-diriyah-bg-secondary md:w-24">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, r.overall_progress_pct)}%`,
                          background: 'var(--diriyah-primary)',
                        }}
                      />
                    </div>
                    <span className="font-semibold tabular-nums text-diriyah-primary">
                      {r.overall_progress_pct}%
                    </span>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── G-35: Financial Position Table ────────────────────────────────────────

export function FinancialPositionTable({ rows }: { rows: FinancialPositionRow[] }) {
  const t = useTranslations('onePager')
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-muted">
            <th className="px-4 py-3 font-semibold">{t('category')}</th>
            <th className="px-4 py-3 text-right font-semibold">{t('requested')}</th>
            <th className="px-4 py-3 font-semibold">{t('variance')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.measure} className={idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/60'}>
              <td className="px-4 py-3 font-medium text-text">{r.measure}</td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-diriyah-primary">
                {formatSar(r.value)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-diriyah-bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, r.pct)}%`,
                        background: idx === 0 ? 'var(--diriyah-primary)' : 'var(--diriyah-green)',
                      }}
                    />
                  </div>
                  <span className="tabular-nums text-xs font-semibold text-text-muted">
                    {r.pct.toFixed(1)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── G-35: Decisions Required Panel ─────────────────────────────────────────

export function DecisionsRequiredPanel({ decisions }: { decisions: PendingDecision[] }) {
  const t = useTranslations('onePager')
  if (decisions.length === 0) {
    return (
      <div className="rounded-md border border-diriyah-green/25 bg-diriyah-green/5 px-5 py-4">
        <p className="text-sm font-semibold text-diriyah-green">✓ {t('noDecisions')}</p>
        <p className="text-xs text-text-muted">All approval transactions are within SLA.</p>
      </div>
    )
  }

  const now = new Date()

  function urgencyClass(d: PendingDecision) {
    if (d.is_overdue || d.sla_due_at < now) return 'text-diriyah-red'
    const diffDays = (d.sla_due_at.getTime() - now.getTime()) / 86400000
    return diffDays <= 2 ? 'text-diriyah-amber' : 'text-text-muted'
  }

  function formatRelative(date: Date) {
    const diffDays = Math.round((date.getTime() - now.getTime()) / 86400000)
    if (diffDays < 0) return 'Overdue'
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  }

  return (
    <ul className="space-y-2">
      {decisions.map((d) => (
        <li
          key={d.approval_transaction_id}
          className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-4 py-3"
        >
          <p className="text-sm font-medium text-text">{d.description}</p>
          <span className={`shrink-0 text-xs font-semibold ${urgencyClass(d)}`}>
            {formatRelative(d.sla_due_at)}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ─── G-13: Days in Phase + Phase Status ──────────────────────────────────────

type PhaseStatusProps = {
  createdAt: Date
  hasOverdueApprovals: boolean
  ragStatus?: string | null
}

export function DaysInPhaseStats({ createdAt, hasOverdueApprovals, ragStatus }: PhaseStatusProps) {
  const t = useTranslations('onePager')
  const days = Math.floor((Date.now() - createdAt.getTime()) / 86400000)

  const phaseStatus = hasOverdueApprovals
    ? { label: 'At Risk', color: 'bg-diriyah-red/10 text-diriyah-red' }
    : ragStatus === 'GREEN'
      ? { label: 'On Track', color: 'bg-diriyah-green/10 text-diriyah-green' }
      : ragStatus === 'AMBER'
        ? { label: 'Attention', color: 'bg-diriyah-amber/15 text-[#8a5a3b]' }
        : { label: 'Monitoring', color: 'bg-diriyah-bg-secondary text-text-muted' }

  return (
    <div className="flex flex-wrap gap-4">
      <div className="rounded-md border border-border bg-white px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          {t('daysInPhase')}
        </p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums text-diriyah-primary">
          {days} days
        </p>
      </div>
      <div className="rounded-md border border-border bg-white px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Phase Status
        </p>
        <span className={`mt-1.5 inline-block rounded-full px-3 py-1 text-sm font-semibold ${phaseStatus.color}`}>
          {phaseStatus.label}
        </span>
      </div>
    </div>
  )
}
