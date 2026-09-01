'use client'

import { SharedLifecycleHeader } from '@/components/tdl/shared-lifecycle-header'
import { WorkflowStepper } from '@/components/tdl/workflow-stepper'
import { NodePanel } from '@/components/tdl/node-panel'
import { ProblemBanner } from '@/components/tdl/problem-banner'
import { AuditDrawer } from '@/components/tdl/audit-drawer'
import { PersonaSwitcher } from '@/components/tdl/persona-switcher'
import { useLifecycleRecord, useTdlErrors, useWorkflowNav } from '@/lib/tdl/hooks'
import { useTdlStore } from '@/lib/tdl/store'
import { useI18n } from '@/lib/i18n/use-i18n'

export function LifecycleWorkspace() {
  const record = useLifecycleRecord()
  const { activeNode, nodeStatus, setActiveNode, canOpen } = useWorkflowNav()
  const { lastProblem, clearProblem } = useTdlErrors()
  const simulateStale = useTdlStore((s) => s.simulateStaleBump)
  const { t } = useI18n()

  return (
    <div className="-mx-2 flex min-h-[70vh] flex-col md:-mx-4">
      <SharedLifecycleHeader record={record} />
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <PersonaSwitcher />
        <AuditDrawer />
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-1.5 text-xs"
          onClick={() => simulateStale('frm005')}
        >
          {t('workspace.demoEtag')}
        </button>
        <span className="text-[11px] text-text-muted">
          REC-001 · {record.lifecycleNumber} · arch {record.architectureVersion} · release{' '}
          {record.releaseVersion}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
        <WorkflowStepper
          activeNode={activeNode}
          nodeStatus={nodeStatus}
          onSelect={setActiveNode}
          canOpen={canOpen}
        />
        <div className="min-w-0 flex-1">
          <ProblemBanner problem={lastProblem} onClose={clearProblem} />
          <NodePanel nodeId={activeNode} />
        </div>
      </div>
    </div>
  )
}
