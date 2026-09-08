/**
 * G-17: Mandatory document-pack rules per stage-gate.
 *
 * Each stage has a list of `document_type` values that MUST be attached
 * (via the Attachment table linked through master_trace_id) before the
 * entity can be submitted or approved.
 *
 * Rules are advisory in PI-00–PI-04 and blocking from PI-05 onwards.
 */

/** document_type values that are required per stage */
export type DocPackRule = {
  document_type: string
  label: string
  required_at: 'SUBMIT' | 'GATE'   // SUBMIT = required before submission; GATE = required before gate approval
  blocking: boolean                  // false = advisory warning only
}

/** Rules by entity type */
export const DOCUMENT_PACK_RULES: Record<string, DocPackRule[]> = {
  STRATEGY: [
    { document_type: 'MANDATE_LETTER',         label: 'Mandate Letter',              required_at: 'SUBMIT', blocking: true },
    { document_type: 'SWOT_ANALYSIS',          label: 'SWOT Analysis',               required_at: 'SUBMIT', blocking: false },
    { document_type: 'STRATEGIC_FRAMEWORK',    label: 'Strategic Framework Deck',    required_at: 'GATE',   blocking: true },
  ],
  DEMAND: [
    { document_type: 'BUSINESS_CASE',          label: 'Business Case',               required_at: 'SUBMIT', blocking: true },
    { document_type: 'COST_ESTIMATE',          label: 'Cost Estimate',               required_at: 'SUBMIT', blocking: false },
    { document_type: 'FEASIBILITY_STUDY',      label: 'Feasibility Study',           required_at: 'GATE',   blocking: true },
  ],
  BUDGET: [
    { document_type: 'BUDGET_TEMPLATE',        label: 'Budget Template (CON-018)',   required_at: 'SUBMIT', blocking: true },
    { document_type: 'SUPPORTING_SCHEDULES',   label: 'Supporting Schedules',        required_at: 'SUBMIT', blocking: false },
    { document_type: 'CTO_ENDORSEMENT',        label: 'CTO Endorsement Note',        required_at: 'GATE',   blocking: true },
  ],
  PROCUREMENT: [
    { document_type: 'PROCUREMENT_PLAN',       label: 'Procurement Plan',            required_at: 'SUBMIT', blocking: true },
    { document_type: 'TOR_OR_TOR_DRAFT',       label: 'Terms of Reference / ToR Draft', required_at: 'GATE', blocking: false },
    { document_type: 'VENDOR_SHORTLIST',       label: 'Vendor Shortlist',            required_at: 'GATE',   blocking: false },
  ],
}

/**
 * Check whether mandatory documents are present for a given entity submission.
 * Returns `null` if all blocking documents are satisfied, or an error message.
 *
 * @param entityType  - 'STRATEGY' | 'DEMAND' | 'BUDGET' | 'PROCUREMENT'
 * @param checkType   - 'SUBMIT' or 'GATE'
 * @param presentTypes - array of document_type strings already attached
 */
export function checkDocumentPack(
  entityType: keyof typeof DOCUMENT_PACK_RULES,
  checkType: 'SUBMIT' | 'GATE',
  presentTypes: string[],
): string | null {
  const rules = DOCUMENT_PACK_RULES[entityType] ?? []
  const missing = rules.filter(
    (r) => r.required_at === checkType && r.blocking && !presentTypes.includes(r.document_type),
  )
  if (missing.length === 0) return null
  const list = missing.map((r) => `• ${r.label} (${r.document_type})`).join('\n')
  return `BR-017: Missing mandatory documents for ${checkType.toLowerCase()}:\n${list}`
}

/**
 * Advisory-only missing documents (non-blocking).
 * Returns labels of non-blocking documents that are not yet attached.
 */
export function getAdvisoryMissingDocs(
  entityType: keyof typeof DOCUMENT_PACK_RULES,
  checkType: 'SUBMIT' | 'GATE',
  presentTypes: string[],
): string[] {
  const rules = DOCUMENT_PACK_RULES[entityType] ?? []
  return rules
    .filter((r) => r.required_at === checkType && !r.blocking && !presentTypes.includes(r.document_type))
    .map((r) => r.label)
}
