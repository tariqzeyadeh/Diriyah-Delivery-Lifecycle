import { CheckCircle2, CircleDashed } from 'lucide-react'
import { OfficialTag } from '@/components/atlas/records'
import { cn } from '@/lib/utils'
import type { TraceabilityTree } from '@/lib/atlas/dashboard-data'

// ─── Traceability Controls ────────────────────────────────────────────────────

export type TraceabilityControlCheck = {
  label: string
  status: 'Complete' | 'Configured' | 'Pending'
}

type TraceabilityControlsProps = {
  checks: TraceabilityControlCheck[]
}

export function TraceabilityControls({ checks }: TraceabilityControlsProps) {
  return (
    <div className="rounded-md border border-border bg-white p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-diriyah-primary">
        Traceability Controls
      </h2>
      <ul className="space-y-2.5">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {check.status === 'Complete' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-diriyah-green" />
              ) : (
                <CircleDashed className="h-4 w-4 shrink-0 text-diriyah-amber" />
              )}
              <span className="text-sm text-text">{check.label}</span>
            </div>
            <OfficialTag
              tone={
                check.status === 'Complete'
                  ? 'success'
                  : check.status === 'Configured'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {check.status}
            </OfficialTag>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Derive traceability control checks from tree data */
export function deriveTraceabilityChecks(tree: TraceabilityTree): TraceabilityControlCheck[] {
  const hasStrategy = tree.strategies.length > 0
  const hasObjectivesAndKpis = tree.strategies.some((s) => s.objectives.length > 0)
  const hasDemand = tree.demands.length > 0

  const budgetWithReconciliation = tree.budget_submissions.some(
    (b) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b as any).demand_reconciliation_status === 'Pass' ||
      b.record_status === 'APPROVED',
  )

  const procItems = tree.budget_submissions.flatMap((b) => [
    ...b.budget_lines.flatMap((l) => l.procurement_items),
    ...b.procurement_plans.flatMap((p) => p.items),
  ])
  const hasProcurementInheritance = procItems.some(
    (p) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p as any).master_trace_id === tree.master_trace_id ||
      p.procurement_item_id.length > 0,
  )

  const hasProjectTrigger = procItems.some((p) => p.project_registration !== null) || tree.projects.length > 0
  const hasScorecardRollup = tree.strategies.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s) => (s as any).scorecard_id || (s as any).scorecards?.length > 0,
  )

  function status(pass: boolean, fallback?: boolean): 'Complete' | 'Configured' | 'Pending' {
    if (pass) return 'Complete'
    if (fallback) return 'Configured'
    return 'Pending'
  }

  return [
    { label: 'Strategy link', status: status(hasStrategy) },
    { label: 'Objective & KPI link', status: status(hasObjectivesAndKpis) },
    { label: 'Demand link', status: status(hasDemand) },
    { label: 'Budget reconciliation', status: status(budgetWithReconciliation) },
    { label: 'Procurement inheritance', status: status(hasProcurementInheritance) },
    { label: 'Project trigger', status: status(hasProjectTrigger, tree.projects.length > 0) },
    { label: 'Scorecard roll-up', status: status(hasScorecardRollup) },
  ]
}

function isComplete(status?: string | null): boolean {
  const s = (status || '').toUpperCase()
  return ['APPROVED', 'FUNDED', 'DELIVERED', 'COMPLETED', 'REGISTERED', 'ACCEPTED'].includes(s)
}

type NodeProps = {
  kind: string
  title: string
  id: string
  status?: string | null
  children?: React.ReactNode
  last?: boolean
}

function TraceNode({ kind, title, id, status, children, last }: NodeProps) {
  const done = isComplete(status)
  return (
    <li className={cn('relative ps-8', !last && 'pb-6')}>
      {!last ? (
        <span
          className="absolute left-[11px] top-6 bottom-0 w-px bg-diriyah-bg-secondary"
          aria-hidden
        />
      ) : null}
      <span
        className="absolute left-0 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white"
        style={{
          borderColor: done ? 'var(--diriyah-green)' : 'var(--diriyah-amber)',
        }}
      >
        {done ? (
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--diriyah-green)' }} />
        ) : (
          <CircleDashed className="h-3.5 w-3.5 text-diriyah-amber" />
        )}
      </span>
      <div className="rounded-md border border-border bg-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-diriyah-accent">
              {kind}
            </p>
            <p className="text-sm font-semibold text-text">{title}</p>
            <p className="font-mono text-[11px] text-text-muted">{id}</p>
          </div>
          <OfficialTag tone={done ? 'success' : 'warning'}>
            {done ? 'Complete' : status || 'Pending'}
          </OfficialTag>
        </div>
        {children ? (
          <ul className="mt-4 space-y-0 border-t border-border/60 pt-4">{children}</ul>
        ) : null}
      </div>
    </li>
  )
}

