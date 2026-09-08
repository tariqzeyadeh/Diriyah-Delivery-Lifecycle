const fs = require('fs')
const XLSX = require('xlsx')
const path = 'C:/Users/USER/Downloads/Pre-Initiation_POC_Templates_and_Data_Dictionary R.xlsx'
const wb = XLSX.readFile(path)

function parseFieldSheet(name) {
  const ws = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false })
  const headerIdx = rows.findIndex(
    (r) => Array.isArray(r) && r.some((c) => String(c || '').toLowerCase() === 'technical name'),
  )
  const headers = rows[headerIdx].map((h) => String(h || '').trim())
  const fields = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !r.some((c) => c != null && String(c).trim() !== '')) continue
    const obj = {}
    headers.forEach((h, idx) => {
      if (h) obj[h] = r[idx] != null ? String(r[idx]).trim() : null
    })
    if (!obj['Technical Name']) continue
    fields.push(obj)
  }
  return fields
}

function mapType(dataType) {
  const t = (dataType || '').toLowerCase()
  if (!t) return 'String? @db.VarChar(255)'
  if (t.includes('boolean') && t.includes('date')) return 'Json?'
  if (t === 'boolean') return 'Boolean?'
  if (t.includes('datetime')) return 'DateTime?'
  if (t === 'date') return 'DateTime?'
  if (t.includes('integer') || t === 'text/integer') return 'Int?'
  if (t.includes('currency') || t.includes('percentage') || t.includes('decimal')) {
    if (t.includes('text') || t.includes('range')) return 'String? @db.VarChar(255)'
    return 'Decimal? @db.Decimal(18, 2)'
  }
  if (t.includes('long text')) return 'String? @db.Text'
  if (
    t.includes('repeatable') ||
    t.includes('multi reference') ||
    t.includes('multi-select') ||
    t.includes('structured') ||
    t.includes('polymorphic') ||
    t.includes('enum + references')
  ) {
    return 'Json?'
  }
  if (t.includes('duration') || t.includes('period')) return 'String? @db.VarChar(64)'
  if (t.includes('user')) return 'String? @db.VarChar(128)'
  if (t.includes('enum + text')) return 'String? @db.VarChar(512)'
  return 'String? @db.VarChar(255)'
}

function isChildEntityMarker(dataType) {
  return (dataType || '').toLowerCase().includes('repeatable child entity')
}

const shared = parseFieldSheet('04_Shared Fields')
const strategy = parseFieldSheet('05_Strategy')
const objectives = parseFieldSheet('06_Objectives')
const kpis = parseFieldSheet('07_KPI Register')
const kpiUpdates = parseFieldSheet('08_KPI Updates')
const demand = parseFieldSheet('10_Demand Business Case')
const budgetHeader = parseFieldSheet('11_Budget Header')
const budgetLines = parseFieldSheet('12_Budget Lines')
const procurement = parseFieldSheet('14_Procurement Plan')
const project = parseFieldSheet('16_Project Registration')
const approvals = parseFieldSheet('17_Approvals')
const evidence = parseFieldSheet('18_Evidence Comments')

const attachmentFields = evidence.filter((f) => f['Section / Sub-Entity'] === 'Attachment')
const commentFields = evidence.filter((f) => f['Section / Sub-Entity'] === 'Comment')

const optionFields = new Set([
  'option_name',
  'option_description',
  'option_estimated_cost_sar',
  'option_delivery_duration',
  'option_benefits_score',
  'option_risk_score',
  'option_weighted_score',
])
const benefitFields = new Set([
  'benefit_type',
  'benefit_description',
  'benefit_baseline',
  'benefit_target',
  'annual_financial_benefit_sar',
  'benefit_realization_start',
  'benefit_owner_user_id',
  'benefit_kpi_id',
])
const demandSkip = new Set([
  'options',
  'benefits',
  'raidc_items',
  ...optionFields,
  ...benefitFields,
])

