'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type PendingSubmitButtonProps = {
  children: React.ReactNode
  className?: string
  pendingLabel?: string
  disabled?: boolean
  formAction?: (formData: FormData) => void | Promise<void>
}

/** Submit button that disables and shows a spinner while a Server Action is pending. */
export function PendingSubmitButton({
  children,
  className,
  pendingLabel = 'Working…',
  disabled,
  formAction,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus()
  const busy = pending || disabled

  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={busy}
      className={cn(
        'btn btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : children}
    </button>
  )
}

type PendingActionButtonProps = {
  children: React.ReactNode
  className?: string
  pendingLabel?: string
  disabled?: boolean
  pending?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  title?: string
  style?: React.CSSProperties
}

/** For client handlers using useTransition — pass `pending` from the parent. */
export function PendingActionButton({
  children,
  className,
  pendingLabel = 'Working…',
  disabled,
  pending,
  onClick,
  type = 'button',
  title,
  style,
}: PendingActionButtonProps) {
  const busy = Boolean(pending || disabled)
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy}
      title={title}
      style={style}
      className={cn(
        'btn inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : children}
    </button>
  )
}
