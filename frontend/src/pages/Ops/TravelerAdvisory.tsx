import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import iconMegaphone from '../../assets/icons/icon-megaphone-white.svg'
import { Toast } from '../../components/Toast'
import { activeTrip, useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { refreshWhileVisible } from '../../hooks/refreshWhileVisible'
import { useToast } from '../../hooks/useToast'
import { CITY, opsApi, type Advisory } from '../../services/opsService'
import { tripsApi, type ItineraryStop } from '../../services/tripsService'
import { useProfileStore } from '../Profile/profileStore'
import { REFRESH_MS, formatClock, formatWindow, relativeDay } from './opsData'
import './TravelerAdvisory.css'

/* What travellers see of Heritage Ops: heads-ups from the site managers, with a swap their squad can take. */

/** Active advisories for a city (none while `city` is null), refreshed quietly; a failed request just shows nothing */
function usePublicAdvisories(city: string | null) {
  const [items, setItems] = useState<Advisory[]>([])
  useEffect(() => {
    if (!city) return
    let cancelled = false
    const load = () =>
      opsApi.publicAdvisories(city).then(
        (list) => !cancelled && setItems(list),
        () => undefined,
      )
    void load()
    const stop = refreshWhileVisible(load, REFRESH_MS)
    return () => {
      cancelled = true
      stop()
    }
  }, [city])
  return items
}

const TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i

function minutesOf(time: string) {
  const match = TIME.exec(time.trim())
  if (!match) return null
  return ((Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2])
}

/** YYYY-MM-DD of day N of a trip */
function dateOfDay(startDate: string | null, day: number) {
  if (!startDate) return null
  const date = new Date(`${startDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + day - 1)
  return date.toISOString().slice(0, 10)
}

/** The advisory is for the stop's site, on its day, and the stop starts inside the window */
function affects(advisory: Advisory, stop: ItineraryStop, startDate: string | null) {
  if (!stop.crowd || stop.crowd.siteId !== advisory.siteId || dateOfDay(startDate, stop.dayNumber) !== advisory.date) return false
  const minutes = minutesOf(stop.time)
  return minutes !== null && minutes >= advisory.startMinutes && minutes < advisory.endMinutes
}

/** The toast has to sit on the device frame, not inside a card (cards have a filter, which would trap it) */
function useDeviceToast(): [ReactNode, (message: string) => void] {
  const [message, show] = useToast(3600)
  const frame = typeof document === 'undefined' ? null : document.querySelector('.device')
  const toast = frame ? createPortal(<Toast message={message} />, frame) : <Toast message={message} />
  return [toast, show]
}

/** The message in the traveller's language, with a switch to read the other one */
function useMessage(advisory: Advisory) {
  const profile = useProfileStore()
  const [hindi, setHindi] = useState(profile.language === 'hi')
  const showHindi = hindi && !!advisory.messageHi
  return {
    text: showHindi ? advisory.messageHi : advisory.messageEn,
    lang: showHindi ? 'hi' : 'en',
    toggle: advisory.messageHi ? (
      <button type="button" className="text-link advisory__lang" aria-pressed={showHindi} onClick={() => setHindi(!showHindi)}>
        {showHindi ? 'Read in English' : 'हिन्दी में पढ़ें'}
      </button>
    ) : null,
  }
}

/** Swap this stop for the calmer site, or move it to the calmer time. Both go through the normal stop update. */
function SwapActions({ advisory, stop, tripId, onDone }: { advisory: Advisory; stop: ItineraryStop; tripId: string; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState<'swap' | 'time' | null>(null)
  const site = advisory.alternative?.site
  const time = advisory.alternative?.time
  if (!site && !time) return null

  const apply = async (kind: 'swap' | 'time') => {
    setBusy(kind)
    const base = { dayNumber: stop.dayNumber, time: stop.time, title: stop.title, tag: stop.tag, place: stop.place, notes: stop.notes }
    const next = kind === 'swap' && site
      ? { ...base, title: site.title, place: site.place, tag: site.tag, notes: site.notes }
      : { ...base, time: time?.time ?? stop.time }
    try {
      await tripsApi.updateStop(tripId, stop.id, next)
      await activeTrip.loadItinerary()
      onDone(kind === 'swap' && site ? `Swapped to ${site.name}. Your squad dodges the crowd.` : `Moved to ${time?.time}. Your squad dodges the crowd.`)
    } catch (err) {
      onDone(err instanceof Error ? err.message : 'Couldn’t change the stop. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="advisory__actions">
      {site && (
        <button type="button" className="pill-button" disabled={busy !== null} onClick={() => void apply('swap')}>
          {busy === 'swap' ? 'Swapping…' : `Swap to ${site.name}`}
        </button>
      )}
      {time && (
        <button type="button" className="advisory__ghost" disabled={busy !== null} onClick={() => void apply('time')}>
          {busy === 'time' ? 'Moving…' : `Move to ${formatClock(time.minutes)}`}
        </button>
      )}
    </div>
  )
}

/**
 * Info banners on Explore's crowd map: heads-ups from the site managers for the next days, with the calmer option and,
 * if your squad has a stop in the window, a one-tap swap. Sky blue, never red: it's a nudge, not an alarm.
 */
export function AdvisoryBanners({ city, onPickSite }: { city: string; onPickSite?: (siteId: string) => void }) {
  const advisories = usePublicAdvisories(city)
  const [toast, showToast] = useDeviceToast()
  if (!advisories.length) return null
  const shown = advisories.slice(0, 2)

  return (
    <div className="advisory-banners">
      {shown.map((advisory) => (
        <AdvisoryBanner key={advisory.id} advisory={advisory} onPickSite={onPickSite} onDone={showToast} />
      ))}
      {advisories.length > shown.length && (
        <p className="advisory-banners__more">
          +{advisories.length - shown.length} more {advisories.length - shown.length === 1 ? 'heads-up' : 'heads-ups'} from the site managers
        </p>
      )}
      {toast}
    </div>
  )
}

function AdvisoryBanner({ advisory, onPickSite, onDone }: { advisory: Advisory; onPickSite?: (siteId: string) => void; onDone: (message: string) => void }) {
  const { trip, itinerary } = useActiveTrip()
  const message = useMessage(advisory)
  const swap = advisory.alternative?.site
  const time = advisory.alternative?.time
  const stops = trip && itinerary ? itinerary.flatMap((d) => d.stops).filter((s) => affects(advisory, s, trip.startDate)) : []

  return (
    <article className="advisory" aria-label={`Heads up for ${advisory.siteName}`}>
      <span className="advisory__icon" aria-hidden="true">
        <img src={iconMegaphone} alt="" width={18} height={18} />
      </span>
      <div className="advisory__body">
        <p className="advisory__overline">
          Heads up · {relativeDay(advisory.date)}, {formatWindow(advisory.startMinutes, advisory.endMinutes)}
        </p>
        <p className="advisory__text" lang={message.lang}>
          {message.text}
        </p>
        {(swap || time) && (
          <ul className="advisory__options" aria-label="Calmer options">
            {swap && (
              <li>
                {onPickSite ? (
                  <button type="button" className="advisory__chip" onClick={() => onPickSite(swap.id)}>
                    <img src={iconMapPin} alt="" width={12} height={12} />
                    See {swap.name}
                  </button>
                ) : (
                  <span className="advisory__chip">
                    <img src={iconMapPin} alt="" width={12} height={12} />
                    {swap.name}
                  </span>
                )}
              </li>
            )}
            {time && (
              <li>
                <span className="advisory__chip">Come at {formatClock(time.minutes)}</span>
              </li>
            )}
          </ul>
        )}
        {trip &&
          stops.map((stop) => (
            <div key={stop.id} className="advisory__yours">
              <p>
                Your squad has <strong>{stop.title}</strong> at {stop.time}.
              </p>
              <SwapActions advisory={advisory} stop={stop} tripId={trip.id} onDone={onDone} />
            </div>
          ))}
        {message.toggle}
      </div>
    </article>
  )
}

/**
 * On a stop's page: the site manager's heads-up when this stop's site has an active advisory covering its time, with the
 * swap ready to apply. Renders nothing otherwise.
 */
export function SiteAdvisory({ stop }: { stop: ItineraryStop }) {
  const { trip } = useActiveTrip()
  // Only stops at a heritage site (which carry crowd data) can have an advisory
  const advisories = usePublicAdvisories(stop.crowd ? CITY : null)
  const [toast, showToast] = useDeviceToast()
  const advisory = trip ? advisories.find((a) => affects(a, stop, trip.startDate)) : undefined
  if (!trip || !advisory) return <>{toast}</>

  return (
    <>
      <section className="advisory" aria-label={`Heads up for ${advisory.siteName}`}>
        <SiteAdvisoryBody advisory={advisory} stop={stop} tripId={trip.id} onDone={showToast} />
      </section>
      {toast}
    </>
  )
}

function SiteAdvisoryBody({ advisory, stop, tripId, onDone }: { advisory: Advisory; stop: ItineraryStop; tripId: string; onDone: (message: string) => void }) {
  const message = useMessage(advisory)
  return (
    <>
      <span className="advisory__icon" aria-hidden="true">
        <img src={iconMegaphone} alt="" width={18} height={18} />
      </span>
      <div className="advisory__body">
        <p className="advisory__overline">
          Heads up · {formatWindow(advisory.startMinutes, advisory.endMinutes)}
        </p>
        <p className="advisory__text" lang={message.lang}>
          {message.text}
        </p>
        <SwapActions advisory={advisory} stop={stop} tripId={tripId} onDone={onDone} />
        {message.toggle}
      </div>
    </>
  )
}

/** A small way into the console from the traveller's crowd map, for site managers */
export function OpsConsoleLink() {
  const navigate = useNavigate()
  return (
    <button type="button" className="text-link advisory__ops-link" onClick={() => navigate('ops')}>
      Site manager? Open Heritage Ops
    </button>
  )
}
