'use client'

import React from 'react'
import {
  useApprovalActions,
  useArchitectureJoin,
  useBranchInvalidation,
  useBudgetAutopopulate,
  useCabPackageRules,
  useCabVoting,
  useDeploymentGuard,
  useFormBinding,
  useReleaseJoin,
  useSourcingRoute,
  useSubmitWithConcurrency,
  useUatReconciliation,
} from '@/lib/tdl/hooks'
import { useTdlStore } from '@/lib/tdl/store'
import { formatRiyadh } from '@/lib/tdl/time'
import { DynamicFormEngine, type FormFieldSchema } from './dynamic-form-engine'
import { ApprovalGate } from './approval-gate'
import { MultiSlotVoting } from './multi-slot-voting'
import type { NodeId } from '@/lib/tdl/types'
import { useI18n } from '@/lib/i18n/use-i18n'

function Panel({
  title,
  children,
  footer,
}: {
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-text">{title}</h2>
      {children}
      {footer}
    </section>
  )
}

function SubmitBar({
  onSubmit,
  disabled,
  label,
}: {
  onSubmit: () => void
  disabled?: boolean
  label?: string
}) {
  const { t } = useI18n()
  return (
    <div className="flex justify-end border-t border-border pt-4">
      <button
        type="button"
        disabled={disabled}
        onClick={onSubmit}
        className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label ?? t('common.submit')}
      </button>
    </div>
  )
}

function useFrm005Schema(): FormFieldSchema[] {
  const { t } = useI18n()
  return [
    { name: 'sowSummary', label: t('field.sowSummary'), type: 'textarea' },
    {
      name: 'estimatedBudgetTotal',
      label: t('field.estimatedBudgetTotal'),
      type: 'currency',
      currencyCodeField: 'currencyCode',
    },
    {
      name: 'functionalRequirements',
      label: t('field.functionalRequirements'),
      type: 'repeatingTable',
      columns: [
        { key: 'code', label: t('col.code'), type: 'text' },
        { key: 'description', label: t('col.description'), type: 'text' },
        { key: 'priority', label: t('col.priority'), type: 'choice', options: ['Must', 'Should', 'Could'] },
        { key: 'estimatedCost', label: t('col.estimatedCost'), type: 'number' },
      ],
    },
    { name: 'evidence', label: t('field.evidence'), type: 'evidence' },
  ]
}

export function NodePanel({ nodeId }: { nodeId: NodeId }) {
  switch (nodeId) {
    case 'n6':
      return <Node6 />
    case 'd3':
      return <NodeD3 />
    case 'n7':
      return <Node7 />
    case 'd4':
      return <NodeD4 />
    case 'n8':
      return <Node8 />
    case 'd5':
      return <NodeD5 />
    case 'n9':
      return <Node9 />
    case 'd6':
      return <NodeD6 />
    case 'n10a':
    case 'n10b':
      return <Node10Parallel focus={nodeId} />
    case 'd7a':
      return <NodeD7 which="a" />
    case 'd7b':
      return <NodeD7 which="b" />
    case 'd8':
      return <NodeD8 />
    case 'n17':
      return <Node17 />
    case 'n25':
      return <Node25 />
    case 'n26':
      return <Node26 />
    case 'd14':
      return <NodeD14 />
    case 'n27':
      return <Node27 />
    case 'd15':
      return <NodeD15 />
    case 'j1':
      return <NodeJ1 />
    case 'n28':
      return <Node28 />
    case 'n29':
      return <Node29 />
    default:
      return <Panel title="Unknown node">Not implemented</Panel>
  }
}

function Node6() {
  const { form, editable, update } = useFormBinding('frm005')
  const { submit } = useSubmitWithConcurrency('frm005')
  const { t, statusLabel } = useI18n()
  const schema = useFrm005Schema()
  return (
    <Panel
      title={t('title.n6')}
      footer={editable && <SubmitBar onSubmit={submit} />}
    >
      <p className="text-xs text-text-muted">
        {t('common.state')}: {statusLabel(form.state)} · input_version {form.input_version}
      </p>
      <DynamicFormEngine
        schema={schema}
        values={form.data}
        readOnly={!editable}
        onChange={update}
      />
    </Panel>
  )
}

