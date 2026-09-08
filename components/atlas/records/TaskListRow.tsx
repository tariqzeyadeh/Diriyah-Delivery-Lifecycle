import { Link } from '@/src/i18n/navigation'
import { cn } from '@/lib/utils'

export function TaskListRow({
  href,
  title,
  hint,
  status,
  meta,
}: {
  href: string
  title: string
  hint?: string
  status?: React.ReactNode
  meta?: React.ReactNode
}) {
  return (
    <li className="border-b border-border last:border-0">
      <Link
        href={href}
        className={cn(
          'group flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-text no-underline',
          'hover:bg-diriyah-bg-alt/40 focus-visible:bg-diriyah-bg-alt/40',
        )}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs font-semibold underline-offset-2 group-hover:underline">{title}</p>
          {hint ? <p className="text-[11px] text-text-muted">{hint}</p> : null}
          {meta}
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </Link>
    </li>
  )
}
