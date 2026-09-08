import { getLocale } from 'next-intl/server'
import { redirect } from '@/src/i18n/navigation'

/** Root Home redirects to the Pre-Initiation Cockpit. */
export default async function RootHomeRedirect() {
  const locale = await getLocale()
  redirect({ href: '/home', locale })
}