const planSections = new Set(['Plan Header'])
const itemSections = new Set([
  'Identity',
  'Definition',
  'Quantity',
  'Value',
  'Sourcing',
  'Schedule',
  'Ownership',
  'Readiness',
  'Execution',
  'Outcome',
])

const REQUIRED_TITLES = new Set([
  'strategy_title',
  'demand_title',
  'objective_name',
  'kpi_name',
  'procurement_plan_title',
  'procurement_item_title',
  'project_name',
  'file_name',
  'mime_type',
  'file_checksum',
  'comment_text',
  'version_hash',
  'gate_code',
  'approver_user_id',
  'authority_basis',
  'approver_role',
])

/** Field-level Prisma type overrides (enums / required integrity fields). */
const FIELD_TYPE_OVERRIDES = {
  entry_route: 'EntryRoute',
  decision: 'DecisionEnum',
  virus_scan_status: 'VirusScanStatus',
  resolution_status: 'ResolutionStatus',
  notification_status: 'NotificationStatus?',
  lock_release_action: 'LockReleaseAction?',
  comment_type: 'CommentType?',
  attachment_classification: 'AttachmentClassification?',
  file_size_bytes: 'Int',
  file_name: 'String @db.VarChar(255)',
  mime_type: 'String @db.VarChar(128)',
  file_checksum: 'String @db.VarChar(128)',
  version_hash: 'String @db.VarChar(128)',
  comment_text: 'String @db.Text',
  decision_comments: 'String? @db.Text',
  entity_id: 'String @db.VarChar(64)',
  entity_type: 'String @db.VarChar(64)',
  gate_code: 'String @db.VarChar(64)',
  approver_user_id: 'String @db.VarChar(128)',
  entity_version: 'Int',
  approval_sequence: 'Int',
  resubmission_number: 'Int @default(0)',
  assigned_at: 'DateTime',
  sla_due_at: 'DateTime',
  document_type: 'String @db.VarChar(128)',
  file_version: 'String @db.VarChar(50)',
  parent_comment_id: 'String? @db.VarChar(64)',
}

function sharedBlock() {
  const lines = []
  for (const f of shared) {
    const name = f['Technical Name']
    if (name === 'record_id') continue
    let prismaType = mapType(f['Data Type'])
    if (name === 'master_trace_id') prismaType = 'String @db.VarChar(64)'
    else if (name === 'entry_route') prismaType = 'EntryRoute'
    else if (name === 'entity_type') prismaType = 'String @db.VarChar(64)'
    else if (name === 'version_number') prismaType = 'Int @default(1)'
    else if (name === 'version_status') prismaType = 'VersionStatus?'
    else if (name === 'record_status') prismaType = 'String? @db.VarChar(64)'
    else if (name === 'approval_status') prismaType = 'ApprovalDecision?'
    else if (name === 'rag_status') prismaType = 'RagStatus?'
    else if (name === 'lifecycle_phase') prismaType = 'String? @db.VarChar(64)'
    else if (name === 'created_by') prismaType = 'String @db.VarChar(128)'
    else if (name === 'created_at') prismaType = 'DateTime @default(now())'
    else if (name === 'modified_at') prismaType = 'DateTime? @updatedAt'
    else if (name === 'is_locked') prismaType = 'Boolean @default(false)'
    else if (name === 'is_active') prismaType = 'Boolean @default(true)'
    else if (name === 'data_classification') prismaType = 'String? @db.VarChar(64)'
    else if (name === 'source_system') prismaType = 'String? @db.VarChar(64)'
    lines.push(`  ${name.padEnd(28)} ${prismaType}`)
  }
  return lines.join('\n')
}

