'use server'

import { randomInt } from 'crypto'
import { EntryRoute } from '@prisma/client'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { CACHE_TAGS } from '@/src/lib/cache-tags'
import { auditLog, captureException } from '@/src/lib/logger'

export type InitiatePortfolioPayload = {
  entry_route: EntryRoute
  /** Actor id / email for SHR created_by. Defaults to system. */
  created_by?: string
  /** Optional working title for the initial Strategy or Demand child. */
  title?: string
}

export type InitiatePortfolioResult =
  | {
      ok: true
      master_trace_id: string
      entry_route: EntryRoute
      child_id: string
      workspace: 'strategy' | 'demand'
    }
  | {
      ok: false
      error: string
    }

function yearToken(d = new Date()): number {
  return d.getFullYear()
}

/** Master spine id: TECH-YYYY-XXXX */
function generateMasterTraceId(): string {
  const suffix = String(randomInt(1000, 10000))
  return `TECH-${yearToken()}-${suffix}`
}

function generateChildId(prefix: 'STR' | 'DEM'): string {
  const suffix = String(randomInt(1000, 10000))
  return `${prefix}-${yearToken()}-${suffix}`
}

/**
 * Atomically opens a MasterTrace and its first child record.
 * STRATEGIC → Strategy (DRAFT). ADHOC → Demand (DRAFT).
 * Returns master_trace_id for workspace redirect.
 */
export async function initiatePortfolioRecord(
  payload: InitiatePortfolioPayload,
): Promise<InitiatePortfolioResult> {
  const entry_route = payload.entry_route
  if (entry_route !== EntryRoute.STRATEGIC && entry_route !== EntryRoute.ADHOC) {
    return { ok: false, error: 'Invalid entry_route. Expected STRATEGIC or ADHOC.' }
  }

  const created_by = (payload.created_by?.trim() || 'system').slice(0, 128)
  const workingTitle = (
    payload.title?.trim() ||
    (entry_route === EntryRoute.STRATEGIC ? 'New Strategic Initiative' : 'New Ad-hoc Demand')
  ).slice(0, 255)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const master_trace_id = generateMasterTraceId()

      await tx.masterTrace.create({
        data: {
          master_trace_id,
          entry_route,
          created_by,
        },
      })

      if (entry_route === EntryRoute.STRATEGIC) {
        const strategy_id = generateChildId('STR')
        await tx.strategy.create({
          data: {
            strategy_id,
            master_trace_id,
            strategy_title: workingTitle,
            entity_type: 'STRATEGY',
            entry_route,
            record_status: 'DRAFT',
            is_locked: false,
            created_by,
            version_number: 1,
          },
        })
        return {
          master_trace_id,
          entry_route,
          child_id: strategy_id,
          workspace: 'strategy' as const,
        }
      }

      const demand_id = generateChildId('DEM')
      await tx.demand.create({
        data: {
          demand_id,
          master_trace_id,
          demand_title: workingTitle,
          entity_type: 'DEMAND',
          entry_route,
          record_status: 'DRAFT',
          is_locked: false,
          created_by,
          version_number: 1,
        },
      })
      return {
        master_trace_id,
        entry_route,
        child_id: demand_id,
        workspace: 'demand' as const,
      }
    })

    revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
    auditLog({
      action_type: 'INITIATE_PORTFOLIO',
      master_trace_id: result.master_trace_id,
      active_user_id: created_by,
      entity_type: result.workspace === 'strategy' ? 'STRATEGY' : 'DEMAND',
      entity_id: result.child_id,
      outcome: 'success',
      entry_route,
    })

    return { ok: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to initiate portfolio record'
    captureException(err, {
      action_type: 'INITIATE_PORTFOLIO',
      active_user_id: created_by,
      outcome: 'failure',
      error: message,
      entry_route,
    })
    return { ok: false, error: message }
  }
}


