import type { TabId } from '../../components/TabBar'

let lastTab: TabId = 'itinerary'

/** The trip tab the user was last on, so screens opened from any tab (e.g. Members via QR) go back to it. */
export const rememberTripTab = (tab: TabId) => {
  lastTab = tab
}

export const lastTripTab = () => lastTab
