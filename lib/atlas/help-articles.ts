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
    body: 'When you create a New Record, Diriyah opens a MasterTrace (for example TECH-2027-XXXX) plus either a Strategy or a Demand. If you later link an approved strategy on the demand Identity tab, the demand is re-parented onto that strategy’s Master Trace so Strategy → Demand → Budget stay one cascade. Use Traceability Explorer to audit the spine. Never invent a parallel spreadsheet ID — the Master Trace is the system of record.',
    tags: ['master trace', 'TECH-', 'spine', 'traceability'],
  },
  {
    id: 'demand-br005-strategic',
    category: 'Demand Submission',
    title: 'Do I have to link a strategy on my demand?',
    summary:
      'Linked strategy is optional. Empty selection is a standalone ad-hoc demand (BR-005).',
    body: 'On the Demand Identity tab, Linked strategy may be left empty. That demand stays on its own Master Trace as ADHOC. If you pick an approved strategy (after G-S1), the demand is attached to that strategy’s Master Trace and treated as STRATEGIC. G-S1 does not create demand or budget for you — create a Demand from New Record when you are ready.',
    tags: ['BR-005', 'demand', 'alignment', 'strategic'],
  },
  {
    id: 'demand-adhoc-bypass',
    category: 'Demand Submission',
    title: 'How do I raise a demand without a strategy?',
    summary:
      'New Record → Demand, then leave Linked strategy empty on Identity. A written ad-hoc justification is still required.',
    body: 'Use + New Record and choose Demand (or the Demand list New Record button). Leave Linked strategy empty for a standalone ad-hoc case. Diriyah records EntryRoute = ADHOC. Ad-Hoc Justification (≥ 20 characters) is required before save. Bypass is allowed — invisibility is not. Budget is created when you submit the demand, not at G-S1.',
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