function NodeD3() {
  const { t } = useI18n()
  const { form, decide } = useSourcingRoute()
  const [external, setExternal] = React.useState(Boolean(form.data.externalSourcingRequired))
  return (
    <Panel title={t("title.d3")}>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={external}
          disabled={form.state === 'Approved'}
          onChange={(e) => setExternal(e.target.checked)}
        />
        {t('node.externalSourcing')}
      </label>
      <p className="text-xs text-text-muted">{t('node.d3Hint')}</p>
      {form.state !== 'Approved' && (
        <SubmitBar
          label={t('node.confirmDecision')}
          onSubmit={() => decide(external)}
        />
      )}
      {form.state === 'Approved' && (
        <p className="text-sm text-green-700">
          {t('node.decisionLocked', { value: String(form.data.externalSourcingRequired) })}
        </p>
      )}
    </Panel>
  )
}

function Node7() {
  const { t } = useI18n()
  const { form, editable, update } = useFormBinding('frm006')
  const { submit } = useSubmitWithConcurrency('frm006')
  const { requiredAmount, sourceTotal } = useBudgetAutopopulate()
  return (
    <Panel title={t("title.n7")} footer={editable && <SubmitBar onSubmit={submit} />}>
      <p className="rounded-md bg-brand/10 px-3 py-2 text-xs text-brand">
        {t('node.budgetAutopop', { source: String(sourceTotal), amount: String(requiredAmount) })}
      </p>
      <DynamicFormEngine
        schema={[
          { name: 'requiredAmount', label: t('field.requiredAmount'), type: 'currency', readOnly: true },
          { name: 'justification', label: t('field.justification'), type: 'textarea' },
        ]}
        values={form.data}
        readOnly={!editable}
        onChange={update}
      />
    </Panel>
  )
}

function NodeD4() {
  const { t } = useI18n()
  const ctx = useApprovalActions('apr003', 'g-budget')
  const budget = useFormBinding('frm006')
  return (
    <Panel title={t("title.d4")}>
      <ApprovalGate
        title={t("title.budgetCtx")}
        schema={[
          { name: 'requiredAmount', label: t('field.requiredAmount'), type: 'currency' },
          { name: 'justification', label: t('field.justification'), type: 'textarea' },
        ]}
        values={budget.form.data}
        wouldViolateSod={ctx.wouldViolateSod}
        escalatedToManagerId={ctx.form.escalatedToManagerId}
        onApprove={ctx.approve}
        onReturn={ctx.returnForRevision}
      />
    </Panel>
  )
}

function Node8() {
  const { t } = useI18n()
  const { form, editable, update } = useFormBinding('frm007')
  const { submit } = useSubmitWithConcurrency('frm007')
  return (
    <Panel title={t("title.n8")} footer={editable && <SubmitBar onSubmit={submit} />}>
      <DynamicFormEngine
        schema={[
          { name: 'riskRating', label: t('field.riskRating'), type: 'choice', options: ['Low', 'Medium', 'High'] },
          { name: 'residualRiskPercent', label: t('field.residualRiskPercent'), type: 'percent' },
          { name: 'eaNotes', label: t('field.eaNotes'), type: 'textarea' },
        ]}
        values={form.data}
        readOnly={!editable}
        onChange={update}
      />
    </Panel>
  )
}

function NodeD5() {
  const { t } = useI18n()
  const ctx = useApprovalActions('apr004', 'g-risk')
  const risk = useFormBinding('frm007')
  return (
    <Panel title={t("title.d5")}>
      <ApprovalGate
        title={t("title.riskCtx")}
        schema={[
          { name: 'riskRating', label: t('field.riskRating'), type: 'choice', options: ['Low', 'Medium', 'High'] },
          { name: 'eaNotes', label: t('field.eaNotes'), type: 'textarea' },
        ]}
        values={risk.form.data}
        wouldViolateSod={ctx.wouldViolateSod}
        onApprove={ctx.approve}
        onReturn={ctx.returnForRevision}
      />
    </Panel>
  )
}

function Node9() {
  const { t } = useI18n()
  const { form, editable, update } = useFormBinding('frm008')
  const { submit } = useSubmitWithConcurrency('frm008')
  const invalidated = useBranchInvalidation()
  return (
    <Panel title={t("title.n9")} footer={editable && <SubmitBar onSubmit={submit} />}>
      {invalidated && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t('node.invalidated')}
        </div>
      )}
      <DynamicFormEngine
        schema={[
          { name: 'tacSummary', label: t('field.tacSummary'), type: 'textarea' },
          { name: 'architectureVersionProposal', label: t('field.architectureVersionProposal'), type: 'text' },
        ]}
        values={form.data}
        readOnly={!editable}
        onChange={update}
      />
    </Panel>
  )
}