function fieldsBlock(fields, { pk, skip = new Set(), alsoSkip = new Set() } = {}) {
  const lines = []
  const seen = new Set()
  for (const f of fields) {
    const name = f['Technical Name']
    if (!name || skip.has(name) || alsoSkip.has(name) || seen.has(name)) continue
    if (isChildEntityMarker(f['Data Type'])) continue
    seen.add(name)
    let prismaType
    if (name === pk) prismaType = 'String @id @db.VarChar(64)'
    else if (FIELD_TYPE_OVERRIDES[name]) prismaType = FIELD_TYPE_OVERRIDES[name]
    else if (REQUIRED_TITLES.has(name)) prismaType = 'String @db.VarChar(255)'
    else prismaType = mapType(f['Data Type'])
    lines.push(`  ${name.padEnd(32)} ${prismaType}`)
  }
  return { lines: lines.join('\n'), seen }
}

function ensureLine(block, name, type) {
  if (new RegExp(`\\n  ${name}\\s`).test(`\n${block}`) || block.startsWith(`  ${name} `)) {
    return block
  }
  if (
    block
      .split('\n')
      .some((l) => l.trim().startsWith(`${name} `) || l.trim().startsWith(name.padEnd(1)))
  ) {
    const has = block.split('\n').some((l) => {
      const t = l.trim()
      return t === name || t.startsWith(`${name} `)
    })
    if (has) return block
  }
  return `${block}\n  ${name.padEnd(32)} ${type}`
}

// ── Enums from 20_Status Lookups + governance enums ─────────────────────────
const stRows = XLSX.utils.sheet_to_json(wb.Sheets['20_Status Lookups'], {
  header: 1,
  defval: null,
  raw: false,
})
const enumGroups = {}
let headerFound = false
for (const r of stRows) {
  if (!r) continue
  if (String(r[0]) === 'Lookup Group') {
    headerFound = true
    continue
  }
  if (!headerFound) continue
  const group = String(r[0] || '').trim()
  const code = String(r[1] || '').trim()
  if (!group || !code) continue
  const key = group.replace(/\s+/g, '')
  ;(enumGroups[key] = enumGroups[key] || new Set()).add(
    code.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase(),
  )
}
const enumNameMap = {
  EntryRoute: 'EntryRoute',
  StrategyStatus: 'StrategyStatus',
  DemandStatus: 'DemandStatus',
  BudgetStatus: 'BudgetStatus',
  ProcurementStage: 'ProcurementStage',
  ProcurementHealth: 'ProcurementHealth',
  PMOHandoff: 'PmoHandoffStatus',
  ApprovalDecision: 'ApprovalDecision',
  RAG: 'RagStatus',
}

let enumsOut = ''
for (const [group, codes] of Object.entries(enumGroups)) {
  const name = enumNameMap[group] || group
  enumsOut += `enum ${name} {\n`
  for (const c of codes) enumsOut += `  ${c}\n`
  enumsOut += `}\n\n`
}

// DecisionEnum mirrors Approval Decision (BR-008 decision field)
enumsOut += `enum DecisionEnum {
  PENDING
  APPROVED
  APPROVED_COND
  RETURNED
  REJECTED
  WITHDRAWN
}

enum VirusScanStatus {
  PENDING
  CLEAN
  QUARANTINED
  FAILED
}

enum ResolutionStatus {
  OPEN
  RESPONDED
  RESOLVED
  REOPENED
  NOT_APPLICABLE
}

enum NotificationStatus {
  PENDING
  SENT
  PARTIALLY_FAILED
  FAILED
}

enum LockReleaseAction {
  KEEP_LOCKED
  CREATE_REVISION
  RELEASE_FOR_NEXT_STAGE
  CLOSE
}

enum CommentType {
  GENERAL
  CLARIFICATION
  VALIDATION_FINDING
  RETURN_INSTRUCTION
  APPROVAL_COMMENT
  SYSTEM_NOTE
}

enum AttachmentClassification {
  PUBLIC
  INTERNAL
  CONFIDENTIAL
  RESTRICTED
}

enum Perspective {
  FINANCIAL
  CUSTOMER
  INTERNAL
  LEARNING
}

enum RaidcType {
  RISK
  ISSUE
  ASSUMPTION
  DEPENDENCY
  CONSTRAINT
}

enum VersionStatus {
  WORKING
  SUBMITTED
  APPROVED
  SUPERSEDED
  ARCHIVED
}

`

