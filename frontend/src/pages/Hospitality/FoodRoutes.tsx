import { FoodListPage } from './FoodListPage'
import { HostDetailPage } from './HostDetailPage'

/**
 * Farm-to-table screens pushed from Explore, rendered without the tab bar:
 *   #/trip/explore/food            the kitchens
 *   #/trip/explore/food/<hostId>   one kitchen, with the "Reserve a squad thali" sheet
 */
export function FoodRoutes({ hostId }: { hostId?: string }) {
  return hostId ? <HostDetailPage key={hostId} hostId={hostId} /> : <FoodListPage />
}
