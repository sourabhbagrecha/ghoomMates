import { HostDashboardPage } from './HostDashboardPage'

/**
 * The host kitchen, mounted at `#/host[/<hostId>]`. The kitchen picker changes the id in the route, so a reload or a
 * shared link lands on the same kitchen. Opened from Profile → Partner tools → Host kitchen.
 */
export function HostRoutes({ path }: { path: string[] }) {
  const [hostId] = path
  return <HostDashboardPage hostId={hostId || undefined} />
}
