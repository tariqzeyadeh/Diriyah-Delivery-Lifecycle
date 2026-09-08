import { AlertTriangle } from 'lucide-react'
import type { PortfolioRiskAlert } from '@/src/lib/predictive-risk'
import { cn } from '@/lib/utils'

const SEVERITY_STYLES: Record<
  PortfolioRiskAlert['severity'],
  string
> = {
  LOW: 'border-border bg-diriyah-bg-alt text-text-muted',
  MEDIUM: 'border-diriyah-amber/40 bg-diriyah-amber/10 text-diriyah-amber',
  HIGH: 'border-diriyah-red/30 bg-diriyah-red/10 text-diriyah-red',
  CRITICAL: 'border-diriyah-red bg-diriyah-red/15 text-diriyah-red',
}

/** Inline executive warning for predictive delay / bottleneck risk. */
export function RiskAlertBadge({
  alert,
  compact = false,
}: {
  alert: PortfolioRiskAlert
  compact?: boolean
}) {
  if (alert.severity === 'LOW') return null

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold',
        SEVERITY_STYLES[alert.severity],
      )}
      title={alert.drivers.join(' · ')}
      data-testid="risk-alert-badge"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {alert.severity}
        {!compact ? (
          <>
            {' '}
            · {alert.risk_score_pct}% · +{alert.predicted_delay_days}d
          </>
        ) : (
          <> · {alert.risk_score_pct}%</>
        )}
      </span>
    </span>
  )
}

export function RiskAlertsPanel({ alerts }: { alerts: PortfolioRiskAlert[] }) {
  const hot = alerts.filter((a) => a.severity === 'HIGH' || a.severity === 'CRITICAL')

  if (hot.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-diriyah-bg-alt px-4 py-6 text-center text-sm text-text-muted">
        No high-risk approval or procurement delays predicted.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {hot.slice(0, 6).map((a) => (
        <li
          key={`${a.master_trace_id}-${a.entity_id}`}
          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-diriyah-primary">
              {a.master_trace_id}
            </p>
            <p className="truncate text-xs text-text-muted">
              {a.label} · {a.drivers[0]}
            </p>
          </div>
          <RiskAlertBadge alert={a} />
        </li>
      ))}
    </ul>
  )
}
