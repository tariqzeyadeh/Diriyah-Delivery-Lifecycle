/**
 * SA-DIRIYAH business calendar: Sunday–Thursday are business days.
 * Friday (5) and Saturday (6) are weekends.
 */

export function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay()
  return day !== 5 && day !== 6
}

export function addBusinessDays(startIso: string, days: number): string {
  const d = new Date(startIso)
  let remaining = days
  const step = days >= 0 ? 1 : -1
  let abs = Math.abs(days)
  while (abs > 0) {
    d.setUTCDate(d.getUTCDate() + step)
    if (isBusinessDay(d)) abs -= 1
  }
  void remaining
  return d.toISOString()
}

export function businessDaysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (end < start) return -businessDaysBetween(endIso, startIso)
  let count = 0
  const cur = new Date(start)
  cur.setUTCDate(cur.getUTCDate() + 1)
  while (cur <= end) {
    if (isBusinessDay(cur)) count += 1
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return count
}

export function defaultRemediationDueUtc(fromIso = new Date().toISOString()): string {
  return addBusinessDays(fromIso, 5)
}
