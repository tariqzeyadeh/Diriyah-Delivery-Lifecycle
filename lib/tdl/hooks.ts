'use client'

import { useMemo } from 'react'
import { useTdlStore, EDITABLE_STATES, getPersona } from './store'
import type { CabVote, FormKey, NodeId } from './types'
import { serverNowUtc } from './time'
import { RISK_ORDER } from './mock-seed'
import { defaultRemediationDueUtc } from './calendar'

export function usePersona() {
  const actorId = useTdlStore((s) => s.actorId)
  const setPersona = useTdlStore((s) => s.setPersona)
  return { actorId, persona: getPersona(actorId), setPersona }
}

export function useLifecycleRecord() {
  return useTdlStore((s) => s.rec001)
}

export function useTdlErrors() {
  const lastProblem = useTdlStore((s) => s.lastProblem)
  const clearProblem = useTdlStore((s) => s.clearProblem)
  return { lastProblem, clearProblem }
}

export function useFormBinding(key: FormKey) {
  const form = useTdlStore((s) => s.forms[key])
  const updateDraft = useTdlStore((s) => s.updateDraft)
  const editable = EDITABLE_STATES.includes(form.state)
  return {
    form,
    editable,
    update: (data: Record<string, unknown>) => updateDraft(key, data, form.input_version),
  }
}

export function useSubmitWithConcurrency(key: FormKey) {
  const form = useTdlStore((s) => s.forms[key])
  const submitForm = useTdlStore((s) => s.submitForm)
  return {
    submit: (idempotencyKey = crypto.randomUUID()) =>
      submitForm(key, form.input_version, idempotencyKey),
    version: form.input_version,
  }
}

export function useApprovalActions(key: FormKey, groupId?: string) {
  const form = useTdlStore((s) => s.forms[key])
  const approveForm = useTdlStore((s) => s.approveForm)
  const returnForm = useTdlStore((s) => s.returnForm)
  const actorId = useTdlStore((s) => s.actorId)
  const preparer = form.submittedBy || form.preparedBy
  const wouldViolateSod = Boolean(preparer && preparer === actorId)

  return {
    form,
    wouldViolateSod,
    approve: (idempotencyKey = crypto.randomUUID()) =>
      approveForm(key, form.input_version, idempotencyKey, groupId),
    returnForRevision: (packet: {
      returnReason: string
      comments: string
      remediationOwnerId: string
      dueDateUtc: string
    }, idempotencyKey = crypto.randomUUID()) =>
      returnForm(key, form.input_version, idempotencyKey, packet),
    defaultDue: defaultRemediationDueUtc(),
  }
}

export function useSourcingRoute() {
  const form = useTdlStore((s) => s.forms.dec001)
  const decideSourcing = useTdlStore((s) => s.decideSourcing)
  const nodeStatus = useTdlStore((s) => s.nodeStatus)
  return {
    form,
    external: Boolean(form.data.externalSourcingRequired),
    bypassBudget: nodeStatus.n7 === 'skipped',
    decide: (external: boolean) =>
      decideSourcing(external, form.input_version, crypto.randomUUID()),
  }
}

export function useBudgetAutopopulate() {
  const frm005 = useTdlStore((s) => s.forms.frm005)
  const frm006 = useTdlStore((s) => s.forms.frm006)
  const requiredAmount = frm006.data.requiredAmount
  const sourceTotal = frm005.data.estimatedBudgetTotal
  return { requiredAmount, sourceTotal, currencyCode: frm006.data.currencyCode }
}

export function useArchitectureJoin() {
  const a = useTdlStore((s) => s.forms.apr006a)
  const b = useTdlStore((s) => s.forms.apr006b)
  const arch = useTdlStore((s) => s.rec001.architectureVersion)
  const status = useTdlStore((s) => s.nodeStatus.d8)
  const versionsMatch =
    a.state === 'Approved' &&
    b.state === 'Approved' &&
    a.architectureVersion === b.architectureVersion &&
    a.architectureVersion === arch
  return {
    apr006a: a,
    apr006b: b,
    architectureVersion: arch,
    versionsMatch,
    waiting: !versionsMatch,
    status,
  }
}