function NodeD6() {
  const { t } = useI18n()
  const ctx = useApprovalActions('apr005', 'g-arch')
  const tac = useFormBinding('frm008')
  return (
    <Panel title={t("title.d6")}>
      <p className="text-xs text-text-muted">{t('node.d6Hint')}</p>
      <ApprovalGate
        title={t("title.tacCtx")}
        schema={[
          { name: 'tacSummary', label: t('field.tacSummary'), type: 'textarea' },
          { name: 'architectureVersionProposal', label: t('field.architectureVersionProposal'), type: 'text' },
        ]}
        values={tac.form.data}
        wouldViolateSod={ctx.wouldViolateSod}
        onApprove={ctx.approve}
        onReturn={ctx.returnForRevision}
      />
    </Panel>
  )
}

function Node10Parallel({ focus }: { focus: 'n10a' | 'n10b' }) {
  const { t } = useI18n()
  const a = useFormBinding('frm009a')
  const b = useFormBinding('frm009b')
  const submitA = useSubmitWithConcurrency('frm009a')
  const submitB = useSubmitWithConcurrency('frm009b')
  const invalidated = useBranchInvalidation()

  return (
    <Panel title={t("title.n10")}>
      {invalidated && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t('node.bothInvalidated')}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`rounded-lg border p-4 ${focus === 'n10a' ? 'border-brand' : 'border-border'} ${invalidated ? 'opacity-50' : ''}`}>
          <h3 className="mb-2 text-sm font-semibold">{t("title.frm009a")}</h3>
          <DynamicFormEngine
            schema={[
              { name: 'cyberFindings', label: t('field.cyberFindings'), type: 'textarea' },
              { name: 'controlsCoveragePercent', label: t('field.controlsCoveragePercent'), type: 'percent' },
            ]}
            values={a.form.data}
            readOnly={!a.editable || invalidated}
            onChange={a.update}
          />
          {a.editable && !invalidated && <SubmitBar onSubmit={submitA.submit} />}
        </div>
        <div className={`rounded-lg border p-4 ${focus === 'n10b' ? 'border-brand' : 'border-border'} ${invalidated ? 'opacity-50' : ''}`}>
          <h3 className="mb-2 text-sm font-semibold">{t("title.frm009b")}</h3>
          <DynamicFormEngine
            schema={[
              { name: 'dataClassification', label: t('field.dataClassification'), type: 'choice', options: ['Public', 'Internal', 'Confidential'] },
              { name: 'dgNotes', label: t('field.notes'), type: 'textarea' },
            ]}
            values={b.form.data}
            readOnly={!b.editable || invalidated}
            onChange={b.update}
          />
          {b.editable && !invalidated && <SubmitBar onSubmit={submitB.submit} />}
        </div>
      </div>
    </Panel>
  )
}

function NodeD7({ which }: { which: 'a' | 'b' }) {
  const { t } = useI18n()
  const key = which === 'a' ? 'apr006a' : 'apr006b'
  const groupId = which === 'a' ? 'g-cyber' : 'g-data'
  const ctx = useApprovalActions(key, groupId)
  const formKey = which === 'a' ? 'frm009a' : 'frm009b'
  const src = useFormBinding(formKey)
  return (
    <Panel title={which === 'a' ? t('title.d7a') : t('title.d7b')}>
      <p className="text-xs text-amber-800">{t('node.d7Hint')}</p>
      <ApprovalGate
        title={which === 'a' ? t('title.cyberCtx') : t('title.dataCtx')}
        schema={
          which === 'a'
            ? [
                { name: 'cyberFindings', label: t('field.cyberFindings'), type: 'textarea' },
                { name: 'controlsCoveragePercent', label: t('field.controlsCoveragePercent'), type: 'percent' },
              ]
            : [
                { name: 'dataClassification', label: t('field.dataClassification'), type: 'text' },
                { name: 'dgNotes', label: t('field.dgNotes'), type: 'textarea' },
              ]
        }
        values={src.form.data}
        wouldViolateSod={ctx.wouldViolateSod}
        onApprove={ctx.approve}
        onReturn={ctx.returnForRevision}
      />
    </Panel>
  )
}

function NodeD8() {
  const { t } = useI18n()
  const join = useArchitectureJoin()
  const breakArch = useTdlStore((s) => s.breakArchitectureVersion)
  return (
    <Panel title={t("title.d8")}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('node.apr006a')} value={join.apr006a.state} />
        <Stat label={t('node.apr006b')} value={join.apr006b.state} />
        <Stat label={t('node.archVersion')} value={join.architectureVersion} />
      </div>
      <p className="text-xs text-text-muted">
        {t('node.aVersion', {
          a: join.apr006a.architectureVersion ?? '—',
          b: join.apr006b.architectureVersion ?? '—',
        })}
      </p>
      {join.versionsMatch ? (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
          {t('node.joinOk')}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          {t('node.waitingJoin')}
        </div>
      )}
      <button type="button" className="btn btn-ghost text-xs" onClick={breakArch}>
        {t('node.breakArch')}
      </button>
    </Panel>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[11px] uppercase text-text-muted">{label}</p>
      <p className="font-semibold text-text">{value}</p>
    </div>
  )
}

