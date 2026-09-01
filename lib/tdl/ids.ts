const LIFECYCLE_ID_RE = /^TDL-\d{4}-\d{5}$/

export function isValidLifecycleNumber(value: string): boolean {
  return LIFECYCLE_ID_RE.test(value)
}

export function formatLifecycleNumber(year: number, seq: number): string {
  return `TDL-${year}-${String(seq).padStart(5, '0')}`
}

export function assertLifecycleNumber(value: string): void {
  if (!isValidLifecycleNumber(value)) {
    throw new Error(`Invalid lifecycle number: expected TDL-YYYY-NNNNN, got ${value}`)
  }
}
