'use client'

import { create } from 'zustand'
import type {
  CabSlotId,
  CabVote,
  FormKey,
  FormState,
  NodeId,
  NodeStatus,
  ProblemJson,
  Rec001,
  ReturnPacket,
  VersionedRecord,
} from './types'
import { Problems, TdlApiError, newCorrelationId } from './errors'
import { checkIdempotency, rememberIdempotency, simpleHash } from './idempotency'
import {
  APPROVAL_GROUPS,
  PERSONAS,
  RISK_ORDER,
  buildCabVotes,
  createInitialForms,
  createInitialRec001,
} from './mock-seed'
import { serverNowUtc, setMockServerNow, toUtcIso } from './time'
import type { AuditEvent } from './types'

export const EDITABLE_STATES: FormState[] = ['Draft', 'Returned for Revision']

function isEditable(state: FormState) {
  return EDITABLE_STATES.includes(state)
}

function sumRequirementsCost(frm005: VersionedRecord): number {
  const reqs = (frm005.data.functionalRequirements as { estimatedCost?: number }[]) ?? []
  const total = reqs.reduce((s, r) => s + (Number(r.estimatedCost) || 0), 0)
  return total || Number(frm005.data.estimatedBudgetTotal) || 0
}

export interface TdlState {
  actorId: string
  rec001: Rec001
  forms: Record<FormKey, VersionedRecord>
  nodeStatus: Record<NodeId, NodeStatus>
  activeNode: NodeId
  lastProblem: ProblemJson | null
  audit: AuditEvent[]
  branchesInvalidated: boolean
  mockServerNow: string | null

  setPersona: (id: string) => void
  setActiveNode: (id: NodeId) => void
  clearProblem: () => void
  setMockNow: (iso: string | null) => void
  updateDraft: (key: FormKey, data: Record<string, unknown>, expectedVersion: number) => void
  submitForm: (key: FormKey, expectedVersion: number, idempotencyKey: string) => void
  approveForm: (key: FormKey, expectedVersion: number, idempotencyKey: string, groupId?: string) => void
  returnForm: (
    key: FormKey,
    expectedVersion: number,
    idempotencyKey: string,
    packet: ReturnPacket,
  ) => void
  decideSourcing: (external: boolean, expectedVersion: number, idempotencyKey: string) => void
  castCabVote: (
    slotId: CabSlotId,
    decision: 'Approved' | 'Returned',
    expectedVersion: number,
    idempotencyKey: string,
  ) => void
  startDeployment: (expectedVersion: number, idempotencyKey: string) => void
  completeAsyncAdoption: () => void
  breakArchitectureVersion: () => void
  simulateStaleBump: (key: FormKey) => void
}

function appendAudit(
  audit: AuditEvent[],
  actor_id: string,
  action: string,
  entity_type: string,
  entity_id: string,
  before: unknown,
  after: unknown,
  correlation_id: string,
): AuditEvent[] {
  return [
    ...audit,
    {
      id: `aud-${audit.length + 1}`,
      at_utc: toUtcIso(),
      actor_id,
      action,
      entity_type,
      entity_id,
      before_hash: simpleHash(JSON.stringify(before)),
      after_hash: simpleHash(JSON.stringify(after)),
      correlation_id,
    },
  ]
}

function initialNodeStatus(): Record<NodeId, NodeStatus> {
  return {
    n6: 'active',
    d3: 'locked',
    n7: 'locked',
    d4: 'locked',
    n8: 'locked',
    d5: 'locked',
    n9: 'locked',
    d6: 'locked',
    n10a: 'locked',
    n10b: 'locked',
    d7a: 'locked',
    d7b: 'locked',
    d8: 'locked',
    n17: 'locked',
    n25: 'locked',
    n26: 'locked',
    d14: 'locked',
    n27: 'locked',
    d15: 'locked',
    j1: 'locked',
    n28: 'locked',
    n29: 'locked',
  }
}

function unlockPoc02(status: Record<NodeId, NodeStatus>): Record<NodeId, NodeStatus> {
  return {
    ...status,
    d8: 'done',
    n17: 'in_progress',
    n25: 'active',
    n27: 'active',
  }
}

