import type { Transfer } from '../../services/tripsService'

type SettlementResult = { via: string; transfers: Transfer[] }

// What the last "Pay via UPI" recorded, for the confirmation screen
let last: SettlementResult | null = null

export const recordSettlement = (result: SettlementResult) => {
  last = result
}

export const lastSettlement = () => last