function Node17() {
  const { t } = useI18n()
  const { form, editable, update } = useFormBinding('frm013')
  const { submit } = useSubmitWithConcurrency('frm013')
  const complete = useTdlStore((s) => s.completeAsyncAdoption)
  return (
    <Panel title={t("title.n17")}>
      <p className="text-xs text-text-muted">
        {t('node.asyncHint', { status: String(form.data.asyncStatus) })}
      </p>
      <DynamicFormEngine
        schema={[
          { name: 'adoptionPlan', label: t('field.adoptionPlan'), type: 'textarea' },
          { name: 'trainingPercent', label: t('field.trainingPercent'), type: 'percent' },
        ]}
        values={form.data}
        readOnly={!editable && form.data.asyncStatus !== 'In Progress'}
        onChange={update}
      />
      {editable && <SubmitBar label={t('node.startAsync')} onSubmit={submit} />}
      {form.data.asyncStatus === 'In Progress' && (
        <SubmitBar label={t('node.completeAdoption')} onSubmit={complete} />
      )}
    </Panel>
  )
}

function Node25() {
  const { t } = useI18n()
  const { form, editable, update } = useFormBinding('frm021')
  const { submit } = useSubmitWithConcurrency('frm021')
  return (
    <Panel title={t("title.n25")} footer={editable && <SubmitBar onSubmit={submit} />}>
      <DynamicFormEngine
        schema={[
          { name: 'readinessNotes', label: t('field.readinessNotes'), type: 'textarea' },
          { name: 'environmentsReady', label: t('field.environmentsReady'), type: 'boolean' },
        ]}
        values={form.data}
        readOnly={!editable}
        onChange={update}
      />
    </Panel>
  )
}

function Node26() {
  const { t } = useI18n()
  const { form, editable, update } = useFormBinding('frm022')
  const { submit } = useSubmitWithConcurrency('frm022')
  const { executed, passed, failed, valid } = useUatReconciliation()
  return (
    <Panel title={t("title.n26")} footer={editable && <SubmitBar onSubmit={submit} disabled={!valid} />}>
      {!valid && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {t('node.uatRule', { executed, passed, failed })}
        </div>
      )}
      <DynamicFormEngine
        schema={[
          { name: 'executedTests', label: t('field.executedTests'), type: 'number' },
          { name: 'passed', label: t('field.passed'), type: 'number' },
          { name: 'failed', label: t('field.failed'), type: 'number' },
          {
            name: 'defects',
            label: t('field.defects'),
            type: 'repeatingTable',
            columns: [
              { key: 'id', label: t('col.id'), type: 'text' },
              { key: 'title', label: t('col.title'), type: 'text' },
              { key: 'severity', label: t('col.severity'), type: 'choice', options: ['Low', 'Medium', 'High'] },
            ],
          },
        ]}
        values={form.data}
        readOnly={!editable}
        onChange={update}
      />
    </Panel>
  )
}

function NodeD14() {
  const { t } = useI18n()
  const ctx = useApprovalActions('apr010', 'g-business')
  const uat = useFormBinding('frm022')
  return (
    <Panel title={t("title.d14")}>
      <ApprovalGate
        title={t("title.uatCtx")}
        schema={[
          { name: 'executedTests', label: t('field.executedTests'), type: 'number' },
          { name: 'passed', label: t('field.passed'), type: 'number' },
          { name: 'failed', label: t('field.failed'), type: 'number' },
        ]}
        values={uat.form.data}
        wouldViolateSod={ctx.wouldViolateSod}
        onApprove={ctx.approve}
        onReturn={ctx.returnForRevision}
      />
    </Panel>
  )
}

