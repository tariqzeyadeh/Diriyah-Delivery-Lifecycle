import { cn } from '@/lib/utils'
import type { OfficialTagTone } from '@/lib/atlas/record-label'

export type { OfficialTagTone }

export function OfficialTag({
  children,
  tone = 'neutral',
  variant = 'filled',
  className,
}: {
  children: React.ReactNode
  tone?: OfficialTagTone
  variant?: 'filled' | 'outlined'
  className?: string
}) {
  return (
    <strong
      className={cn(
        'inline-flex max-w-[12rem] items-center truncate rounded-sm px-1.5 py-px text-[10px] font-semibold leading-4',
        variant === 'outlined' && 'border bg-transparent',
        variant === 'filled' && tone === 'neutral' && 'bg-diriyah-bg-secondary text-text-muted',
        variant === 'filled' && tone === 'success' && 'bg-diriyah-green/15 text-diriyah-green',
        variant === 'filled' && tone === 'warning' && 'bg-diriyah-amber/20 text-diriyah-primary-dark',
        variant === 'filled' && tone === 'danger' && 'bg-diriyah-red/10 text-diriyah-red',
        variant === 'filled' && tone === 'info' && 'bg-diriyah-primary/10 text-diriyah-primary',
        variant === 'outlined' && 'border-border text-text-muted',
        className,
      )}
    >
      {children}
    </strong>
  )
}
