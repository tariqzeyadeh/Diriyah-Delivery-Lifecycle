import { Link } from '@/src/i18n/navigation'
import { cn } from '@/lib/utils'
import { DefinitionList, type DefinitionItem } from './DefinitionList'

export function SummaryCard({
  eyebrow,
  title,
  description,
  tag,
  items = [],
  action,
}: {
  eyebrow?: React.ReactNode
  title: string
  description?: string
  tag?: React.ReactNode
  items?: DefinitionItem[]
  action?: { href: string; label: string }
}) {
  return (
    <article className="overflow-hidden rounded-md border border-border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          {eyebrow ? <p className="font-mono text-[10px] text-diriyah-accent">{eyebrow}</p> : null}
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          {description ? <p className="text-xs text-text-muted">{description}</p> : null}
        </div>
        {tag}
      </div>
      {items.length > 0 ? (
        <div className="border-t border-border px-4 py-2.5">
          <DefinitionList items={items} />
        </div>
      ) : null}
      {action ? (
        <div className="border-t border-border px-4 py-2 text-end">
          <Link
            href={action.href}
            className={cn(
              'inline-flex h-8 items-center text-xs font-semibold text-diriyah-primary no-underline',
              'hover:underline focus-visible:underline',
            )}
          >
            {action.label}
          </Link>
        </div>
      ) : null}
    </article>
  )
}