function evalJ1(forms: Record<FormKey, VersionedRecord>, releaseVersion: string): boolean {
  const d14 = forms.apr010.state === 'Approved' && forms.apr010.releaseVersion === releaseVersion
  const d15 = forms.apr011.state === 'Approved' && forms.apr011.releaseVersion === releaseVersion
  const n17 =
    forms.frm013.state === 'Approved' ||
    (forms.frm013.data.asyncStatus === 'Completed' && forms.frm013.releaseVersion === releaseVersion)
  return Boolean(d14 && d15 && n17)
}

export const useTdlStore = create<TdlState>((set, get) => ({
  actorId: 'u-requestor',
  rec001: createInitialRec001(),
  forms: createInitialForms(),
  nodeStatus: initialNodeStatus(),
  activeNode: 'n6',
  lastProblem: null,
  audit: [],
  branchesInvalidated: false,
  mockServerNow: null,

  setPersona: (id) => set({ actorId: id }),
  setActiveNode: (id) => set({ activeNode: id }),
  clearProblem: () => set({ lastProblem: null }),
  setMockNow: (iso) => {
    setMockServerNow(iso)
    set({ mockServerNow: iso })
  },

  updateDraft: (key, data, expectedVersion) => {
    const state = get()
    const rec = state.forms[key]
    if (!isEditable(rec.state)) {
      set({ lastProblem: Problems.staleVersion() })
      return
    }
    if (rec.input_version !== expectedVersion) {
      set({ lastProblem: Problems.staleVersion() })
      return
    }
    const next = {
      ...rec,
      data: { ...rec.data, ...data },
      updatedAtUtc: toUtcIso(),
    }
    set({
      forms: { ...state.forms, [key]: next },
      lastProblem: null,
    })
  },

  submitForm: (key, expectedVersion, idempotencyKey) => {
    try {
      const state = get()
      const rec = state.forms[key]
      const payload = { key, expectedVersion, data: rec.data }
      const { replay } = checkIdempotency(idempotencyKey, payload)
      if (replay) return

      if (rec.input_version !== expectedVersion) throw new TdlApiError(Problems.staleVersion())
      if (!isEditable(rec.state)) throw new TdlApiError(Problems.staleVersion())

      if (key === 'frm022') {
        const executed = Number(rec.data.executedTests) || 0
        const passed = Number(rec.data.passed) || 0
        const failed = Number(rec.data.failed) || 0
        if (executed !== passed + failed) throw new TdlApiError(Problems.uatReconciliation())
      }

      if (key === 'frmCab001') {
        const rating = String(rec.data.changeRiskRating)
        if (rating === 'Emergency') {
          throw new TdlApiError(
            Problems.staleVersion().code
              ? {
                  ...Problems.staleVersion(),
                  status: 422,
                  code: 'TDL-VAL-001',
                  message: 'Emergency changes must use the enterprise emergency-change process outside this POC',
                  field_errors: [
                    {
                      field: 'changeRiskRating',
                      message:
                        'Emergency is not allowed in POC — use enterprise emergency-change process',
                    },
                  ],
                }
              : Problems.staleVersion(),
          )
        }
        const floor = String(state.forms.frm007.data.riskRating || 'Low')
        if ((RISK_ORDER[rating] ?? 0) < (RISK_ORDER[floor] ?? 0)) {
          throw new TdlApiError({
            status: 422,
            code: 'TDL-VAL-001',
            message: 'Change Risk Rating cannot decrease below FRM-007 Risk Rating',
            correlation_id: newCorrelationId(),
            field_errors: [
              {
                field: 'changeRiskRating',
                message: `Cannot be lower than #8 Risk Rating (${floor})`,
              },
            ],
          })
        }
      }

      const evidence = rec.data.evidence as { scanStatus?: string }[] | undefined
      if (evidence?.some((e) => e.scanStatus === 'Quarantined')) {
        throw new TdlApiError(Problems.evidenceQuarantined())
      }

      const before = { ...rec }
      const next: VersionedRecord = {
        ...rec,
        state: 'Pending Approval',
        submittedBy: state.actorId,
        preparedBy: rec.preparedBy ?? state.actorId,
        input_version: rec.input_version + 1,
        updatedAtUtc: toUtcIso(),
        releaseVersion: state.rec001.releaseVersion,
      }

      let nodeStatus = { ...state.nodeStatus }
      let forms = { ...state.forms, [key]: next }
      let rec001 = { ...state.rec001 }
      let activeNode = state.activeNode

      if (key === 'frm005') {
        nodeStatus.n6 = 'done'
        nodeStatus.d3 = 'active'
        activeNode = 'd3'
        rec001.currentWorkflowState = 'Node D3 — Sourcing Decision'
        const amount = sumRequirementsCost(next)
        forms.frm006 = {
          ...forms.frm006,
          data: {
            ...forms.frm006.data,
            requiredAmount: amount,
            currencyCode: next.data.currencyCode || 'SAR',
          },
        }
      } else if (key === 'frm006') {
        nodeStatus.n7 = 'done'
        nodeStatus.d4 = 'active'
        activeNode = 'd4'
        forms.apr003 = { ...forms.apr003, state: 'Pending Approval', preparedBy: next.submittedBy, submittedBy: next.submittedBy, input_version: forms.apr003.input_version + 1 }
      } else if (key === 'frm007') {
        nodeStatus.n8 = 'done'
        nodeStatus.d5 = 'active'
        activeNode = 'd5'
        forms.apr004 = { ...forms.apr004, state: 'Pending Approval', preparedBy: next.submittedBy, submittedBy: next.submittedBy, input_version: forms.apr004.input_version + 1 }
      } else if (key === 'frm008') {
        nodeStatus.n9 = 'done'
        nodeStatus.d6 = 'active'
        activeNode = 'd6'
        forms.apr005 = { ...forms.apr005, state: 'Pending Approval', preparedBy: next.submittedBy, submittedBy: next.submittedBy, input_version: forms.apr005.input_version + 1 }
        if (next.data.architectureVersionProposal) {
          rec001.architectureVersion = String(next.data.architectureVersionProposal)
        }
      } else if (key === 'frm009a') {
        nodeStatus.n10a = 'done'
        nodeStatus.d7a = 'active'
        forms.apr006a = {
          ...forms.apr006a,
          state: 'Pending Approval',
          preparedBy: next.submittedBy,
          submittedBy: next.submittedBy,
          architectureVersion: rec001.architectureVersion,
          input_version: forms.apr006a.input_version + 1,
        }
      } else if (key === 'frm009b') {
        nodeStatus.n10b = 'done'
        nodeStatus.d7b = 'active'
        forms.apr006b = {
          ...forms.apr006b,
          state: 'Pending Approval',
          preparedBy: next.submittedBy,
          submittedBy: next.submittedBy,
          architectureVersion: rec001.architectureVersion,
          input_version: forms.apr006b.input_version + 1,
        }
      } else if (key === 'frm021') {
        nodeStatus.n25 = 'done'
        nodeStatus.n26 = 'active'
        activeNode = 'n26'
      } else if (key === 'frm022') {
        nodeStatus.n26 = 'done'
        nodeStatus.d14 = 'active'
        activeNode = 'd14'
        forms.apr010 = {
          ...forms.apr010,
          state: 'Pending Approval',
          preparedBy: next.submittedBy,
          submittedBy: next.submittedBy,
          releaseVersion: rec001.releaseVersion,
          input_version: forms.apr010.input_version + 1,
        }
      } else if (key === 'frmCab001') {
        nodeStatus.n27 = 'done'
        nodeStatus.d15 = 'active'
        activeNode = 'd15'
        const votes = buildCabVotes(String(next.data.data_change_impact || 'None'))
        forms.apr011 = {
          ...forms.apr011,
          state: 'Pending Approval',
          preparedBy: next.submittedBy,
          submittedBy: next.submittedBy,
          releaseVersion: rec001.releaseVersion,
          data: { ...forms.apr011.data, votes },
          input_version: forms.apr011.input_version + 1,
        }
      } else if (key === 'frm013') {
        forms.frm013 = {
          ...next,
          data: { ...next.data, asyncStatus: 'In Progress' },
          releaseVersion: rec001.releaseVersion,
        }
        nodeStatus.n17 = 'in_progress'
      } else if (key === 'frm023') {
        nodeStatus.n28 = 'done'
        nodeStatus.n29 = 'active'
        activeNode = 'n29'
      }

      const corr = newCorrelationId()
      rememberIdempotency(idempotencyKey, payload, { ok: true })
      set({
        forms,
        nodeStatus,
        rec001,
        activeNode,
        lastProblem: null,
        audit: appendAudit(state.audit, state.actorId, 'submit', key, next.id, before, next, corr),
      })
    } catch (e) {
      if (e instanceof TdlApiError) set({ lastProblem: e.problem })
      else throw e
    }
  },

  approveForm: (key, expectedVersion, idempotencyKey, groupId) => {
    try {
      const state = get()
      const rec = state.forms[key]
      const payload = { action: 'approve', key, expectedVersion }
      const { replay } = checkIdempotency(idempotencyKey, payload)
      if (replay) return

      if (rec.input_version !== expectedVersion) throw new TdlApiError(Problems.staleVersion())
      if (rec.state !== 'Pending Approval' && rec.state !== 'Submitted') {
        throw new TdlApiError(Problems.staleVersion())
      }

      const preparer = rec.submittedBy || rec.preparedBy
      if (preparer && preparer === state.actorId) {
        const group = APPROVAL_GROUPS.find((g) => g.id === groupId)
        if (group) {
          const otherActive = group.memberIds.filter((m) => m !== preparer)
          if (otherActive.length === 0) {
            const escalated = {
              ...rec,
              escalatedToManagerId: group.managerId,
              updatedAtUtc: toUtcIso(),
            }
            set({
              forms: { ...state.forms, [key]: escalated },
              lastProblem: null,
              audit: appendAudit(
                state.audit,
                state.actorId,
                'escalate',
                key,
                rec.id,
                rec,
                escalated,
                newCorrelationId(),
              ),
            })
            return
          }
        }
        throw new TdlApiError(Problems.sod())
      }

      const before = { ...rec }
      const next: VersionedRecord = {
        ...rec,
        state: 'Approved',
        input_version: rec.input_version + 1,
        updatedAtUtc: toUtcIso(),
        architectureVersion: rec.architectureVersion ?? state.rec001.architectureVersion,
        releaseVersion: rec.releaseVersion ?? state.rec001.releaseVersion,
      }

      let forms = { ...state.forms, [key]: next }
      let nodeStatus = { ...state.nodeStatus }
      let rec001 = { ...state.rec001 }
      let activeNode = state.activeNode
      let branchesInvalidated = state.branchesInvalidated

      if (key === 'apr003') {
        nodeStatus.d4 = 'done'
        nodeStatus.n8 = 'active'
        activeNode = 'n8'
        rec001.currentWorkflowState = 'Node #8 — Risk & EA Assessment'
      } else if (key === 'apr004') {
        nodeStatus.d5 = 'done'
        nodeStatus.n9 = 'active'
        activeNode = 'n9'
        rec001.currentWorkflowState = 'Node #9 — TAC Review'
      } else if (key === 'apr005') {
        nodeStatus.d6 = 'done'
        nodeStatus.n10a = 'active'
        nodeStatus.n10b = 'active'
        activeNode = 'n10a'
        branchesInvalidated = false
        rec001.currentWorkflowState = 'Nodes #10A / #10B — Parallel Reviews'
        forms.frm009a = { ...forms.frm009a, architectureVersion: rec001.architectureVersion }
        forms.frm009b = { ...forms.frm009b, architectureVersion: rec001.architectureVersion }
      } else if (key === 'apr006a' || key === 'apr006b') {
        if (key === 'apr006a') nodeStatus.d7a = 'done'
        if (key === 'apr006b') nodeStatus.d7b = 'done'
        const aOk = (key === 'apr006a' ? next : forms.apr006a).state === 'Approved'
        const bOk = (key === 'apr006b' ? next : forms.apr006b).state === 'Approved'
        const aVer = (key === 'apr006a' ? next : forms.apr006a).architectureVersion
        const bVer = (key === 'apr006b' ? next : forms.apr006b).architectureVersion
        if (aOk && bOk) {
          nodeStatus.d8 = aVer && bVer && aVer === bVer ? 'active' : 'waiting'
          activeNode = 'd8'
          rec001.currentWorkflowState = 'Node D8 — Join Gate'
        }
      } else if (key === 'apr010') {
        nodeStatus.d14 = 'done'
        forms.apr010 = { ...next, releaseVersion: rec001.releaseVersion }
        if (evalJ1(forms, rec001.releaseVersion)) {
          nodeStatus.j1 = 'done'
          nodeStatus.n28 = 'active'
          activeNode = 'n28'
        } else {
          nodeStatus.j1 = 'waiting'
          activeNode = 'j1'
        }
      }

      const corr = newCorrelationId()
      rememberIdempotency(idempotencyKey, payload, { ok: true })
      set({
        forms,
        nodeStatus,
        rec001,
        activeNode,
        branchesInvalidated,
        lastProblem: null,
        audit: appendAudit(state.audit, state.actorId, 'approve', key, next.id, before, next, corr),
      })

      // Auto-advance D8 when both approved with same arch version
      const after = get()
      if (
        after.forms.apr006a.state === 'Approved' &&
        after.forms.apr006b.state === 'Approved' &&
        after.forms.apr006a.architectureVersion === after.forms.apr006b.architectureVersion &&
        after.forms.apr006a.architectureVersion === after.rec001.architectureVersion
      ) {
        set({
          nodeStatus: unlockPoc02(after.nodeStatus),
          activeNode: 'n25',
          rec001: {
            ...after.rec001,
            currentWorkflowState: 'POC-02 — Release Train',
          },
        })
      }
    } catch (e) {
      if (e instanceof TdlApiError) set({ lastProblem: e.problem })
      else throw e
    }
  },

  returnForm: (key, expectedVersion, idempotencyKey, packet) => {
    try {
      const state = get()
      const rec = state.forms[key]
      const payload = { action: 'return', key, expectedVersion, packet }
      const { replay } = checkIdempotency(idempotencyKey, payload)
      if (replay) return

      if (rec.input_version !== expectedVersion) throw new TdlApiError(Problems.staleVersion())
      if (!packet.returnReason || !packet.comments || !packet.remediationOwnerId || !packet.dueDateUtc) {
        throw new TdlApiError({
          status: 422,
          code: 'TDL-VAL-001',
          message: 'Return packet incomplete',
          correlation_id: newCorrelationId(),
          field_errors: [
            { field: 'returnReason', message: 'Required' },
            { field: 'comments', message: 'Required' },
            { field: 'remediationOwnerId', message: 'Required' },
            { field: 'dueDateUtc', message: 'Required' },
          ].filter((f) => !(packet as Record<string, string>)[f.field]),
        })
      }

      const before = { ...rec }
      const next: VersionedRecord = {
        ...rec,
        state: 'Returned for Revision',
        returnPacket: packet,
        input_version: rec.input_version + 1,
        updatedAtUtc: toUtcIso(),
      }

      let forms = { ...state.forms, [key]: next }
      let nodeStatus = { ...state.nodeStatus }
      let activeNode = state.activeNode
      let branchesInvalidated = state.branchesInvalidated
      let rec001 = { ...state.rec001 }

      if (key === 'apr006a' || key === 'apr006b') {
        branchesInvalidated = true
        nodeStatus.d7a = 'invalidated'
        nodeStatus.d7b = 'invalidated'
        nodeStatus.n10a = 'invalidated'
        nodeStatus.n10b = 'invalidated'
        nodeStatus.n9 = 'active'
        activeNode = 'n9'
        rec001.currentWorkflowState = 'Node #9 — TAC Review (reopened)'
        forms.frm008 = {
          ...forms.frm008,
          state: 'Returned for Revision',
          input_version: forms.frm008.input_version + 1,
        }
        forms.apr006a = {
          ...forms.apr006a,
          state: 'Returned for Revision',
          input_version: forms.apr006a.input_version + 1,
        }
        forms.apr006b = {
          ...forms.apr006b,
          state: 'Returned for Revision',
          input_version: forms.apr006b.input_version + 1,
        }
        if (key === 'apr006a') forms.apr006a = next
        if (key === 'apr006b') forms.apr006b = next
      }

      const corr = newCorrelationId()
      rememberIdempotency(idempotencyKey, payload, { ok: true })
      set({
        forms,
        nodeStatus,
        activeNode,
        branchesInvalidated,
        rec001,
        lastProblem: null,
        audit: appendAudit(state.audit, state.actorId, 'return', key, next.id, before, next, corr),
      })
    } catch (e) {
      if (e instanceof TdlApiError) set({ lastProblem: e.problem })
      else throw e
    }
  },

  decideSourcing: (external, expectedVersion, idempotencyKey) => {
    try {
      const state = get()
      const rec = state.forms.dec001
      const payload = { external, expectedVersion }
      const { replay } = checkIdempotency(idempotencyKey, payload)
      if (replay) return
      if (rec.input_version !== expectedVersion) throw new TdlApiError(Problems.staleVersion())

      const next: VersionedRecord = {
        ...rec,
        data: { ...rec.data, externalSourcingRequired: external },
        state: 'Approved',
        submittedBy: state.actorId,
        preparedBy: state.actorId,
        input_version: rec.input_version + 1,
        updatedAtUtc: toUtcIso(),
      }

      let nodeStatus = { ...state.nodeStatus, d3: 'done' as NodeStatus }
      let activeNode: NodeId
      let rec001 = { ...state.rec001 }
      const forms = { ...state.forms, dec001: next }

      if (external) {
        nodeStatus.n7 = 'active'
        nodeStatus.d4 = 'locked'
        activeNode = 'n7'
        rec001.currentWorkflowState = 'Node #7 — Budget'
        const amount = sumRequirementsCost(forms.frm005)
        forms.frm006 = {
          ...forms.frm006,
          data: {
            ...forms.frm006.data,
            requiredAmount: amount,
            currencyCode: forms.frm005.data.currencyCode || 'SAR',
          },
        }
      } else {
        nodeStatus.n7 = 'skipped'
        nodeStatus.d4 = 'skipped'
        nodeStatus.n8 = 'active'
        activeNode = 'n8'
        rec001.currentWorkflowState = 'Node #8 — Risk & EA Assessment'
      }

      rememberIdempotency(idempotencyKey, payload, { ok: true })
      set({
        forms,
        nodeStatus,
        activeNode,
        rec001,
        lastProblem: null,
        audit: appendAudit(
          state.audit,
          state.actorId,
          'decide_sourcing',
          'dec001',
          next.id,
          rec,
          next,
          newCorrelationId(),
        ),
      })
    } catch (e) {
      if (e instanceof TdlApiError) set({ lastProblem: e.problem })
      else throw e
    }
  },

  castCabVote: (slotId, decision, expectedVersion, idempotencyKey) => {
    try {
      const state = get()
      const rec = state.forms.apr011
      const votes = [...((rec.data.votes as CabVote[]) || [])]
      const idx = votes.findIndex((v) => v.slotId === slotId)
      if (idx < 0) throw new TdlApiError(Problems.staleVersion())
      const slot = votes[idx]
      const payload = { slotId, decision, expectedVersion, v: slot.input_version }
      const { replay } = checkIdempotency(idempotencyKey, payload)
      if (replay) return
      if (slot.input_version !== expectedVersion) throw new TdlApiError(Problems.staleVersion())
      if (slot.state !== 'Pending') throw new TdlApiError(Problems.staleVersion())

      if (decision === 'Returned') {
        votes[idx] = {
          ...slot,
          state: 'Returned',
          voterId: state.actorId,
          input_version: slot.input_version + 1,
        }
        for (let i = 0; i < votes.length; i++) {
          if (i !== idx && votes[i].state === 'Pending') {
            votes[i] = { ...votes[i], state: 'Cancelled', input_version: votes[i].input_version + 1 }
          }
        }
      } else {
        votes[idx] = {
          ...slot,
          state: 'Approved',
          voterId: state.actorId,
          input_version: slot.input_version + 1,
        }
      }

      const allApproved = votes.every((v) => v.state === 'Approved')
      const next: VersionedRecord = {
        ...rec,
        data: { ...rec.data, votes },
        state: allApproved ? 'Approved' : rec.state,
        input_version: rec.input_version + 1,
        releaseVersion: state.rec001.releaseVersion,
        updatedAtUtc: toUtcIso(),
      }

      let nodeStatus = { ...state.nodeStatus }
      let activeNode = state.activeNode
      const forms = { ...state.forms, apr011: next }

      if (allApproved) {
        nodeStatus.d15 = 'done'
        if (evalJ1(forms, state.rec001.releaseVersion)) {
          nodeStatus.j1 = 'done'
          nodeStatus.n28 = 'active'
          activeNode = 'n28'
        } else {
          nodeStatus.j1 = 'waiting'
          activeNode = 'j1'
        }
      }

      rememberIdempotency(idempotencyKey, payload, { ok: true })
      set({
        forms,
        nodeStatus,
        activeNode,
        lastProblem: null,
        audit: appendAudit(
          state.audit,
          state.actorId,
          `cab_${decision.toLowerCase()}`,
          'apr011',
          rec.id,
          rec,
          next,
          newCorrelationId(),
        ),
      })
    } catch (e) {
      if (e instanceof TdlApiError) set({ lastProblem: e.problem })
      else throw e
    }
  },

  startDeployment: (expectedVersion, idempotencyKey) => {
    try {
      const state = get()
      const rec = state.forms.frm024
      const cab = state.forms.frmCab001.data
      const payload = { action: 'start_deployment', expectedVersion }
      const { replay } = checkIdempotency(idempotencyKey, payload)
      if (replay) return
      if (rec.input_version !== expectedVersion) throw new TdlApiError(Problems.staleVersion())

      const persona = PERSONAS.find((p) => p.id === state.actorId)
      if (!persona?.roles.includes('Deployment Lead')) {
        throw new TdlApiError(Problems.deploymentLeadRequired())
      }

      const now = serverNowUtc()
      const start = String(cab.window_start)
      const end = String(cab.window_end)
      const openConditions = (cab.openConditions as string[]) || []
      if (now < start || now > end || openConditions.length > 0) {
        throw new TdlApiError(Problems.deployWindow())
      }

      const next: VersionedRecord = {
        ...rec,
        data: { ...rec.data, deploymentStarted: true },
        state: 'Approved',
        input_version: rec.input_version + 1,
        updatedAtUtc: toUtcIso(),
        submittedBy: state.actorId,
      }

      rememberIdempotency(idempotencyKey, payload, { ok: true })
      set({
        forms: { ...state.forms, frm024: next },
        nodeStatus: { ...state.nodeStatus, n29: 'done' },
        rec001: { ...state.rec001, currentWorkflowState: 'Deployed' },
        lastProblem: null,
        audit: appendAudit(
          state.audit,
          state.actorId,
          'start_deployment',
          'frm024',
          rec.id,
          rec,
          next,
          newCorrelationId(),
        ),
      })
    } catch (e) {
      if (e instanceof TdlApiError) set({ lastProblem: e.problem })
      else throw e
    }
  },

  completeAsyncAdoption: () => {
    const state = get()
    const next: VersionedRecord = {
      ...state.forms.frm013,
      state: 'Approved',
      data: { ...state.forms.frm013.data, asyncStatus: 'Completed' },
      releaseVersion: state.rec001.releaseVersion,
      input_version: state.forms.frm013.input_version + 1,
      updatedAtUtc: toUtcIso(),
      submittedBy: state.actorId,
    }
    const forms = { ...state.forms, frm013: next }
    let nodeStatus = { ...state.nodeStatus, n17: 'done' as NodeStatus }
    let activeNode = state.activeNode
    if (evalJ1(forms, state.rec001.releaseVersion)) {
      nodeStatus.j1 = 'done'
      nodeStatus.n28 = 'active'
      activeNode = 'n28'
    } else {
      nodeStatus.j1 = 'waiting'
    }
    set({ forms, nodeStatus, activeNode, lastProblem: null })
  },

  breakArchitectureVersion: () => {
    const state = get()
    set({
      forms: {
        ...state.forms,
        apr006a: {
          ...state.forms.apr006a,
          architectureVersion: 'ARCH-BROKEN',
          input_version: state.forms.apr006a.input_version + 1,
        },
      },
      nodeStatus: { ...state.nodeStatus, d8: 'waiting' },
    })
  },

  simulateStaleBump: (key) => {
    const state = get()
    const rec = state.forms[key]
    set({
      forms: {
        ...state.forms,
        [key]: { ...rec, input_version: rec.input_version + 1 },
      },
    })
  },
}))

export function getPersona(id: string) {
  return PERSONAS.find((p) => p.id === id)
}
