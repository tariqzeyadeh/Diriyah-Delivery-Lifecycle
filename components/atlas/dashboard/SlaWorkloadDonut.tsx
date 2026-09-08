type DonutSlice = {
  label: string
  value: number
  color: string
}

type SlaDonutProps = {
  withinSla: number
  dueSoon: number
  overdue: number
  empty?: boolean
}

/** Pure SVG donut — Within SLA / Due soon / Overdue */
export function SlaWorkloadDonut({ withinSla, dueSoon, overdue, empty }: SlaDonutProps) {
  const slices: DonutSlice[] = [
    { label: 'Within SLA', value: withinSla, color: 'var(--diriyah-green)' },
    { label: 'Due soon', value: dueSoon, color: 'var(--diriyah-amber)' },
    { label: 'Overdue', value: overdue, color: 'var(--diriyah-red)' },
  ]
  const total = slices.reduce((s, x) => s + x.value, 0) || 1
  const radius = 54
  const stroke = 18
  const c = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="var(--diriyah-bg-secondary)"
            strokeWidth={stroke}
          />
          {slices.map((slice) => {
            const len = (slice.value / total) * c
            const el = (
              <circle
                key={slice.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += len
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-semibold tabular-nums text-diriyah-primary">
            {empty ? '—' : withinSla + dueSoon + overdue}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Tasks</p>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-text">{s.label}</span>
            <span className="ms-auto font-semibold tabular-nums text-text-muted">
              {empty && s.label === 'Within SLA' ? 'No pending' : s.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
