import { cn } from '@/lib/utils'

type RecordNoticeTone = 'warning' | 'success' | 'error' | 'info'

const TONE: Record<RecordNoticeTone, string> = {
  warning: 'border-diriyah-amber bg-diriyah-amber/15 text-diriyah-primary-dark',
  success: 'border-diriyah-green bg-diriyah-green/10 text-diriyah-green',
  error: 'border-diriyah-red bg-diriyah-red/10 text-diriyah-red',
  info: 'border-diriyah-primary bg-diriyah-primary/10 text-diriyah-primary',
}

export function RecordNotice({
  title,
  children,
  tone = 'info',
  role = 'region',
}: {
  title: string
  children?: React.ReactNode
  tone?: RecordNoticeTone
  role?: 'region' | 'alert'
}) {
  return (
    <div
      role={role}
      className={cn('rounded-md border border-s-4 px-4 py-3', TONE[tone])}
    >
      <p className="text-xs font-semibold">{title}</p>
      {children ? <div className="mt-0.5 text-xs text-text">{children}</div> : null}
    </div>
  )
}