export function useBranchInvalidation() {
  return useTdlStore((s) => s.branchesInvalidated)
}

export function useUatReconciliation() {
  const form = useTdlStore((s) => s.forms.frm022)
  const executed = Number(form.data.executedTests) || 0
  const passed = Number(form.data.passed) || 0
  const failed = Number(form.data.failed) || 0
  const valid = executed === passed + failed
  return { executed, passed, failed, valid }
}

export function useCabPackageRules() {
  const cab = useTdlStore((s) => s.forms.frmCab001)
  const riskFloor = String(useTdlStore((s) => s.forms.frm007.data.riskRating) || 'Low')
  const rating = String(cab.data.changeRiskRating)
  const isEmergency = rating === 'Emergency'
  const decreases = (RISK_ORDER[rating] ?? 0) < (RISK_ORDER[riskFloor] ?? 0)
  return { cab, riskFloor, isEmergency, decreases }
}

export function useCabVoting() {
  const form = useTdlStore((s) => s.forms.apr011)
  const castCabVote = useTdlStore((s) => s.castCabVote)
  const votes = (form.data.votes as CabVote[]) || []
  return {
    votes,
    cast: (slotId: CabVote['slotId'], decision: 'Approved' | 'Returned') => {
      const slot = votes.find((v) => v.slotId === slotId)
      if (!slot) return
      castCabVote(slotId, decision, slot.input_version, crypto.randomUUID())
    },
  }
}

export function useReleaseJoin() {
  const releaseVersion = useTdlStore((s) => s.rec001.releaseVersion)
  const apr010 = useTdlStore((s) => s.forms.apr010)
  const apr011 = useTdlStore((s) => s.forms.apr011)
  const frm013 = useTdlStore((s) => s.forms.frm013)
  const status = useTdlStore((s) => s.nodeStatus.j1)

  const d14Ok = apr010.state === 'Approved' && apr010.releaseVersion === releaseVersion
  const d15Ok = apr011.state === 'Approved' && apr011.releaseVersion === releaseVersion
  const n17Ok =
    (frm013.state === 'Approved' || frm013.data.asyncStatus === 'Completed') &&
    frm013.releaseVersion === releaseVersion

  return {
    releaseVersion,
    d14Ok,
    d15Ok,
    n17Ok,
    ready: d14Ok && d15Ok && n17Ok,
    status,
  }
}

export function useDeploymentGuard() {
  const cab = useTdlStore((s) => s.forms.frmCab001.data)
  const frm024 = useTdlStore((s) => s.forms.frm024)
  const startDeployment = useTdlStore((s) => s.startDeployment)
  const actorId = useTdlStore((s) => s.actorId)
  const mockServerNow = useTdlStore((s) => s.mockServerNow)

  const now = mockServerNow || serverNowUtc()
  const start = String(cab.window_start)
  const end = String(cab.window_end)
  const openConditions = (cab.openConditions as string[]) || []
  const inWindow = now >= start && now <= end
  const conditionsClear = openConditions.length === 0
  const persona = getPersona(actorId)
  const isDeployLead = Boolean(persona?.roles.includes('Deployment Lead'))
  const enabled = inWindow && conditionsClear && isDeployLead && !frm024.data.deploymentStarted

  return {
    inWindow,
    conditionsClear,
    isDeployLead,
    enabled,
    openConditions,
    window_start: start,
    window_end: end,
    now,
    start: () => startDeployment(frm024.input_version, crypto.randomUUID()),
  }
}

export function useSaDiriyahSla() {
  return { defaultRemediationDueUtc }
}

export function useAuditLog() {
  return useTdlStore((s) => s.audit)
}

export function useWorkflowNav() {
  const activeNode = useTdlStore((s) => s.activeNode)
  const nodeStatus = useTdlStore((s) => s.nodeStatus)
  const setActiveNode = useTdlStore((s) => s.setActiveNode)
  const canOpen = (id: NodeId) => {
    const s = nodeStatus[id]
    return s !== 'locked'
  }
  return { activeNode, nodeStatus, setActiveNode, canOpen }
}

export function useIdempotentMutation() {
  return useMemo(() => ({ newKey: () => crypto.randomUUID() }), [])
}
