/** Next.js data-cache tags for executive dashboards */
export const CACHE_TAGS = {
  PORTFOLIO_METRICS: 'portfolio-metrics',
  STRATEGY_ROLLUP: 'strategy-rollup',
} as const

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS]
