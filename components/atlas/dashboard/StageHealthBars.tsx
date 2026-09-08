type Stage = {
  key: string
  label: string
  total: number
  complete: number
  pct: number
}

export function StageHealthBars({ stages }: { stages: Stage[] }) {
  return (
    <div className="space-y-4">
      {stages.map((s, i) => (
        <div key={s.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-text">{s.label}</span>
            <span className="tabular-nums text-text-muted">
              {s.complete}/{s.total || 0} · {s.pct}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-diriyah-bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, s.pct)}%`,
                background:
                  i % 2 === 0
                    ? 'linear-gradient(90deg, var(--diriyah-primary), var(--diriyah-accent))'
                    : 'linear-gradient(90deg, var(--diriyah-green), var(--diriyah-primary))',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
