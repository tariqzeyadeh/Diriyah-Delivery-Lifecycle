import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { formatSar } from '@/lib/atlas/dashboard-data'

export type BenefitScorecardRow = {
  realization_id: string
  project_id: string
  project_name: string
  objective_id: string
  objective_name: string
  benefit_name: string
  benefit_unit: string | null
  baseline_value: number
  target_value: number
  realized_value: number
  measurement_date: string
  horizon_months: number
  /** (realized - baseline) / (target - baseline) * 100 */
  roi_progress_pct: number
  /** realized - target (negative = under-delivery) */
  variance: number
  variance_pct: number
}

export type ValueRealizationDashboard = {
  totals: {
    plannedImpact: number
    realizedImpact: number
    variance: number
    avgRoiProgressPct: number
    measurementCount: number
  }
  rows: BenefitScorecardRow[]
}

function n(v: Prisma.Decimal | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  return typeof v === 'number' ? v : Number(v)
}

function roiProgress(baseline: number, target: number, realized: number): number {
  const denom = target - baseline
  if (Math.abs(denom) < 1e-9) {
    return realized >= target ? 100 : 0
  }
  return Math.round(((realized - baseline) / denom) * 1000) / 10
}

/** Post-implementation benefit tracking for 12–24 month strategic ROI. */
export async function getValueRealizationDashboard(): Promise<ValueRealizationDashboard> {
  const records = await prisma.benefitRealization.findMany({
    where: { is_active: true },
    include: {
      project: { select: { project_id: true, project_name: true } },
      objective: { select: { objective_id: true, objective_name: true } },
    },
    orderBy: { measurement_date: 'desc' },
    take: 100,
  })

  const rows: BenefitScorecardRow[] = records.map((r) => {
    const baseline = n(r.baseline_value)
    const target = n(r.target_value)
    const realized = n(r.realized_value)
    const variance = realized - target
    const variancePct =
      Math.abs(target) < 1e-9 ? 0 : Math.round((variance / Math.abs(target)) * 1000) / 10

    return {
      realization_id: r.realization_id,
      project_id: r.project_id,
      project_name: r.project.project_name,
      objective_id: r.objective_id,
      objective_name: r.objective.objective_name,
      benefit_name: r.benefit_name,
      benefit_unit: r.benefit_unit,
      baseline_value: baseline,
      target_value: target,
      realized_value: realized,
      measurement_date: r.measurement_date.toISOString().slice(0, 10),
      horizon_months: r.horizon_months,
      roi_progress_pct: roiProgress(baseline, target, realized),
      variance,
      variance_pct: variancePct,
    }
  })

  const plannedImpact = rows.reduce((s, r) => s + (r.target_value - r.baseline_value), 0)
  const realizedImpact = rows.reduce((s, r) => s + (r.realized_value - r.baseline_value), 0)
  const avgRoiProgressPct =
    rows.length === 0
      ? 0
      : Math.round(
          (rows.reduce((s, r) => s + r.roi_progress_pct, 0) / rows.length) * 10,
        ) / 10

  return {
    totals: {
      plannedImpact,
      realizedImpact,
      variance: realizedImpact - plannedImpact,
      avgRoiProgressPct,
      measurementCount: rows.length,
    },
    rows,
  }
}

export { formatSar }
