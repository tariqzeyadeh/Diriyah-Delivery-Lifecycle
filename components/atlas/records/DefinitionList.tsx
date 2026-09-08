import { cn } from '@/lib/utils'

export type DefinitionItem = {
  label: string
  value: React.ReactNode
}

export function DefinitionList({
  items,
  className,
}: {
  items: DefinitionItem[]
  className?: string
}) {
  return (
    <dl className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs', className)}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-text-muted">{item.label}</dt>
          <dd className="min-w-0 font-medium text-text">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
