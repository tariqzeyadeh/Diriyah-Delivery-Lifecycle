import { cn } from '@/lib/utils'

export function WorkspaceMetaGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:w-[22.5rem]">
      {children}
    </div>
  )
}

export function WorkspaceMetaCard({
  label,
  value,
  mono,
  children,
}: {
  label: string
  value?: React.ReactNode
  mono?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-[4.25rem] min-w-0 flex-col justify-center rounded-md border border-border bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</p>
      {children ?? (
        <p
          className={cn(
            'mt-1 truncate text-sm font-semibold text-diriyah-primary',
            mono && 'font-mono',
          )}
        >
          {value}
        </p>
      )}
    </div>
  )
}
