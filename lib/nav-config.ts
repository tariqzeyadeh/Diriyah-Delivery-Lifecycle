import {
  LayoutDashboard,
  GitBranch,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  href: string
  labelAr: string
  labelEn: string
  icon: LucideIcon
  matchPrefixes?: string[]
}

export interface NavGroup {
  id: string
  labelAr: string
  labelEn: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'main',
    labelAr: 'الرئيسي',
    labelEn: 'Main',
    items: [
      { href: '/', labelAr: 'لوحة التحكم', labelEn: 'Dashboard', icon: LayoutDashboard },
      {
        href: '/lifecycle',
        labelAr: 'دورة الحياة',
        labelEn: 'Lifecycle',
        icon: GitBranch,
        matchPrefixes: ['/lifecycle'],
      },
    ],
  },
]

export const BREADCRUMB_LABELS: Record<string, string> = {
  lifecycle: 'دورة الحياة',
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/'
  if (pathname === item.href) return true
  if (item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return true
  }
  return false
}
