/** Brand-deck photography mapped to each Diriyah workspace route. */
export const PAGE_BACKGROUNDS: Record<string, string> = {
  '/': '/brand/home.jpg',
  '/home': '/brand/home.jpg',
  '/strategy': '/brand/strategy.jpg',
  '/demand': '/brand/demand.jpg',
  '/budget': '/brand/budget.png',
  '/procurement': '/brand/procurement.jpg',
  '/pmo': '/brand/projects.jpg',
  '/projects': '/brand/projects.jpg',
  '/performance': '/brand/performance.jpg',
  '/value-realization': '/brand/performance.jpg',
  '/reports': '/brand/reports.jpg',
  '/traceability': '/brand/reports.jpg',
  '/admin': '/brand/administration.jpg',
  '/administration': '/brand/administration.jpg',
}

export function backgroundForPath(pathname: string): string {
  const path = pathname.replace(/^\/(en|ar)(?=\/|$)/, '') || '/'
  if (PAGE_BACKGROUNDS[path]) return PAGE_BACKGROUNDS[path]
  const match = Object.keys(PAGE_BACKGROUNDS).find(
    (key) => key !== '/' && (path === key || path.startsWith(`${key}/`)),
  )
  return match ? PAGE_BACKGROUNDS[match] : PAGE_BACKGROUNDS['/']
}