const planFields = procurement.filter((f) => planSections.has(f['Section / Sub-Entity']))
const itemFields = procurement.filter((f) => itemSections.has(f['Section / Sub-Entity']))

const strategyF = fieldsBlock(strategy, { pk: 'strategy_id' })
const objectiveF = fieldsBlock(objectives, {
  pk: 'objective_id',
  alsoSkip: new Set(['strategy_id']),
})
const kpiF = fieldsBlock(kpis, { pk: 'kpi_id', alsoSkip: new Set(['objective_id']) })
const kpiUpF = fieldsBlock(kpiUpdates, { pk: 'kpi_update_id', alsoSkip: new Set(['kpi_id']) })
const demandF = fieldsBlock(demand, { pk: 'demand_id', skip: demandSkip })
const budgetHF = fieldsBlock(budgetHeader, { pk: 'budget_submission_id' })
const budgetLF = fieldsBlock(budgetLines, {
  pk: 'budget_line_id',
  alsoSkip: new Set(['budget_submission_id', 'demand_id']),
})
const planF = fieldsBlock(planFields, {
  pk: 'procurement_plan_id',
  alsoSkip: new Set(['budget_submission_id']),
})
const itemF = fieldsBlock(itemFields, {
  pk: 'procurement_item_id',
  alsoSkip: new Set(['procurement_plan_id', 'budget_line_id', 'demand_id']),
})
const projectF = fieldsBlock(project, { pk: 'project_id' })
const approvalF = fieldsBlock(approvals, { pk: 'approval_id' })
const attachmentF = fieldsBlock(attachmentFields, { pk: 'attachment_id' })
const commentF = fieldsBlock(commentFields, { pk: 'comment_id' })

let objectiveFields = ensureLine(objectiveF.lines, 'strategy_id', 'String @db.VarChar(64)')
let kpiFields = ensureLine(kpiF.lines, 'objective_id', 'String @db.VarChar(64)')
let kpiUpFields = ensureLine(kpiUpF.lines, 'kpi_id', 'String @db.VarChar(64)')
let budgetHFields = budgetHF.lines
budgetHFields = ensureLine(budgetHFields, 'capex_total_sar', 'Decimal? @db.Decimal(18, 2)')
budgetHFields = ensureLine(budgetHFields, 'opex_total_sar', 'Decimal? @db.Decimal(18, 2)')
budgetHFields = ensureLine(budgetHFields, 'contingency_total_sar', 'Decimal? @db.Decimal(18, 2)')
budgetHFields = ensureLine(budgetHFields, 'tax_total_sar', 'Decimal? @db.Decimal(18, 2)')
let budgetLFields = ensureLine(budgetLF.lines, 'budget_submission_id', 'String @db.VarChar(64)')
budgetLFields = ensureLine(budgetLFields, 'demand_id', 'String @db.VarChar(64)')
budgetLFields = ensureLine(budgetLFields, 'contingency_basis', 'String? @db.VarChar(255)')
let planFieldsOut = ensureLine(planF.lines, 'budget_submission_id', 'String @db.VarChar(64)')
let itemFieldsOut = ensureLine(itemF.lines, 'procurement_plan_id', 'String @db.VarChar(64)')
itemFieldsOut = ensureLine(itemFieldsOut, 'budget_line_id', 'String @db.VarChar(64)')
itemFieldsOut = ensureLine(itemFieldsOut, 'demand_id', 'String? @db.VarChar(64)')

// BR-008: version_number on ApprovalTransaction (alongside entity_version from dictionary)
let approvalFields = ensureLine(approvalF.lines, 'version_number', 'Int @default(1)')
let attachmentFieldsOut = attachmentF.lines
attachmentFieldsOut = ensureLine(attachmentFieldsOut, 'uploaded_by', 'String @db.VarChar(128)')
attachmentFieldsOut = ensureLine(attachmentFieldsOut, 'uploaded_at', 'DateTime @default(now())')
attachmentFieldsOut = ensureLine(attachmentFieldsOut, 'is_locked', 'Boolean @default(false)')
attachmentFieldsOut = ensureLine(attachmentFieldsOut, 'created_by', 'String @db.VarChar(128)')
attachmentFieldsOut = ensureLine(attachmentFieldsOut, 'created_at', 'DateTime @default(now())')
attachmentFieldsOut = ensureLine(attachmentFieldsOut, 'master_trace_id', 'String? @db.VarChar(64)')
attachmentFieldsOut = ensureLine(attachmentFieldsOut, 'version_number', 'Int @default(1)')

