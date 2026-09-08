import { NextResponse } from 'next/server'
import { RagStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertCronAuthorized } from '@/src/lib/cron-auth'
import {
  average,
  compositeRag,
  computeAttainment,
  parseNumericValue,
  ragFromAttainment,
} from '@/src/lib/kpi-health'
import { auditLog, captureException } from '@/src/lib/logger'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/src/lib/cache-tags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * CRON — nightly KPI / Stage Health roll-up across active Master Traces.
 * For each StrategicObjective, averages latest KPI actual vs target and sets rag_status.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Schedule: midnight UTC (see vercel.json)
 */
export async function GET(req: Request) {
  const denied = assertCronAuthorized(req)
  if (denied) return denied

  const now = new Date()

  try {
    const traces = await prisma.masterTrace.findMany({
      where: { is_active: true },
      select: {
        master_trace_id: true,
        strategies: {
          where: { is_active: true },
          select: {
            strategy_id: true,
            objectives: {
              where: { is_active: true },
              select: {
                objective_id: true,
                kpis: {
                  where: { is_active: true },
                  select: {
                    kpi_id: true,
                    performance_polarity: true,
                    green_threshold: true,
                    amber_threshold: true,
                    red_threshold: true,
                    target_profile: true,
                    stretch_target: true,
                    updates: {
                      orderBy: [{ period_end_date: 'desc' }, { created_at: 'desc' }],
                      take: 1,
                      select: {
                        actual_value: true,
                        period_target: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        demands: {
          where: { is_active: true },
          select: { demand_id: true, strategy_id: true },
        },
      },
    })

    type ObjUpdate = {
      objective_id: string
      rag_status: RagStatus
      kpi_performance_score: number | null
      objective_rag: string
      performance_as_of_date: Date
    }
    type KpiUpdate = { kpi_id: string; rag_status: RagStatus }
    type StrategyUpdate = { strategy_id: string; rag_status: RagStatus }
    type DemandUpdate = { demand_id: string; rag_status: RagStatus }

    const objectiveUpdates: ObjUpdate[] = []
    const kpiUpdates: KpiUpdate[] = []
    const strategyUpdates: StrategyUpdate[] = []
    const demandUpdates: DemandUpdate[] = []

    let objectivesScored = 0
    let kpisScored = 0

    for (const trace of traces) {
      const strategyRags: RagStatus[] = []

      for (const strategy of trace.strategies) {
        const objectiveRags: RagStatus[] = []

        for (const objective of strategy.objectives) {
          const attainments: number[] = []
          const kpiRags: RagStatus[] = []

          for (const kpi of objective.kpis) {
            const latest = kpi.updates[0]
            const actual = parseNumericValue(latest?.actual_value)
            const target =
              parseNumericValue(latest?.period_target) ??
              parseNumericValue(kpi.target_profile) ??
              parseNumericValue(kpi.stretch_target)

            if (actual === null || target === null) {
              kpiUpdates.push({ kpi_id: kpi.kpi_id, rag_status: RagStatus.NOT_RATED })
              kpiRags.push(RagStatus.NOT_RATED)
              continue
            }

            const attainment = computeAttainment(actual, target, kpi.performance_polarity)
            const rag = ragFromAttainment(
              attainment,
              kpi.green_threshold,
              kpi.amber_threshold ?? kpi.red_threshold,
            )

            if (attainment !== null) attainments.push(Math.min(1, attainment))
            kpiUpdates.push({ kpi_id: kpi.kpi_id, rag_status: rag })
            kpiRags.push(rag)
            kpisScored += 1
          }

          const avg = average(attainments)
          const objRag = avg !== null ? ragFromAttainment(avg, '0.9', '0.7') : compositeRag(kpiRags)

          objectiveUpdates.push({
            objective_id: objective.objective_id,
            rag_status: objRag,
            kpi_performance_score: avg !== null ? Math.round(avg * 10000) / 100 : null,
            objective_rag: objRag,
            performance_as_of_date: now,
          })
          objectiveRags.push(objRag)
          objectivesScored += 1
        }

        const stratRag = compositeRag(objectiveRags)
        strategyUpdates.push({ strategy_id: strategy.strategy_id, rag_status: stratRag })
        strategyRags.push(stratRag)

        // Demands linked to this strategy inherit strategy composite RAG (stage health signal)
        for (const demand of trace.demands) {
          if (demand.strategy_id === strategy.strategy_id) {
            demandUpdates.push({ demand_id: demand.demand_id, rag_status: stratRag })
          }
        }
      }

      // Ad-hoc demands without strategy stay NOT_RATED unless already updated
      for (const demand of trace.demands) {
        if (!demand.strategy_id && !demandUpdates.some((d) => d.demand_id === demand.demand_id)) {
          demandUpdates.push({ demand_id: demand.demand_id, rag_status: RagStatus.NOT_RATED })
        }
      }

      void strategyRags
    }

    await prisma.$transaction(async (tx) => {
      for (const u of kpiUpdates) {
        await tx.kpiDefinition.update({
          where: { kpi_id: u.kpi_id },
          data: { rag_status: u.rag_status, modified_by: 'cron.health-rollup' },
        })
      }
      for (const u of objectiveUpdates) {
        await tx.strategicObjective.update({
          where: { objective_id: u.objective_id },
          data: {
            rag_status: u.rag_status,
            objective_rag: u.objective_rag,
            kpi_performance_score: u.kpi_performance_score,
            performance_as_of_date: u.performance_as_of_date,
            modified_by: 'cron.health-rollup',
          },
        })
      }
      for (const u of strategyUpdates) {
        await tx.strategy.update({
          where: { strategy_id: u.strategy_id },
          data: { rag_status: u.rag_status, modified_by: 'cron.health-rollup' },
        })
      }
      for (const u of demandUpdates) {
        await tx.demand.update({
          where: { demand_id: u.demand_id },
          data: { rag_status: u.rag_status, modified_by: 'cron.health-rollup' },
        })
      }
    })

    try {
      revalidateTag(CACHE_TAGS.PORTFOLIO_METRICS, 'max')
      revalidateTag(CACHE_TAGS.STRATEGY_ROLLUP, 'max')
    } catch {
      // Cache APIs may be unavailable in some runtimes
    }

    auditLog({
      action_type: 'CRON_HEALTH_ROLLUP',
      active_user_id: 'cron',
      outcome: 'success',
      master_traces: traces.length,
      objectives_scored: objectivesScored,
      kpis_scored: kpisScored,
    })

    return NextResponse.json({
      ok: true,
      ran_at: now.toISOString(),
      master_traces_processed: traces.length,
      objectives_updated: objectiveUpdates.length,
      kpis_updated: kpiUpdates.length,
      strategies_updated: strategyUpdates.length,
      demands_updated: demandUpdates.length,
      objectives_scored: objectivesScored,
      kpis_scored: kpisScored,
    })
  } catch (err) {
    captureException(err, {
      action_type: 'CRON_HEALTH_ROLLUP',
      active_user_id: 'cron',
      outcome: 'failure',
    })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Health rollup failed' },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  return GET(req)
}
