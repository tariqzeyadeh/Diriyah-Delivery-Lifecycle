import { getTranslations } from 'next-intl/server'
import { getDemandValidationQueue } from '@/src/actions/demand-validation'
import { DemandValidationQueue } from '@/components/atlas/demand/DemandValidationQueue'
import { PageIntro } from '@/components/atlas/records'

export default async function DemandValidatePage() {
  const t = await getTranslations('demandValidation')
  const queue = await getDemandValidationQueue()

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={`PI-06 · ${t('module')}`}
        title={t('queueTitle')}
        description={t('queueDesc')}
      />

      <DemandValidationQueue items={queue} />
    </div>
  )
}