let commentFieldsOut = commentF.lines
commentFieldsOut = ensureLine(commentFieldsOut, 'linked_entity', 'Json?')
commentFieldsOut = ensureLine(commentFieldsOut, 'uploaded_by', 'String @db.VarChar(128)')
commentFieldsOut = ensureLine(commentFieldsOut, 'created_by', 'String @db.VarChar(128)')
commentFieldsOut = ensureLine(commentFieldsOut, 'created_at', 'DateTime @default(now())')
commentFieldsOut = ensureLine(commentFieldsOut, 'is_locked', 'Boolean @default(false)')
commentFieldsOut = ensureLine(commentFieldsOut, 'master_trace_id', 'String? @db.VarChar(64)')
commentFieldsOut = ensureLine(commentFieldsOut, 'version_number', 'Int @default(1)')

approvalFields = ensureLine(approvalFields, 'created_by', 'String @db.VarChar(128)')
approvalFields = ensureLine(approvalFields, 'created_at', 'DateTime @default(now())')
approvalFields = ensureLine(approvalFields, 'is_locked', 'Boolean @default(true)')
approvalFields = ensureLine(approvalFields, 'master_trace_id', 'String? @db.VarChar(64)')

const schema = `// Diriyah — Exhaustive Prisma schema
// Source: Pre-Initiation_POC_Templates_and_Data_Dictionary R.xlsx
// Sheets: 02_ID Relationships, 04_Shared Fields, 05_Strategy, 06_Objectives,
//         07_KPI Register, 08_KPI Updates, 10_Demand Business Case,
//         11_Budget Header, 12_Budget Lines, 14_Procurement Plan,
//         16_Project Registration, 17_Approvals, 18_Evidence Comments,
//         20_Status Lookups (BR-008 / BR-026 / BR-027 governance)
// Mapping: Long Text->Text; Currency/Decimal/Percentage->Decimal(18,2);
//          Repeatable*/Multi*/Structured/Polymorphic->Json; child entities->models.
// Invariants: every business model includes SHR; governance models are append-oriented;
//             onDelete Restrict; no hard deletes.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

${enumsOut}// ─────────────────────────────────────────────
// Master Traceability Spine
// ─────────────────────────────────────────────

model MasterTrace {
  master_trace_id String     @id @db.VarChar(64)
  entry_route     EntryRoute
  created_at      DateTime   @default(now())
  created_by      String     @db.VarChar(128)
  is_active       Boolean    @default(true)

  strategies         Strategy[]
  demands            Demand[]
  budget_submissions BudgetSubmission[]
  procurement_plans  ProcurementPlan[]
  projects           ProjectRegistration[]
  approvals          ApprovalTransaction[]
  attachments        Attachment[]
  comments           Comment[]

  @@map("master_trace")
}

model Strategy {
${strategyF.lines}

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  master_trace       MasterTrace         @relation(fields: [master_trace_id], references: [master_trace_id], onDelete: Restrict)
  objectives         StrategicObjective[]
  demands            Demand[]
  budget_submissions BudgetSubmission[]
  procurement_plans  ProcurementPlan[]

  @@index([master_trace_id])
  @@map("strategy")
}

model StrategicObjective {
${objectiveFields}

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  strategy Strategy        @relation(fields: [strategy_id], references: [strategy_id], onDelete: Restrict)
  kpis     KpiDefinition[]

  @@index([strategy_id])
  @@index([master_trace_id])
  @@map("strategic_objective")
}

model KpiDefinition {
${kpiFields}

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  objective StrategicObjective     @relation(fields: [objective_id], references: [objective_id], onDelete: Restrict)
  updates   KpiPerformanceUpdate[]

  @@index([objective_id])
  @@index([master_trace_id])
  @@map("kpi_definition")
}

model KpiPerformanceUpdate {
${kpiUpFields}

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  kpi KpiDefinition @relation(fields: [kpi_id], references: [kpi_id], onDelete: Restrict)

  @@index([kpi_id])
  @@index([master_trace_id])
  @@map("kpi_performance_update")
}

model Demand {
${demandF.lines}

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  master_trace      MasterTrace           @relation(fields: [master_trace_id], references: [master_trace_id], onDelete: Restrict)
  strategy          Strategy?             @relation(fields: [strategy_id], references: [strategy_id], onDelete: Restrict)
  options           DemandOption[]
  benefits          DemandBenefit[]
  raidc_items       DemandRaidc[]
  budget_lines      BudgetLine[]
  procurement_items ProcurementItem[]
  projects          ProjectRegistration[]

  @@index([master_trace_id])
  @@index([strategy_id])
  @@map("demand")
}

model DemandOption {
  option_id                 String   @id @db.VarChar(64)
  demand_id                 String   @db.VarChar(64)
  option_name               String   @db.VarChar(255)
  option_description        String?  @db.Text
  option_estimated_cost_sar Decimal? @db.Decimal(18, 2)
  option_delivery_duration  String?  @db.VarChar(64)
  option_benefits_score     Decimal? @db.Decimal(18, 2)
  option_risk_score         Decimal? @db.Decimal(18, 2)
  option_weighted_score     Decimal? @db.Decimal(18, 2)
  recommendation_status     String?  @db.VarChar(64)

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  demand Demand @relation(fields: [demand_id], references: [demand_id], onDelete: Restrict)

  @@index([demand_id])
  @@index([master_trace_id])
  @@map("demand_option")
}

model DemandBenefit {
  benefit_id                   String    @id @db.VarChar(64)
  demand_id                    String    @db.VarChar(64)
  benefit_type                 String?   @db.VarChar(64)
  benefit_description          String?   @db.Text
  benefit_baseline             String?   @db.VarChar(255)
  benefit_target               String?   @db.VarChar(255)
  annual_financial_benefit_sar Decimal?  @db.Decimal(18, 2)
  benefit_realization_start    DateTime?
  benefit_owner_user_id        String?   @db.VarChar(128)
  benefit_kpi_id               String?   @db.VarChar(64)

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  demand Demand @relation(fields: [demand_id], references: [demand_id], onDelete: Restrict)

  @@index([demand_id])
  @@index([master_trace_id])
  @@map("demand_benefit")
}

model DemandRaidc {
  demand_item_id String    @id @db.VarChar(64)
  demand_id      String    @db.VarChar(64)
  type           RaidcType
  description    String    @db.Text
  owner          String?   @db.VarChar(128)
  exposure_score String?   @db.VarChar(32)
  status         String?   @db.VarChar(64)
  due_date       DateTime?

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  demand Demand @relation(fields: [demand_id], references: [demand_id], onDelete: Restrict)

  @@index([demand_id])
  @@index([master_trace_id])
  @@map("demand_raidc")
}

model BudgetSubmission {
${budgetHFields}

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  master_trace      MasterTrace       @relation(fields: [master_trace_id], references: [master_trace_id], onDelete: Restrict)
  strategy          Strategy?         @relation(fields: [strategy_id], references: [strategy_id], onDelete: Restrict)
  budget_lines      BudgetLine[]
  procurement_plans ProcurementPlan[]

  @@index([master_trace_id])
  @@index([strategy_id])
  @@map("budget_submission")
}

model BudgetLine {
${budgetLFields}

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  budget_submission BudgetSubmission  @relation(fields: [budget_submission_id], references: [budget_submission_id], onDelete: Restrict)
  demand            Demand            @relation(fields: [demand_id], references: [demand_id], onDelete: Restrict)
  procurement_items ProcurementItem[]

  @@index([budget_submission_id])
  @@index([demand_id])
  @@index([master_trace_id])
  @@map("budget_line")
}

model ProcurementPlan {
${planFieldsOut}

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  master_trace      MasterTrace      @relation(fields: [master_trace_id], references: [master_trace_id], onDelete: Restrict)
  budget_submission BudgetSubmission @relation(fields: [budget_submission_id], references: [budget_submission_id], onDelete: Restrict)
  strategy          Strategy?        @relation(fields: [strategy_id], references: [strategy_id], onDelete: Restrict)
  items             ProcurementItem[]

  @@index([master_trace_id])
  @@index([budget_submission_id])
  @@map("procurement_plan")
}

model ProcurementItem {
${itemFieldsOut}

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  plan                 ProcurementPlan      @relation(fields: [procurement_plan_id], references: [procurement_plan_id], onDelete: Restrict)
  budget_line          BudgetLine           @relation(fields: [budget_line_id], references: [budget_line_id], onDelete: Restrict)
  demand               Demand?              @relation(fields: [demand_id], references: [demand_id], onDelete: Restrict)
  project_registration ProjectRegistration?

  @@index([procurement_plan_id])
  @@index([budget_line_id])
  @@index([demand_id])
  @@index([master_trace_id])
  @@map("procurement_item")
}

model ProjectRegistration {
${projectF.lines}

  // Shared fields (04_Shared Fields)
${sharedBlock()}

  master_trace     MasterTrace      @relation(fields: [master_trace_id], references: [master_trace_id], onDelete: Restrict)
  procurement_item ProcurementItem? @relation(fields: [procurement_item_id], references: [procurement_item_id], onDelete: Restrict)
  demand           Demand?          @relation(fields: [demand_id], references: [demand_id], onDelete: Restrict)

  @@unique([procurement_item_id])
  @@index([master_trace_id])
  @@index([demand_id])
  @@map("project_registration")
}

// ─────────────────────────────────────────────
// Governance, Evidence & Comments (BR-008 / BR-026 / BR-027)
// Sheets: 17_Approvals, 18_Evidence Comments
// ─────────────────────────────────────────────

model ApprovalTransaction {
${approvalFields}

  master_trace MasterTrace? @relation(fields: [master_trace_id], references: [master_trace_id], onDelete: Restrict)

  @@index([entity_type, entity_id])
  @@index([gate_code])
  @@index([approver_user_id])
  @@index([master_trace_id])
  @@index([decision])
  @@map("approval_transaction")
}

model Attachment {
${attachmentFieldsOut}

  master_trace MasterTrace? @relation(fields: [master_trace_id], references: [master_trace_id], onDelete: Restrict)

  @@index([virus_scan_status])
  @@index([master_trace_id])
  @@index([file_checksum])
  @@map("attachment")
}

model Comment {
${commentFieldsOut}

  master_trace MasterTrace? @relation(fields: [master_trace_id], references: [master_trace_id], onDelete: Restrict)
  parent       Comment?     @relation("CommentThread", fields: [parent_comment_id], references: [comment_id], onDelete: Restrict)
  replies      Comment[]    @relation("CommentThread")

  @@index([parent_comment_id])
  @@index([resolution_status])
  @@index([master_trace_id])
  @@map("comment")
}
`

fs.writeFileSync('prisma/schema.prisma', schema)
console.log('Wrote prisma/schema.prisma bytes=', schema.length)
console.log({
  strategy: strategy.length,
  objectives: objectives.length,
  kpis: kpis.length,
  kpiUpdates: kpiUpdates.length,
  demand: demand.length,
  budgetHeader: budgetHeader.length,
  budgetLines: budgetLines.length,
  plan: planFields.length,
  item: itemFields.length,
  project: project.length,
  approvals: approvals.length,
  attachments: attachmentFields.length,
  comments: commentFields.length,
  shared: shared.length,
})
