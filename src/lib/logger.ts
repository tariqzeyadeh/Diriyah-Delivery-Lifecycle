import pino from 'pino'
import * as Sentry from '@sentry/nextjs'

export type AuditActionType =
  | 'APPROVE_STRATEGY_GATE'
  | 'APPROVE_BUDGET_GATE'
  | 'INITIATE_PORTFOLIO'
  | 'PROCUREMENT_STAGE_MOVE'
  | 'ACTIVATE_PROJECT'
  | 'CREATE_ATTACHMENT'
  | 'CREATE_COMMENT'
  | 'SUBMIT_GATE_DECISION'
  | 'SAP_INTEGRATION'
  | 'STORAGE_PRESIGN'
  | 'UAT_FEEDBACK'
  | 'CRON_SLA_MONITOR'
  | 'CRON_HEALTH_ROLLUP'
  | 'EXPORT_TRACEABILITY_XLSX'
  | 'EXPORT_APPROVAL_PDF'
  | 'SYSTEM'

export type AuditLogFields = {
  action_type: AuditActionType | string
  master_trace_id?: string | null
  active_user_id?: string | null
  entity_type?: string
  entity_id?: string
  outcome?: 'success' | 'failure' | 'denied'
  error?: string
  [key: string]: unknown
}

/**
 * Structured JSON logger for Splunk / Datadog / CloudWatch ingestion.
 * Always emit JSON (no pretty transport) so Server Actions / Edge stay reliable.
 * Every audit event should include master_trace_id, active_user_id, action_type.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: {
    service: 'atlas',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label }
    },
  },
})

export function auditLog(fields: AuditLogFields): void {
  const { action_type, master_trace_id, active_user_id, outcome, ...rest } = fields
  const payload = {
    log_type: 'audit',
    master_trace_id: master_trace_id ?? null,
    active_user_id: active_user_id ?? null,
    action_type,
    outcome,
    ...rest,
  }

  if (outcome === 'failure') {
    logger.error(payload, `audit:${action_type}`)
  } else {
    logger.info(payload, `audit:${action_type}`)
  }
}

export function captureException(
  err: unknown,
  context?: AuditLogFields & Record<string, unknown>,
): void {
  const error = err instanceof Error ? err : new Error(String(err))
  const {
    action_type = 'SYSTEM',
    master_trace_id,
    active_user_id,
    ...rest
  } = context ?? {}

  logger.error(
    {
      log_type: 'exception',
      err: { message: error.message, stack: error.stack, name: error.name },
      master_trace_id: master_trace_id ?? null,
      active_user_id: active_user_id ?? null,
      action_type,
      ...rest,
    },
    error.message,
  )

  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.withScope((scope) => {
      if (master_trace_id) scope.setTag('master_trace_id', String(master_trace_id))
      if (active_user_id) scope.setUser({ id: String(active_user_id) })
      if (action_type) scope.setTag('action_type', String(action_type))
      Sentry.captureException(error)
    })
  }
}
