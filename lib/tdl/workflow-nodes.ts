import type { NodeId } from './types'

export interface WorkflowNodeDef {
  id: NodeId
  number: string
  artifact: string
  title: string
  titleAr: string
  phase: 'poc01' | 'poc02'
}

export const WORKFLOW_NODES: WorkflowNodeDef[] = [
  { id: 'n6', number: '#6', artifact: 'FRM-005', title: 'Requirements & SoW', titleAr: 'المتطلبات ونطاق العمل', phase: 'poc01' },
  { id: 'd3', number: 'D3', artifact: 'DEC-001', title: 'Sourcing Decision', titleAr: 'قرار التوريد', phase: 'poc01' },
  { id: 'n7', number: '#7', artifact: 'FRM-006', title: 'Budget', titleAr: 'الميزانية', phase: 'poc01' },
  { id: 'd4', number: 'D4', artifact: 'APR-003', title: 'Budget Approval', titleAr: 'اعتماد الميزانية', phase: 'poc01' },
  { id: 'n8', number: '#8', artifact: 'FRM-007', title: 'Risk & EA Assessment', titleAr: 'تقييم المخاطر والهندسة', phase: 'poc01' },
  { id: 'd5', number: 'D5', artifact: 'APR-004', title: 'Risk & EA Approval', titleAr: 'اعتماد المخاطر', phase: 'poc01' },
  { id: 'n9', number: '#9', artifact: 'FRM-008', title: 'TAC Review', titleAr: 'مراجعة TAC', phase: 'poc01' },
  { id: 'd6', number: 'D6', artifact: 'APR-005', title: 'Architecture Approval', titleAr: 'اعتماد الهندسة المعمارية', phase: 'poc01' },
  { id: 'n10a', number: '#10A', artifact: 'FRM-009A', title: 'Cybersecurity Review', titleAr: 'مراجعة الأمن السيبراني', phase: 'poc01' },
  { id: 'n10b', number: '#10B', artifact: 'FRM-009B', title: 'Data Governance Review', titleAr: 'مراجعة حوكمة البيانات', phase: 'poc01' },
  { id: 'd7a', number: 'D7A', artifact: 'APR-006A', title: 'Cyber Approval', titleAr: 'اعتماد الأمن', phase: 'poc01' },
  { id: 'd7b', number: 'D7B', artifact: 'APR-006B', title: 'Data Approval', titleAr: 'اعتماد البيانات', phase: 'poc01' },
  { id: 'd8', number: 'D8', artifact: 'JOIN', title: 'Join Gate', titleAr: 'بوابة الالتقاء', phase: 'poc01' },
  { id: 'n17', number: '#17', artifact: 'FRM-013', title: 'Adoption Prep (Async)', titleAr: 'تحضير التبني', phase: 'poc02' },
  { id: 'n25', number: '#25', artifact: 'FRM-021', title: 'UAT Readiness', titleAr: 'جاهزية UAT', phase: 'poc02' },
  { id: 'n26', number: '#26', artifact: 'FRM-022', title: 'UAT Execution', titleAr: 'تنفيذ UAT', phase: 'poc02' },
  { id: 'd14', number: 'D14', artifact: 'APR-010', title: 'Business Acceptance', titleAr: 'قبول الأعمال', phase: 'poc02' },
  { id: 'n27', number: '#27', artifact: 'FRM-CAB-001', title: 'CAB Package', titleAr: 'حزمة CAB', phase: 'poc02' },
  { id: 'd15', number: 'D15', artifact: 'APR-011', title: 'CAB Multi-Slot Voting', titleAr: 'تصويت CAB', phase: 'poc02' },
  { id: 'j1', number: 'J1', artifact: 'JOIN-REL-001', title: 'Release Join', titleAr: 'التقاء الإصدار', phase: 'poc02' },
  { id: 'n28', number: '#28', artifact: 'FRM-023', title: 'Adoption Execution', titleAr: 'تنفيذ التبني', phase: 'poc02' },
  { id: 'n29', number: '#29', artifact: 'FRM-024', title: 'Production Deployment', titleAr: 'النشر الإنتاجي', phase: 'poc02' },
]
