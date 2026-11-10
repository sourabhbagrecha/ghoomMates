import { useCallback, useEffect, useState } from 'react'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { Toast } from '../../components/Toast'
import { CROWD_LABELS } from '../../components/crowd/crowdData'
import { useEntryRoute, useNavigate } from '../../hooks/navigation'
import { refreshWhileVisible } from '../../hooks/refreshWhileVisible'
import { useToast } from '../../hooks/useToast'
import { opsApi, type OpsForecast, type OpsHotspot, type PartnerAdvisory, type Reach } from '../../services/opsService'
import { Switch } from '../Profile/ProfileParts'
import { AdvisoryList } from './AdvisoryList'
import { Heatmap } from './Heatmap'
import { HotspotList } from './HotspotList'
import { OpsKpis } from './OpsKpis'
import { SiteSheet } from './SiteSheet'
import { COPY, DAYS, HEAT_MODES, REFRESH_MS, istDate, istHour, numberText, squadsText, type DayId, type HeatMode } from './opsData'
import './OpsPage.css'

const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong')

/** The forecast for a day, refreshed while the console is open. Switching day or sample shows a skeleton, never stale data. */
function useForecast(date: string, sample: boolean) {
  const key = `${date}:${sample}`
  const [state, setState] = useState<{ key: string; forecast: OpsForecast | null; error: string | null }>({ key: '', forecast: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      opsApi.forecast(date, sample).then(
        (forecast) => !cancelled && setState({ key, forecast, error: null }),
        (err) => !cancelled && setState((prev) => ({ key, forecast: prev.key === key ? prev.forecast : null, error: message(err) })),
      )
    void load()
    const stop = refreshWhileVisible(load, REFRESH_MS)
    return () => {
      cancelled = true
      stop()
    }
  }, [date, sample, key, attempt])

  const current = state.key === key ? state : { forecast: null, error: null }
  return { ...current, retry: () => setAttempt((n) => n + 1) }
}

/** Live advisories (with how many squads each reached), kept fresh */
function useAdvisories() {
  const [items, setItems] = useState<PartnerAdvisory[] | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      opsApi.advisories().then(
        (list) => !cancelled && setItems(list),
        () => !cancelled && setItems((prev) => prev ?? []),
      )
    void load()
    const stop = refreshWhileVisible(load, REFRESH_MS)
    return () => {
      cancelled = true
      stop()
    }
  }, [version])

  return { items, reload: useCallback(() => setVersion((n) => n + 1), []) }
}

type SheetState = { siteId: string; hour: number; draft: boolean }

/**
 * Heritage Ops: the control room for site managers and the city. Tomorrow's crowd is the modelled day plus where squads
 * plan to be; the busiest windows can be turned into a bilingual advisory that reaches every squad heading in.
 */
