import type {
  ApprovalGroup,
  CabPackageData,
  CabVote,
  FormKey,
  Persona,
  Rec001,
  VersionedRecord,
} from './types'
import { toUtcIso } from './time'

export const PERSONAS: Persona[] = [
  {
    id: 'u-requestor',
    name: 'Mona Al-Fadhli',
    nameAr: 'منى الفاضلي',
    roles: ['Requestor', 'Preparer'],
    groupIds: ['g-delivery'],
  },
  {
    id: 'u-budget',
    name: 'Omar Al-Harbi',
    nameAr: 'عمر الحربي',
    roles: ['Budget Approver'],
    groupIds: ['g-budget'],
  },
  {
    id: 'u-risk',
    name: 'Sara Al-Qahtani',
    nameAr: 'سارة القحطاني',
    roles: ['Risk Approver'],
    groupIds: ['g-risk'],
  },
  {
    id: 'u-architect',
    name: 'Khalid Al-Mutairi',
    nameAr: 'خالد المطيري',
    roles: ['Architecture Approver', 'TAC'],
    groupIds: ['g-arch'],
  },
  {
    id: 'u-cyber',
    name: 'Noura Al-Otaibi',
    nameAr: 'نورة العتيبي',
    roles: ['Cyber Reviewer'],
    groupIds: ['g-cyber'],
  },
  {
    id: 'u-data',
    name: 'Faisal Al-Dosari',
    nameAr: 'فيصل الدوسري',
    roles: ['Data Governance'],
    groupIds: ['g-data'],
  },
  {
    id: 'u-business',
    name: 'Lina Al-Shammari',
    nameAr: 'لينا الشمري',
    roles: ['Business Approver'],
    groupIds: ['g-business'],
  },
  {
    id: 'u-cab-chair',
    name: 'Yousef Al-Ghamdi',
    nameAr: 'يوسف الغامدي',
    roles: ['CAB Chair'],
    groupIds: ['g-cab'],
  },
  {
    id: 'u-tech-ops',
    name: 'Huda Al-Zahrani',
    nameAr: 'هدى الزهراني',
    roles: ['Technology Operations'],
    groupIds: ['g-cab'],
  },
  {
    id: 'u-deploy',
    name: 'Majed Al-Anazi',
    nameAr: 'ماجد العنزي',
    roles: ['Deployment Lead'],
    groupIds: ['g-ops'],
  },
  {
    id: 'u-manager-budget',
    name: 'Budget Group Manager',
    nameAr: 'مدير مجموعة الميزانية',
    roles: ['Group Manager'],
    groupIds: ['g-budget'],
  },
]

export const APPROVAL_GROUPS: ApprovalGroup[] = [
  { id: 'g-budget', name: 'Budget Approval', memberIds: ['u-budget', 'u-requestor'], managerId: 'u-manager-budget' },
  { id: 'g-risk', name: 'Risk & EA Approval', memberIds: ['u-risk'], managerId: 'u-architect' },
  { id: 'g-arch', name: 'Architecture Approval', memberIds: ['u-architect'], managerId: 'u-cab-chair' },
  { id: 'g-cyber', name: 'Cyber Approval', memberIds: ['u-cyber'], managerId: 'u-cab-chair' },
  { id: 'g-data', name: 'Data Approval', memberIds: ['u-data'], managerId: 'u-cab-chair' },
  { id: 'g-business', name: 'Business Acceptance', memberIds: ['u-business'], managerId: 'u-cab-chair' },
  { id: 'g-cab', name: 'CAB', memberIds: ['u-cab-chair', 'u-tech-ops', 'u-cyber', 'u-data'], managerId: 'u-cab-chair' },
  { id: 'g-delivery', name: 'Delivery', memberIds: ['u-requestor'], managerId: 'u-architect' },
]

function draft<T extends Record<string, unknown>>(
  id: string,
  artifactType: string,
  data: T,
  preparedBy: string | null = 'u-requestor',
): VersionedRecord<T> {
  return {
    id,
    artifactType,
    input_version: 1,
    state: 'Draft',
    submittedBy: null,
    preparedBy,
    data,
    returnPacket: null,
    updatedAtUtc: toUtcIso(),
    softDeleted: false,
  }
}

