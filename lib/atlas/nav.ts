import {
  LayoutDashboard,
  Compass,
  Inbox,
  Wallet,
  ShoppingCart,
  FolderKanban,
  Gauge,
  FileBarChart2,
  Settings,
  CircleHelp,
  TrendingUp,
  GitMerge,
  type LucideIcon,
} from 'lucide-react'

export interface AtlasNavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const ATLAS_NAV: AtlasNavItem[] = [
  { href: '/home', label: 'Home', icon: LayoutDashboard },
  { href: '/strategy', label: 'Strategy', icon: Compass },
  { href: '/demand', label: 'Demand', icon: Inbox },
  { href: '/demand/reviews', label: 'Demand Reviews', icon: GitMerge },
  { href: '/demand/validate', label: 'Demand Validation', icon: GitMerge },
  { href: '/budget', label: 'Budget', icon: Wallet },
  { href: '/procurement', label: 'Procurement', icon: ShoppingCart },
  { href: '/pmo', label: 'PMO', icon: FolderKanban },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/performance', label: 'Performance', icon: Gauge },
  { href: '/value-realization', label: 'Value Realization', icon: TrendingUp },
  { href: '/reports', label: 'Reports', icon: FileBarChart2 },
  { href: '/gates/g-s1', label: 'G-S1 Strategy Gate', icon: GitMerge },
  { href: '/gates/g-b1', label: 'G-B1 Budget Gate', icon: GitMerge },
  { href: '/gates/g-pmo1', label: 'G-PMO1 PMO Gate', icon: GitMerge },
  { href: '/help', label: 'Help', icon: CircleHelp },
  { href: '/admin', label: 'Administration', icon: Settings },
]

export function isAtlasNavActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/^\/(en|ar)(?=\/|$)/, '') || '/'
  if (href === '/home')
    return path === '/' || path === '/home' || path.startsWith('/home/')
  if (href === '/demand')
    return (
      path === '/demand' ||
      (path.startsWith('/demand/') &&
        !path.startsWith('/demand/reviews') &&
        !path.startsWith('/demand/validate') &&
        !path.includes('/review/') &&
        !path.endsWith('/validate'))
    )
  if (href === '/demand/reviews')
    return path === '/demand/reviews' || path.includes('/review/')
  if (href === '/demand/validate')
    return (
      path === '/demand/validate' || path.endsWith('/validate')
    )
  if (href === '/reports/one-pager')
    return path === href || path.startsWith('/reports/one-pager')
  return path === href || path.startsWith(`${href}/`)
}