export function OpsPage() {
  const navigate = useNavigate()
  const backTo = useEntryRoute('ops', 'profile/settings')
  const [day, setDay] = useState<DayId>('tomorrow')
  const [sample, setSample] = useState(true)
  const [mode, setMode] = useState<HeatMode>('squads')
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [toast, showToast] = useToast(4600)
  const date = istDate(DAYS.find((d) => d.id === day)!.offset)
  const { forecast, error, retry } = useForecast(date, sample)
  const advisories = useAdvisories()
  const onDay = (advisories.items ?? []).filter((a) => a.date === date)
  const liveCount = advisories.items?.length ?? 0
  const sheetSite = sheet && forecast ? forecast.sites.find((s) => s.id === sheet.siteId) : undefined

  const openSite = (siteId: string, hour: number, draft = false) => setSheet({ siteId, hour, draft })
  const openHotspot = (h: OpsHotspot, draft: boolean) => openSite(h.siteId, Math.floor(h.startMinutes / 60), draft)

  const published = (reach: Reach) => {
    setSheet(null)
    advisories.reload()
    showToast(
      reach.squads === '<3' || reach.squads === 0
        ? 'Advisory live · it will reach each squad that plans to go'
        : `Advisory live · reaching ${squadsText(reach.squads)}${reach.people !== null ? ` (about ${numberText(reach.people)} people)` : ''}`,
    )
  }

  const withdraw = async (id: string) => {
    try {
      await opsApi.withdraw(id)
      advisories.reload()
      showToast('Advisory withdrawn')
    } catch (err) {
      showToast(message(err))
    }
  }

  return (
    <>
      <OnboardingLayout
        eyebrow={COPY.eyebrow}
        title={COPY.title}
        onBack={() => navigate(backTo)}
        headerRight={<span className="ops__badge">{COPY.preview}</span>}
        headerExtra={
          <div className="ops__days" role="group" aria-label="Day to forecast">
            {DAYS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`ops__day${d.id === day ? ' ops__day--active' : ''}`}
                aria-pressed={d.id === day}
                onClick={() => setDay(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
        }
        bodyClassName="ops__body"
      >
        {forecast ? (
          <>
            <OpsKpis forecast={forecast} />

            <label className="list-card ops-sample">
              <span className="ops-sample__text">
                <span className="ops-sample__title">{COPY.sampleTitle}</span>
                <span className="ops-sample__label">{COPY.sampleText}</span>
              </span>
              <Switch on={sample} label={COPY.sampleTitle} onChange={setSample} />
            </label>

            <SectionHeader title="Needs a nudge" action={forecast.hotspots.length > 0 && <span className="ops__meta">{forecast.hotspots.length} windows</span>} />
            <HotspotList
              hotspots={forecast.hotspots.slice(0, 3)}
              advisories={onDay}
              onOpen={(h) => openHotspot(h, false)}
              onDraft={(h) => openHotspot(h, true)}
            />

            <SectionHeader
              title="Crowd forecast"
              action={
                <div className="ops-seg" role="group" aria-label="Show">
                  {HEAT_MODES.map((m) => (
                    <button key={m.id} type="button" className={`ops-seg__option${m.id === mode ? ' ops-seg__option--on' : ''}`} aria-pressed={m.id === mode} onClick={() => setMode(m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              }
            />
            <section className="card ops-forecast" aria-label="Crowd forecast by site and hour">
              <ul className="ops-forecast__legend" aria-label="Crowd levels">
                {(['quiet', 'moderate', 'busy', 'packed'] as const).map((label) => (
                  <li key={label}>
                    <span className={`ops-forecast__swatch ops-forecast__swatch--${label}`} aria-hidden="true" />
                    {CROWD_LABELS[label]}
                  </li>
                ))}
              </ul>
              <Heatmap
                forecast={forecast}
                mode={mode}
                nowHour={day === 'today' ? istHour() : null}
                selected={sheet ? { siteId: sheet.siteId, hour: sheet.hour } : null}
                onPick={(siteId, hour) => openSite(siteId, hour)}
              />
              <p className="ops-forecast__note">
                Tap a site or an hour for the hour-by-hour view and to draft an advisory. A dot marks a slot the squads’ plans tip into a busier band.
              </p>
            </section>
          </>
        ) : error ? (
          <ErrorState
            title="The forecast didn’t load"
            text="We couldn’t reach the crowd model. Check your connection and try again."
            detail={error}
            onRetry={retry}
          />
        ) : (
          <div className="ops__loading" aria-busy="true" aria-label="Loading the forecast">
            <Skeleton variant="card" height={190} radius={24} />
            <Skeleton variant="card" height={74} radius={18} />
            <Skeleton variant="card" height={300} />
          </div>
        )}

        <SectionHeader title="Live advisories" action={liveCount > 0 && <span className="ops__meta">{liveCount} live</span>} />
        <AdvisoryList advisories={advisories.items} onWithdraw={withdraw} />

        <p className="ops__footnote">
          {COPY.privacy} {COPY.method}
        </p>
      </OnboardingLayout>

      {sheet && forecast && sheetSite && (
        <SiteSheet
          // A different site (or draft request) starts a fresh sheet
          key={`${sheet.siteId}:${sheet.draft}:${forecast.date}`}
          forecast={forecast}
          site={sheetSite}
          hour={sheet.hour}
          sample={sample}
          advisories={onDay.filter((a) => a.siteId === sheet.siteId)}
          startDraft={sheet.draft}
          onHour={(hour) => setSheet({ ...sheet, hour })}
          onClose={() => setSheet(null)}
          onPublished={published}
          onWithdraw={withdraw}
        />
      )}
      <Toast message={toast} />
    </>
  )
}
