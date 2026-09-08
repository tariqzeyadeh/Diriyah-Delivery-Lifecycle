import { RagStatus } from '@prisma/client'

/**
 * Parse KPI threshold strings from KpiDefinition (e.g. "90", "0.9", ">=85").
 * Returns a ratio in [0, 1] when possible.
 */
export function parseThresholdRatio(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null
  const cleaned = raw.trim().replace(/%/g, '').replace(/>=?/g, '').replace(/<=?/g, '')
  const n = Number(cleaned)
  if (Number.isNaN(n)) return null
  // Values like 90 mean 90%; 0.9 means 90%
  if (n > 1) return Math.min(1, n / 100)
  return Math.max(0, Math.min(1, n))
}

export function parseNumericValue(
  raw: string | number | { toString(): string } | null | undefined,
): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const n = Number(String(raw).replace(/,/g, '').trim())
  return Number.isNaN(n) ? null : n
}

/**
 * Attainment = actual / target (polarity-aware for LOWER_IS_BETTER).
 */
export function computeAttainment(
  actual: number,
  target: number,
  polarity?: string | null,
): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target === 0) return null
  const lowerIsBetter = (polarity || '').toUpperCase().includes('LOWER')
  if (lowerIsBetter) {
    // Better when actual is at or below target
    return Math.min(2, target / Math.max(actual, Number.EPSILON))
  }
  return Math.min(2, actual / target)
}

/**
 * Strict RAG from KpiDefinition thresholds (ratios of target attainment).
 * Defaults: GREEN ≥ 0.90, AMBER ≥ 0.70, else RED.
 */
export function ragFromAttainment(
  attainment: number | null,
  greenThreshold?: string | null,
  amberThreshold?: string | null,
): RagStatus {
  if (attainment === null || !Number.isFinite(attainment)) return RagStatus.NOT_RATED

  const green = parseThresholdRatio(greenThreshold) ?? 0.9
  const amber = parseThresholdRatio(amberThreshold) ?? 0.7

  if (attainment >= green) return RagStatus.GREEN
  if (attainment >= amber) return RagStatus.AMBER
  return RagStatus.RED
}

/** Worst-of / average composite RAG for a set of child scores. */
export function compositeRag(statuses: RagStatus[]): RagStatus {
  const rated = statuses.filter((s) => s !== RagStatus.NOT_RATED)
  if (rated.length === 0) return RagStatus.NOT_RATED
  if (rated.includes(RagStatus.RED)) return RagStatus.RED
  if (rated.includes(RagStatus.AMBER)) return RagStatus.AMBER
  return RagStatus.GREEN
}

export function average(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
