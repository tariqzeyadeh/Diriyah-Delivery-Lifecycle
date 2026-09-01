const RIYADH = 'Asia/Riyadh'

let mockServerNow: string | null = null

export function toUtcIso(date = new Date()): string {
  return date.toISOString()
}

export function setMockServerNow(iso: string | null) {
  mockServerNow = iso
}

export function serverNowUtc(): string {
  return mockServerNow ?? toUtcIso()
}

export function formatRiyadh(
  iso: string,
  opts: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: RIYADH }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function formatRiyadhDate(iso: string): string {
  return formatRiyadh(iso, { dateStyle: 'medium' })
}
