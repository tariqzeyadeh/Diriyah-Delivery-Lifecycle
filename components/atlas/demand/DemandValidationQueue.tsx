'use client'

import { useTranslations } from 'next-intl'
import { OfficialTag, RecordNotice, SummaryCard } from '@/components/atlas/records'
import {
  recordStatusTagTone,
  sentenceCaseLabel,
  urgencyTagTone,
} from '@/lib/atlas/record-label'
import type { DemandValidationQueueItem } from '@/src/actions/demand-validation'

function fmtSar(v: number | null): string {
  if (!v) return '—'
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(v)
}

export function DemandValidationQueue({ items }: { items: DemandValidationQueueItem[] }) {
  const t = useTranslations('demandValidation')

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-12 text-center">
        <p className="text-sm font-medium text-text-muted">{t('emptyQueue')}</p>
        <p className="mt-1 text-xs text-text-muted/70">{t('emptyQueueHint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">{t('queueCount', { count: items.length })}</p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.demand_id} className="space-y-2">
            <SummaryCard
              eyebrow={item.demand_id}
              title={item.demand_title}
              tag={
                <span className="flex flex-wrap gap-1">
                  <OfficialTag tone={recordStatusTagTone(item.record_status)}>
                    {sentenceCaseLabel(item.record_status)}
                  </OfficialTag>
                  {item.urgency ? (
                    <OfficialTag tone={urgencyTagTone(item.urgency)}>
                      {sentenceCaseLabel(item.urgency)}
                    </OfficialTag>
                  ) : null}
                </span>
              }
              items={[
                { label: t('completeness'), value: item.completeness_score_pct != null ? `${item.completeness_score_pct}%` : '—' },
                { label: sentenceCaseLabel(item.entry_route), value: fmtSar(item.indicative_one_time_cost_sar) },
              ]}
              action={{
                href: `/demand/${encodeURIComponent(item.demand_id)}/validate`,
                label: t('openValidation'),
              }}
            />
            {item.budget_validation_decision ? (
              <RecordNotice tone="warning" title={`${t('previousDecision')}: ${item.budget_validation_decision}`} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
