import { redirect } from 'next/navigation'
import { routing } from '@/src/i18n/routing'

/** Bare `/` → default locale cockpit (middleware + App Router fallback). */
export default function RootPage() {
  redirect(`/${routing.defaultLocale}/home`)
}
