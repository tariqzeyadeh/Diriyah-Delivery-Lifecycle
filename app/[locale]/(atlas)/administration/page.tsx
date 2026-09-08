import { getLocale } from 'next-intl/server'
import { redirect } from '@/src/i18n/navigation'

/** Legacy route — Admin panel lives at /admin */
export default async function AdministrationRedirect() {
  const locale = await getLocale()
  redirect({ href: '/admin', locale })
}
