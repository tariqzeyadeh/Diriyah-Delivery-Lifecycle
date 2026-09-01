import type { FieldError, ProblemJson, TdlErrorCode } from './types'

let corrSeq = 0

export function newCorrelationId(): string {
  corrSeq += 1
  return `corr-${Date.now()}-${corrSeq}`
}

export function problem(
  status: number,
  code: TdlErrorCode | string,
  message: string,
  field_errors: FieldError[] = [],
  correlation_id = newCorrelationId(),
): ProblemJson {
  return {
    type: `urn:tdl:problem:${code}`,
    title: code,
    status,
    code,
    message,
    correlation_id,
    field_errors,
  }
}

export const Problems = {
  staleVersion: (correlation_id?: string) =>
    problem(409, 'TDL-CON-001', '409 TDL-CON-001', [], correlation_id ?? newCorrelationId()),
  idempotencyConflict: (correlation_id?: string) =>
    problem(409, 'TDL-IDEM-001', '409 TDL-IDEM-001', [], correlation_id ?? newCorrelationId()),
  sod: (correlation_id?: string) =>
    problem(403, 'TDL-SOD-001', '403 TDL-SOD-001', [], correlation_id ?? newCorrelationId()),
  uatReconciliation: (correlation_id?: string) =>
    problem(422, 'TDL-VAL-002', '422 TDL-VAL-002', [
      { field: 'executedTests', message: 'Executed Tests MUST equal Passed + Failed' },
    ], correlation_id ?? newCorrelationId()),
  evidenceQuarantined: (correlation_id?: string) =>
    problem(422, 'TDL-EVD-001', '422 TDL-EVD-001', [
      { field: 'evidence', message: 'File quarantined by malware scan' },
    ], correlation_id ?? newCorrelationId()),
  deployWindow: (correlation_id?: string) =>
    problem(409, 'TDL-WIN-001', '409 TDL-WIN-001', [], correlation_id ?? newCorrelationId()),
  deploymentLeadRequired: (correlation_id?: string) =>
    problem(403, 'TDL-ROLE-001', 'Actor must have Deployment Lead role', [], correlation_id ?? newCorrelationId()),
}

export class TdlApiError extends Error {
  problem: ProblemJson
  constructor(p: ProblemJson) {
    super(p.message)
    this.name = 'TdlApiError'
    this.problem = p
  }
}
