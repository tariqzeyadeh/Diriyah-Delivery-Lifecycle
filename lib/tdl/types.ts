/** Technology Delivery Lifecycle — core types */

export type FormState =
  | 'Draft'
  | 'Submitted'
  | 'Pending Approval'
  | 'Approved'
  | 'Returned for Revision'

export type NodeStatus = 'locked' | 'active' | 'done' | 'skipped' | 'waiting' | 'invalidated' | 'in_progress'

export type NodeId =
  | 'n6'
  | 'd3'
  | 'n7'
  | 'd4'
  | 'n8'
  | 'd5'
  | 'n9'
  | 'd6'
  | 'n10a'
  | 'n10b'
  | 'd7a'
  | 'd7b'
  | 'd8'
  | 'n17'
  | 'n25'
  | 'n26'
  | 'd14'
  | 'n27'
  | 'd15'
  | 'j1'
  | 'n28'
  | 'n29'

export type TdlErrorCode =
  | 'TDL-CON-001'
  | 'TDL-IDEM-001'
  | 'TDL-SOD-001'
  | 'TDL-VAL-002'
  | 'TDL-EVD-001'
  | 'TDL-WIN-001'
  | 'TDL-ROLE-001'
  | 'TDL-VAL-001'

export interface FieldError {
  field: string
  message: string
}

/** application/problem+json */
export interface ProblemJson {
  type?: string
  title?: string
  status: number
  code: TdlErrorCode | string
  message: string
  correlation_id: string
  field_errors: FieldError[]
}

export interface AuditEvent {
  id: string
  at_utc: string
  actor_id: string
  action: string
  entity_type: string
  entity_id: string
  before_hash: string
  after_hash: string
  correlation_id: string
}

export interface Persona {
  id: string
  name: string
  nameAr: string
  roles: string[]
  groupIds: string[]
}

export interface ApprovalGroup {
  id: string
  name: string
  memberIds: string[]
  managerId: string
}

export interface ReturnPacket {
  returnReason: string
  comments: string
  remediationOwnerId: string
  dueDateUtc: string
}

export interface VersionedRecord<T = Record<string, unknown>> {
  id: string
  artifactType: string
  input_version: number
  state: FormState
  submittedBy: string | null
  preparedBy: string | null
  data: T
  returnPacket?: ReturnPacket | null
  updatedAtUtc: string
  softDeleted: boolean
  architectureVersion?: string | null
  releaseVersion?: string | null
  escalatedToManagerId?: string | null
}

export interface Rec001 {
  id: 'REC-001'
  lifecycleNumber: string
  initiativeTitle: string
  requestorId: string
  targetGoLiveUtc: string
  currentWorkflowState: string
  input_version: number
  architectureVersion: string
  releaseVersion: string
  packageVersion: string
}

export type CabSlotId = 'cab_chair' | 'tech_ops' | 'cybersecurity' | 'data_management'
export type CabVoteState = 'Pending' | 'Approved' | 'Returned' | 'Cancelled'

export interface CabVote {
  slotId: CabSlotId
  label: string
  state: CabVoteState
  voterId: string | null
  input_version: number
}

export interface CabPackageData {
  changeRiskRating: 'Low' | 'Medium' | 'High' | 'Emergency'
  data_change_impact: 'None' | 'Low' | 'Medium' | 'High'
  window_start: string
  window_end: string
  openConditions: string[]
  changeTitle: string
}

export type EvidenceScanStatus = 'Pending' | 'Clean' | 'Quarantined'

export interface EvidenceFile {
  id: string
  name: string
  size: number
  mime: string
  scanStatus: EvidenceScanStatus
}

export type RiskRating = 'Low' | 'Medium' | 'High'

export interface FunctionalRequirement {
  id: string
  code: string
  description: string
  priority: string
  estimatedCost: number
}

export type FormKey =
  | 'frm005'
  | 'dec001'
  | 'frm006'
  | 'apr003'
  | 'frm007'
  | 'apr004'
  | 'frm008'
  | 'apr005'
  | 'frm009a'
  | 'frm009b'
  | 'apr006a'
  | 'apr006b'
  | 'frm013'
  | 'frm021'
  | 'frm022'
  | 'apr010'
  | 'frmCab001'
  | 'apr011'
  | 'frm023'
  | 'frm024'
