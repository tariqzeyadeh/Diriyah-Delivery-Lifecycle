import { cn } from '@/lib/utils'

export function RegisterTable({
  caption,
  count,
  children,
  className,
}: {
  caption: string
  count?: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('overflow-hidden rounded-md border border-border bg-white', className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-xs">
          <caption className="border-b border-border px-4 py-2 text-start text-sm font-semibold text-text">
            {caption}
            {count != null ? (
              <span className="ms-2 text-xs font-medium text-text-muted">· {count}</span>
            ) : null}
          </caption>
          {children}
        </table>
      </div>
    </div>
  )
}
