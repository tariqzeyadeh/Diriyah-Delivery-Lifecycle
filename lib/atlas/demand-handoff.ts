/** Demand handed to the Business Owner after a creator’s preliminary submit. */
export const DEMAND_AWAITING_OWNER = 'AWAITING_OWNER'

export function isDemandAwaitingOwner(status: string | null | undefined): boolean {
  return (status ?? '').toUpperCase() === DEMAND_AWAITING_OWNER
}