function Node27() {
  const { t } = useI18n()
  const { form, editable, update } = useFormBinding('frmCab001')
  const { submit } = useSubmitWithConcurrency('frmCab001')
  const { riskFloor, isEmergency, decreases } = useCabPackageRules()
  return (
    <Panel title={t("title.n27")} footer={editable && <SubmitBar onSubmit={submit} disabled={isEmergency || decreases} />}>
      <p className="text-xs text-text-muted">
        {t('node.cabRiskHint', { floor: riskFloor })}
      </p>
      {isEmergency && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {t('node.emergency')}
        </div>
      )}
      {decreases && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {t('node.riskDecrease', { floor: riskFloor })}
        </div>
      )}
      <DynamicFormEngine
        schema={[
          { name: 'changeTitle', label: t('field.changeTitle'), type: 'text' },
          {
            name: 'changeRiskRating',
            label: t('field.changeRiskRating'),
            type: 'choice',
            options: ['Low', 'Medium', 'High', 'Emergency'],
          },
          {
            name: 'data_change_impact',
            label: t('field.data_change_impact'),
            type: 'choice',
            options: ['None', 'Low', 'Medium', 'High'],
          },
          { name: 'window_start', label: t('field.window_start'), type: 'text' },
          { name: 'window_end', label: t('field.window_end'), type: 'text' },
        ]}
        values={form.data}
        readOnly={!editable}
        onChange={(patch) => {
          if (patch.changeRiskRating === undefined && form.data.changeRiskRating == null) {
            update({ changeRiskRating: riskFloor, ...patch })
          } else update(patch)
        }}
      />
    </Panel>
  )
}

function NodeD15() {
  const { t } = useI18n()
  const { votes, cast } = useCabVoting()
  return (
    <Panel title={t("title.d15")}>
      <MultiSlotVoting votes={votes} onVote={cast} />
    </Panel>
  )
}

function NodeJ1() {
  const { t } = useI18n()
  const join = useReleaseJoin()
  return (
    <Panel title={t("title.j1")}>
      <p className="text-sm text-text-muted">{t('node.releaseVersion', { version: join.releaseVersion })}</p>
      <ul className="space-y-1 text-sm">
        <li>{t('node.d14Item', { status: join.d14Ok ? '✓' : t('node.waitingItem') })}</li>
        <li>{t('node.d15Item', { status: join.d15Ok ? '✓' : t('node.waitingItem') })}</li>
        <li>{t('node.n17Item', { status: join.n17Ok ? '✓' : t('node.waitingItem') })}</li>
      </ul>
      {join.ready ? (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
          {t('node.releaseOk')}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          {t('node.waitingRelease')}
        </div>
      )}
    </Panel>
  )
}

function Node28() {
  const { t } = useI18n()
  const { form, editable, update } = useFormBinding('frm023')
  const { submit } = useSubmitWithConcurrency('frm023')
  return (
    <Panel title={t("title.n28")} footer={editable && <SubmitBar onSubmit={submit} />}>
      <DynamicFormEngine
        schema={[
          { name: 'adoptionExecuted', label: t('field.adoptionExecuted'), type: 'boolean' },
          { name: 'notes', label: t('field.notes'), type: 'textarea' },
        ]}
        values={form.data}
        readOnly={!editable}
        onChange={update}
      />
    </Panel>
  )
}

function Node29() {
  const { t } = useI18n()
  const guard = useDeploymentGuard()
  const setMockNow = useTdlStore((s) => s.setMockNow)
  const frm024 = useFormBinding('frm024')

  return (
    <Panel title={t("title.n29")}>
      <div className="grid gap-2 text-xs text-text-muted sm:grid-cols-2">
        <p>{t('node.serverNow', { riyadh: formatRiyadh(guard.now), utc: guard.now })}</p>
        <p>{t('node.window', { start: guard.window_start, end: guard.window_end })}</p>
        <p>{t('node.inWindow', { value: String(guard.inWindow) })}</p>
        <p>{t('node.conditionsClear', { value: String(guard.conditionsClear) })}</p>
        <p>{t('node.deployLead', { value: String(guard.isDeployLead) })}</p>
        <p>
          {t('node.openConditions', {
            value: guard.openConditions.length ? guard.openConditions.join(', ') : t('node.none'),
          })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost text-xs"
          onClick={() => setMockNow(String(useTdlStore.getState().forms.frmCab001.data.window_start))}
        >
          {t('node.setClockIn')}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={() => setMockNow('2020-01-01T00:00:00.000Z')}>
          {t('node.setClockOut')}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={() => setMockNow(null)}>
          {t('node.resetClock')}
        </button>
      </div>
      <button
        type="button"
        disabled={!guard.enabled}
        onClick={guard.start}
        className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('node.startDeploy')}
      </button>
      {!guard.enabled && (
        <>
          <button type="button" className="btn btn-ghost text-xs text-red-700" onClick={guard.start}>
            {t('node.attemptDeploy')}
          </button>
          <p className="text-xs text-text-muted">{t('node.deployDisabled')}</p>
        </>
      )}
      {Boolean(frm024.form.data.deploymentStarted) && (
        <p className="text-sm font-semibold text-green-700">{t('node.deployed')}</p>
      )}
    </Panel>
  )
}
