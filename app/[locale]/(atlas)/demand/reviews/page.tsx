import { getTranslations } from 'next-intl/server'
import { getDemandReviewQueue } from '@/src/actions/demand-reviews'
import { DemandReviewQueue } from '@/components/atlas/demand/DemandReviewQueue'
import { PageIntro } from '@/components/atlas/records'

export default async function DemandReviewsPage() {
  const t = await getTranslations('demandReviews')
  const queue = await getDemandReviewQueue()

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={`PI-05 · ${t('module')}`}
        title={t('queueTitle')}
        description={t('queueDesc')}
      />

      <DemandReviewQueue
        items={queue.map((item) => ({
          demand_id: item.demand_id,
          demand_title: item.demand_title,
          master_trace_id: item.master_trace_id,
          submitted_by: item.submitted_by,
          submitted_at: item.submitted_at?.toISOString() ?? null,
          entry_route: item.entry_route,
          review_type: item.review_type,
          gate_code: item.gate_code,
        }))}
      />
    </div>
  )
}
