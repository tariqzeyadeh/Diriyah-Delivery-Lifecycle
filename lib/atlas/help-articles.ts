export type HelpArticle = {
  id: string
  category: HelpCategory
  title: string
  summary: string
  body: string
  tags: string[]
}

export type HelpCategory =
  'Strategy Formulation' | 'Demand Submission' | 'Budget Reconciliation' | 'Approval Workflows'

export const HELP_CATEGORIES: HelpCategory[] = [
  'Strategy Formulation',
  'Demand Submission',
  'Budget Reconciliation',
  'Approval Workflows',
]

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'strategy-weights',
    category: 'Strategy Formulation',
    title: 'Why must objective weights equal 100%?',
    summary:
      'BR-007 requires strategic objective weights to sum exactly to 100% before CTO submission.',
    body: 'Diriyah treats strategy as a governed portfolio envelope. Each Strategic Objective carries a weight that must total 100%. If the sum is incomplete or exceeds 100%, Save / Submit to CTO stays blocked. Adjust weights on the Strategy workspace until the live total shows 100%, then submit through Gate G-S1.',
    tags: ['BR-007', 'objectives', 'strategy', 'weights'],
  },
  {
    id: 'strategy-master-id',
    category: 'Strategy Formulation',
    title: 'What is a Master Trace ID?',
    summary:
      'Every initiative rides a spine ID such as TECH-2027-0001 from strategy through project registration.',
    body: 'When you create a New Record on the Pre-Initiation Cockpit, Diriyah opens a MasterTrace (for example TECH-2027-XXXX). Strategy, Demand, Budget, Procurement, and Project children all inherit this ID. Use Traceability Explorer to audit the full cascade. Never invent a parallel spreadsheet ID — the Master Trace is the system of record.',
    tags: ['master trace', 'TECH-', 'spine', 'traceability'],
  },
  {
    id: 'demand-br005-strategic',
    category: 'Demand Submission',
    title: 'Why can’t I save my demand without strategy alignment?',
    summary:
      'Strategic entry routes enforce BR-005: Strategy, Objectives, and KPI mapping are mandatory.',
    body: 'On a STRATEGIC route, Business Owners must link an approved Strategy and at least one Objective before Save Demand Case is enabled. This prevents untraceable demand from entering the funding pipeline. Complete Strategic Alignment on the Demand workspace, then save.',
    tags: ['BR-005', 'demand', 'alignment', 'strategic'],
  },
  {
    id: 'demand-adhoc-bypass',
    category: 'Demand Submission',
    title: 'How do I bypass the strategy gate?',
    summary:
      'Use the Ad-Hoc entry route — alignment is hidden, but a written justification becomes mandatory.',
    body: 'Genuine emergencies use EntryRoute = ADHOC (for example /demand/DEM-…?route=ADHOC). Diriyah hides Strategic Alignment so you are not forced to fabricate strategy links. Instead, Ad-Hoc Justification (≥ 20 characters) is required before save. Bypass is allowed — invisibility is not. The Master Trace still records ADHOC for audit.',
    tags: ['ad-hoc', 'ADHOC', 'BR-005', 'bypass', 'justification'],
  },
  {
    id: 'budget-locked-br008',
    category: 'Budget Reconciliation',
    title: 'Why is my budget submission locked?',
    summary:
      'After CTO Gate 2 approval, BR-008 locks the version and writes an immutable ApprovalTransaction hash.',
    body: 'Once a BudgetSubmission reaches APPROVED at gate G-B1, Diriyah sets is_locked = true and records a version_hash (SHA-256 of the approved snapshot) on ApprovalTransaction. Edits to lines or envelope figures are blocked to preserve the audit trail. To change scope, the CTO must Return for Revision, which opens a new governed cycle — not an in-place overwrite.',
    tags: ['BR-008', 'lock', 'budget', 'hash', 'G-B1'],
  },
  {
    id: 'budget-live-math',
    category: 'Budget Reconciliation',
    title: 'How do OPEX, CAPEX, and contingency calculate?',
    summary:
      'Budget Lines recalculate totals in the browser as you edit quantity, unit cost, and contingency %.',
    body: 'On /budget/{id}/lines, each row computes gross, contingency, tax, and SAR totals live. Metric cards roll up Total OPEX, Total CAPEX, and the envelope without a page reload. Classify each line correctly — mis-tagged CAPEX as OPEX distorts executive dashboards and SAP sync payloads.',
    tags: ['OPEX', 'CAPEX', 'contingency', 'lines', 'commercial'],
  },
  {
    id: 'approval-evidence',
    category: 'Approval Workflows',
    title: 'What evidence is required at a gate?',
    summary:
      'Upload supporting files to the Evidence Vault before Approve; checksums are stored on Attachment.',
    body: 'The ApprovalGate component captures evidence (PDF/Excel), comments, and optional BR-027 findings that require resolution. Virus scan posture is recorded (PASSED in the POC). Prefer attaching board papers or valuation sheets before you Approve so the decision is defensible.',
    tags: ['evidence', 'attachment', 'gate', 'approval'],
  },
  {
    id: 'approval-br027',
    category: 'Approval Workflows',
    title: 'Why did budget approval fail with BR-027?',
    summary: 'Unresolved comments / findings on the Master Trace block CTO budget approval.',
    body: 'BR-027 prevents funding decisions while OPEN, RESPONDED, or REOPENED findings remain on the spine. Resolve or close validation comments on the ApprovalGate thread, then retry Approve. This keeps contingent issues from being buried under an approved envelope.',
    tags: ['BR-027', 'findings', 'comments', 'budget gate'],
  },
  {
    id: 'approval-roles',
    category: 'Approval Workflows',
    title: 'Who can approve which gate?',
    summary:
      'G-S1 and G-B1 require CTO Office; G-PMO1 requires PMO. Other personas see Awaiting Approval.',
    body: 'Use the header persona switcher in the POC (or Entra ID groups in SSO mode). Business Owners edit demand; Commercial & Budgeting own budget lines; CTO decides strategy and budget gates; PMO activates project registration after procurement Delivered. If Approve is locked, switch to the awaiting role shown on the gate banner.',
    tags: ['RBAC', 'CTO', 'PMO', 'persona', 'G-S1', 'G-B1'],
  },
]