export function createInitialRec001(): Rec001 {
  return {
    id: 'REC-001',
    lifecycleNumber: 'TDL-2026-00001',
    initiativeTitle: 'Diriyah Digital Experience Platform',
    requestorId: 'u-requestor',
    targetGoLiveUtc: '2026-12-15T09:00:00.000Z',
    currentWorkflowState: 'Node #6 — Requirements & SoW',
    input_version: 1,
    architectureVersion: 'ARCH-1.0',
    releaseVersion: 'REL-2026.1',
    packageVersion: 'PKG-1.0',
  }
}

export function createInitialForms(): Record<FormKey, VersionedRecord> {
  const frm005 = draft(
    'FRM-005',
    'FRM-005',
    {
      sowSummary: 'Deliver citizen-facing digital services for Diriyah precincts.',
      functionalRequirements: [
        {
          id: 'req-1',
          code: 'FR-001',
          description: 'Visitor itinerary booking',
          priority: 'Must',
          estimatedCost: 120000,
        },
        {
          id: 'req-2',
          code: 'FR-002',
          description: 'Arabic/English content CMS',
          priority: 'Must',
          estimatedCost: 85000,
        },
      ],
      estimatedBudgetTotal: 205000,
      currencyCode: 'SAR',
      evidence: [],
    },
  )

  return {
    frm005,
    dec001: draft('DEC-001', 'DEC-001', { externalSourcingRequired: false }),
    frm006: draft('FRM-006', 'FRM-006', {
      requiredAmount: 0,
      currencyCode: 'SAR',
      justification: '',
    }),
    apr003: draft('APR-003', 'APR-003', { decisionNotes: '' }, null),
    frm007: draft('FRM-007', 'FRM-007', {
      riskRating: 'Medium',
      eaNotes: '',
      residualRiskPercent: 35,
    }),
    apr004: draft('APR-004', 'APR-004', { decisionNotes: '' }, null),
    frm008: draft('FRM-008', 'FRM-008', {
      tacSummary: '',
      architectureVersionProposal: 'ARCH-1.0',
    }),
    apr005: draft('APR-005', 'APR-005', { decisionNotes: '' }, null),
    frm009a: draft('FRM-009A', 'FRM-009A', {
      cyberFindings: '',
      controlsCoveragePercent: 80,
    }, 'u-cyber'),
    frm009b: draft('FRM-009B', 'FRM-009B', {
      dataClassification: 'Internal',
      dgNotes: '',
    }, 'u-data'),
    apr006a: draft('APR-006A', 'APR-006A', { decisionNotes: '' }, null),
    apr006b: draft('APR-006B', 'APR-006B', { decisionNotes: '' }, null),
    frm013: draft('FRM-013', 'FRM-013', {
      adoptionPlan: '',
      trainingPercent: 0,
      asyncStatus: 'Not Started',
    }),
    frm021: draft('FRM-021', 'FRM-021', {
      readinessNotes: '',
      environmentsReady: false,
    }),
    frm022: draft('FRM-022', 'FRM-022', {
      executedTests: 0,
      passed: 0,
      failed: 0,
      defects: [],
    }),
    apr010: draft('APR-010', 'APR-010', { decisionNotes: '' }, null),
    frmCab001: draft('FRM-CAB-001', 'FRM-CAB-001', {
      changeTitle: 'Production release REL-2026.1',
      changeRiskRating: 'Medium',
      data_change_impact: 'Low',
      window_start: '2026-08-31T18:00:00.000Z',
      window_end: '2026-09-01T02:00:00.000Z',
      openConditions: [],
    } satisfies CabPackageData),
    apr011: draft('APR-011', 'APR-011', { votes: [] as CabVote[] }, null),
    frm023: draft('FRM-023', 'FRM-023', {
      adoptionExecuted: false,
      notes: '',
    }),
    frm024: draft('FRM-024', 'FRM-024', {
      deploymentStarted: false,
      deploymentNotes: '',
    }),
  }
}

export function buildCabVotes(dataChangeImpact: string): CabVote[] {
  const votes: CabVote[] = [
    { slotId: 'cab_chair', label: 'CAB Chair', state: 'Pending', voterId: null, input_version: 1 },
    { slotId: 'tech_ops', label: 'Technology Operations', state: 'Pending', voterId: null, input_version: 1 },
    { slotId: 'cybersecurity', label: 'Cybersecurity', state: 'Pending', voterId: null, input_version: 1 },
  ]
  if (dataChangeImpact !== 'None') {
    votes.push({
      slotId: 'data_management',
      label: 'Data Management',
      state: 'Pending',
      voterId: null,
      input_version: 1,
    })
  }
  return votes
}

export const RISK_ORDER: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Emergency: 99,
}
