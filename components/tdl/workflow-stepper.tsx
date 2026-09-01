'use client'

import { WORKFLOW_NODES } from '@/lib/tdl/workflow-nodes'
import type { NodeId, NodeStatus } from '@/lib/tdl/types'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/use-i18n'

const STATUS_STYLES: Record<NodeStatus, string> = {
  locked: 'border-border bg-surface text-text-muted opacity-50',
  active: 'border-brand bg-brand/10 text-brand ring-1 ring-brand/30',
  done: 'border-green-300 bg-green-50 text-green-800',
  skipped: 'border-dashed border-border bg-surface text-text-muted line-through',
  waiting: 'border-amber-300 bg-amber-50 text-amber-900',
  invalidated: 'border-red-300 bg-red-50 text-red-800',
  in_progress: 'border-blue-300 bg-blue-50 text-blue-900',
}

export function WorkflowStepper({
  activeNode,
  nodeStatus,
  onSelect,
  canOpen,
}: {
  activeNode: NodeId
  nodeStatus: Record<NodeId, NodeStatus>
  onSelect: (id: NodeId) => void
  canOpen: (id: NodeId) => boolean
}) {
  const { t, isRtl, nodeStatusLabel } = useI18n()
  const poc01 = WORKFLOW_NODES.filter((n) => n.phase === 'poc01')
  const poc02 = WORKFLOW_NODES.filter((n) => n.phase === 'poc02')

  const renderGroup = (title: string, nodes: typeof WORKFLOW_NODES) => (
    <div className="space-y-2">
      <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">{title}</p>
      <div className="flex flex-col gap-1.5">
        {nodes.map((n) => {
          const status = nodeStatus[n.id]
          const openable = canOpen(n.id)
          return (
            <button
              key={n.id}
              type="button"
              disabled={!openable}
              onClick={() => openable && onSelect(n.id)}
              className={cn(
                'rounded-lg border px-3 py-2 text-start transition',
                STATUS_STYLES[status],
                activeNode === n.id && 'shadow-md',
                openable ? 'cursor-pointer hover:brightness-95' : 'cursor-not-allowed',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold">{n.number}</span>
                <span className="text-[10px] uppercase opacity-70">{nodeStatusLabel(status)}</span>
              </div>
              <p className="mt-0.5 text-xs font-medium leading-snug">
                {isRtl ? n.titleAr : n.title}
              </p>
              <p className="font-mono text-[10px] opacity-70">{n.artifact}</p>
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <aside className="flex w-full shrink-0 flex-col lg:sticky lg:top-4 lg:w-64 lg:self-start">
      <div className="flex max-h-[min(70vh,calc(100vh-14rem))] flex-col gap-6 overflow-y-auto overscroll-contain pe-1">
        {renderGroup(t('stepper.poc01'), poc01)}
        {renderGroup(t('stepper.poc02'), poc02)}
      </div>
    </aside>
  )
}
