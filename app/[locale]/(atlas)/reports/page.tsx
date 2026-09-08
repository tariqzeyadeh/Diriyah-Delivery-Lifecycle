import { getTranslations } from 'next-intl/server'
import { PageIntro, SummaryCard } from '@/components/atlas/records'

export default async function ReportsPage() {
  const t = await getTranslations('reportsIndex')
  const tc = await getTranslations('common')

  return (
    <div className="space-y-6">
      <PageIntro eyebrow={tc('module')} title={t('pageTitle')} description={t('pageDesc')} />

      <ul className="grid gap-3 md:grid-cols-2">
        <li>
          <SummaryCard
            title={t('onePagerTitle')}
            description={t('onePagerDesc')}
            action={{ href: '/reports/one-pager', label: t('openOnePager') }}
          />
        </li>
        <li>
          <SummaryCard
            title={t('valueTitle')}
            description={t('valueDesc')}
            action={{ href: '/value-realization', label: t('openValue') }}
          />
        </li>
      </ul>
    </div>
  )
}
