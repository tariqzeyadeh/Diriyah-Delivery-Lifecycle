import { getTranslations } from 'next-intl/server'
import { listDemandsForBudgetPicker } from '@/src/actions/portfolio'
import { CreateBudgetForm } from '@/components/atlas/budget/CreateBudgetForm'
import { PageIntro } from '@/components/atlas/records'
import { Link } from '@/src/i18n/navigation'

export default async function NewBudgetPage() {
  const t = await getTranslations('budgetCreate')
  const tc = await getTranslations('common')
  const demands = await listDemandsForBudgetPicker()

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={`PI-05 · ${tc('module')}`}
        title={t('pageTitle')}
        description={t('pageDesc')}
      />

      {demands.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-6 py-12 text-center">
          <p className="text-sm text-text-muted">{t('noDemands')}</p>
          <Link
            href="/demand"
            className="mt-3 inline-block text-sm font-semibold text-diriyah-primary no-underline hover:underline"
          >
            {t('openDemandRegister')}
          </Link>
        </div>
      ) : (
        <CreateBudgetForm demands={demands} />
      )}
    </div>
  )
}
