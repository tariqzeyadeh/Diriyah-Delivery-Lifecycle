'use client'

import { useTranslations } from 'next-intl'
import { REVIEW_ATLAS_ROLE, REVIEW_LABEL, type DemandReviewType } from '@/lib/atlas/demand-reviews'
import { OfficialTag, SummaryCard } from '@/components/atlas/records'
import { sentenceCaseLabel } from '@/lib/atlas/record-label'

export type DemandReviewQueueRow = {
  demand_id: string
  demand_title: string
  master_trace_id: string
  submitted_by: string | null
  submitted_at: string | null
  entry_route: string
  review_type: DemandReviewType
  gate_code: string
}

export function DemandReviewQueue({ items }: { items: DemandReviewQueueRow[] }) {
  const t = useTranslations('demandReviews')

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
          <li key={`${item.demand_id}-${item.review_type}`}>
            <SummaryCard
              eyebrow={item.demand_id}
              title={item.demand_title}
              tag={
                <span className="flex flex-wrap gap-1">
                  <OfficialTag tone="info">{item.gate_code}</OfficialTag>
                  <OfficialTag tone="warning">{REVIEW_LABEL[item.review_type]}</OfficialTag>
                </span>
              }
              items={[
                { label: t('submittedBy'), value: item.submitted_by ?? '—' },
                {
                  label: t('awaitingRole', { role: REVIEW_ATLAS_ROLE[item.review_type] }),
                  value: sentenceCaseLabel(item.entry_route),
                },
              ]}
              action={{
                href: `/demand/${encodeURIComponent(item.demand_id)}/review/${item.review_type}`,
                label: t('openReview'),
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
