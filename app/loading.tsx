export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-diriyah-bg-primary">
      <div
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-diriyah-bg-secondary border-t-diriyah-primary"
        style={{ borderTopColor: 'var(--diriyah-primary)' }}
        role="status"
        aria-label="Loading"
      />
      <p className="text-sm font-medium text-diriyah-primary">Loading Diriyah…</p>
    </div>
  )
}
