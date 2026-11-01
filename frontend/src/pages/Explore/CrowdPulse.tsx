import { useEffect, useState } from 'react'
import { CrowdChip } from '../../components/crowd/Crowd'
import { SectionHeader } from '../../components/SectionHeader'
import { heritageApi, type LiveCrowds, type LiveSite } from '../../services/heritageService'
import { AdvisoryBanners, OpsConsoleLink } from '../Ops/TravelerAdvisory'
import { LAKES, MAP_HEIGHT, MAP_WIDTH, project } from './crowdMapData'
import './CrowdPulse.css'

const REFRESH_MS = 60_000
const HOURS = [null, 7, 10, 12, 15, 18, 20]

/**
 * Live crowds across Udaipur's heritage sites: a map of the old city coloured by how busy each site is, and the quiet
 * gems to head for instead. Spreading squads across the city and the day is how the app eases overtourism.
 */
export function CrowdPulse({ city }: { city: string }) {
  const [live, setLive] = useState<LiveCrowds | null>(null)
  const [failed, setFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // null follows the clock; an hour previews that time today
  const [hour, setHour] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      heritageApi
        .live(city, hour === null || !live ? undefined : `${live.date}T${String(hour).padStart(2, '0')}:00:00+05:30`)
        .then((data) => {
          if (cancelled) return
          setLive(data)
          setFailed(false)
          // At night everything is closed, so show the evening rush instead
          if (hour === null && data.sites.every((s) => s.level === null)) setHour(18)
        })
        .catch(() => !cancelled && setFailed(true))
    void load()
    const timer = hour === null ? setInterval(load, REFRESH_MS) : undefined
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // live.date only seeds the preview day; reloading on every response would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, hour])

  if (failed && !live) return null
  const open = live?.sites.filter((s) => s.level !== null) ?? []
  const selected = live?.sites.find((s) => s.id === selectedId) ?? open[0] ?? null
  const quietGems = open.filter((s) => s.gem && s.label === 'quiet').reverse().slice(0, 4)

  return (
    <>
      <SectionHeader
        title="Heritage crowds now"
        action={
          live && (
            <span className="crowd-pulse__live">
              <span className="crowd-pulse__live-dot" aria-hidden="true" />
              {hour === null ? `Live · ${live.time}` : `Forecast · ${live.time}`}
            </span>
          )
        }
      />
      <AdvisoryBanners city={city} onPickSite={setSelectedId} />
      <section className="card crowd-pulse">
        <svg
          className="crowd-pulse__map"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="group"
          aria-label={`Map of ${city}’s heritage sites coloured by how crowded they are`}
        >
          {LAKES.map((lake) => (
            <g key={lake.name}>
              <path className="crowd-pulse__lake" d={lake.path} />
              <text className="crowd-pulse__lake-name" x={lake.label[0]} y={lake.label[1]} textAnchor={lake.anchor}>
                {lake.name}
              </text>
            </g>
          ))}
          {live?.sites.map((site) => {
            const [x, y] = project(site.lat, site.lng)
            const active = site.id === selected?.id
            return (
              <g key={site.id} className={`crowd-pulse__site crowd-pulse__site--${site.label}`}>
                {(site.label === 'packed' || site.label === 'busy') && <circle className="crowd-pulse__halo" cx={x} cy={y} r={11} />}
                <circle
                  className={`crowd-pulse__dot${active ? ' crowd-pulse__dot--active' : ''}`}
                  cx={x}
                  cy={y}
                  r={active ? 8 : site.gem ? 5.5 : 6.5}
                  tabIndex={0}
                  role="button"
                  aria-label={`${site.name}: ${site.label}`}
                  aria-pressed={active}
                  onClick={() => setSelectedId(site.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelectedId(site.id))}
                />
              </g>
            )
          })}
          {selected && <SiteLabel site={selected} />}
        </svg>

        <div className="crowd-pulse__hours no-scrollbar" role="group" aria-label="Show crowds at">
          {HOURS.map((h) => (
            <button
              key={h ?? 'now'}
              type="button"
              className={`crowd-pulse__hour${h === hour ? ' crowd-pulse__hour--active' : ''}`}
              aria-pressed={h === hour}
              onClick={() => setHour(h)}
            >
              {h === null ? 'Now' : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`}
            </button>
          ))}
        </div>

        {live ? (
          <>
            <p className="crowd-pulse__summary">
              <strong>
                {live.packed} {live.packed === 1 ? 'site is' : 'sites are'} crowded
              </strong>{' '}
              · {live.quiet} quiet {hour === null ? 'right now' : 'then'}{live.dayNote ? ` · it’s ${live.dayNote}` : ''}
            </p>
            {selected && <SiteDetail site={selected} now={hour === null} />}
            {quietGems.length > 0 && (
              <div className="crowd-pulse__gems">
                <p className="overline">{hour === null ? 'Quiet gems right now' : 'Quiet gems then'}</p>
                <div className="crowd-pulse__gem-list no-scrollbar">
                  {quietGems.map((gem) => (
                    <button
                      key={gem.id}
                      type="button"
                      className={`crowd-pulse__gem${gem.id === selected?.id ? ' crowd-pulse__gem--active' : ''}`}
                      aria-pressed={gem.id === selected?.id}
                      onClick={() => setSelectedId(gem.id)}
                    >
                      {gem.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="crowd-pulse__summary">Checking the crowds…</p>
        )}
        <OpsConsoleLink />
      </section>
    </>
  )
}

/** The selected site's name beside its dot, flipped left near the map's right edge */
function SiteLabel({ site }: { site: LiveSite }) {
  const [x, y] = project(site.lat, site.lng)
  const flip = x > MAP_WIDTH * 0.6
  return (
    <text className="crowd-pulse__site-name" x={flip ? x - 12 : x + 12} y={y + 3.5} textAnchor={flip ? 'end' : 'start'}>
      {site.name}
    </text>
  )
}

function SiteDetail({ site, now }: { site: LiveSite; now: boolean }) {
  const when =
    site.level === null
      ? site.best && `Closed now · quietest around ${site.best.time}`
      : site.label === 'quiet'
        ? now ? 'Go now: hardly any queue' : 'Hardly any queue then'
        : [site.waitMinutes > 0 && `~${site.waitMinutes} min queue`, site.trend === 'rising' ? 'getting busier' : site.trend === 'falling' ? 'emptying out' : null, site.quietAt && `quiet by ${site.quietAt}`]
            .filter(Boolean)
            .join(' · ')
  return (
    <div className="crowd-pulse__detail">
      <div className="crowd-pulse__detail-head">
        <h3 className="crowd-pulse__detail-name">{site.name}</h3>
        <CrowdChip label={site.label} detail={site.level === null ? undefined : `${site.level}/100`} />
      </div>
      {when && <p className="crowd-pulse__detail-when">{when}</p>}
      <p className="crowd-pulse__detail-story">{site.story}</p>
    </div>
  )
}
