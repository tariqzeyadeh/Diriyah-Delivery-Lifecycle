export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      {eyebrow ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-diriyah-accent">
          {eyebrow}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        ) : null}
      </div>
      {description ? <p className="max-w-2xl text-sm text-text-muted">{description}</p> : null}
    </div>
  )
}