export function TraceabilityTreeView({ tree }: { tree: TraceabilityTree }) {
  const procFromBudgets = tree.budget_submissions.flatMap((b) => [
    ...b.budget_lines.flatMap((l) => l.procurement_items),
    ...b.procurement_plans.flatMap((p) => p.items),
  ])
  // de-dupe by id
  const procMap = new Map(procFromBudgets.map((p) => [p.procurement_item_id, p]))
  const procurementItems = Array.from(procMap.values())

  const controls = deriveTraceabilityChecks(tree)

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-4">
      <div className="rounded-md border border-diriyah-primary/20 bg-diriyah-bg-alt px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Master Trace Spine
        </p>
        <p className="font-mono text-xl font-semibold text-diriyah-primary">
          {tree.master_trace_id}
        </p>
        <p className="text-sm text-text-muted">Entry route: {tree.entry_route}</p>
      </div>

      <ol className="relative">
        {tree.strategies.map((s, i) => (
          <TraceNode
            key={s.strategy_id}
            kind="Strategy"
            title={s.strategy_title}
            id={s.strategy_id}
            status={s.record_status}
            last={
              i === tree.strategies.length - 1 &&
              tree.demands.length === 0 &&
              tree.budget_submissions.length === 0 &&
              procurementItems.length === 0 &&
              tree.projects.length === 0
            }
          >
            {s.objectives.map((o) => (
              <TraceNode
                key={o.objective_id}
                kind="Objective"
                title={o.objective_name}
                id={o.objective_id}
                status={o.record_status}
                last
              />
            ))}
          </TraceNode>
        ))}

        {tree.demands.map((d, i) => (
          <TraceNode
            key={d.demand_id}
            kind="Demand"
            title={d.demand_title}
            id={d.demand_id}
            status={d.record_status}
            last={
              i === tree.demands.length - 1 &&
              tree.budget_submissions.length === 0 &&
              procurementItems.length === 0
            }
          />
        ))}

        {tree.budget_submissions.map((b, i) => (
          <TraceNode
            key={b.budget_submission_id}
            kind="Budget"
            title={`Budget ${b.budget_cycle || 'Submission'}`}
            id={b.budget_submission_id}
            status={b.record_status}
            last={i === tree.budget_submissions.length - 1 && procurementItems.length === 0}
          >
            {b.budget_lines.map((line) => (
              <TraceNode
                key={line.budget_line_id}
                kind="Budget Line"
                title={line.line_description || line.budget_line_id}
                id={line.budget_line_id}
                status={line.record_status}
                last
              />
            ))}
          </TraceNode>
        ))}

        {procurementItems.map((p, i) => (
          <TraceNode
            key={p.procurement_item_id}
            kind="Procurement"
            title={p.procurement_item_title}
            id={p.procurement_item_id}
            status={p.procurement_stage || p.record_status}
            last={
              i === procurementItems.length - 1 &&
              !p.project_registration &&
              tree.projects.length === 0
            }
          >
            {p.project_registration ? (
              <TraceNode
                kind="Project"
                title={p.project_registration.project_name}
                id={p.project_registration.project_id}
                status={p.project_registration.record_status}
                last
              />
            ) : null}
          </TraceNode>
        ))}

        {tree.projects
          .filter(
            (pr) =>
              !procurementItems.some((p) => p.project_registration?.project_id === pr.project_id),
          )
          .map((pr, i, arr) => (
            <TraceNode
              key={pr.project_id}
              kind="Project"
              title={pr.project_name}
              id={pr.project_id}
              status={pr.record_status}
              last={i === arr.length - 1}
            />
          ))}
      </ol>
      </div>

      {/* G-36: Traceability Controls side panel */}
      <div className="w-full lg:w-72 lg:shrink-0">
        <TraceabilityControls checks={controls} />
      </div>
    </div>
  )
}
