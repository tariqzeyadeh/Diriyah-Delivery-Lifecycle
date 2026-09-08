export function MetricTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="border border-border bg-white">
      <div className="h-[3px] bg-diriyah-primary" />
      <div className="px-4 py-3">
        <p className="text-[10px] text-text-muted">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-text">{value}</p>
        {hint ? <p className="mt-0.5 text-[10px] text-text-muted">{hint}</p> : null}
      </div>
    </div>
  )
}
