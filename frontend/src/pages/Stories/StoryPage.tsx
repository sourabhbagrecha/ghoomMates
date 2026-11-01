import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconArrowPrimary from '../../assets/figma/icon-arrow-primary.svg'
import iconArrowWhite from '../../assets/figma/icon-arrow-white.svg'
import iconBack from '../../assets/figma/icon-back-white.svg'
import iconPause from '../../assets/icons/icon-pause-primary.svg'
import iconPlay from '../../assets/icons/icon-play-primary.svg'
import iconReplay from '../../assets/icons/icon-rotate-ccw-primary.svg'
import { LinkButton } from '../../components/Button'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { Chip } from '../../components/Chip'
import { Toast } from '../../components/Toast'
import { TopSafeArea } from '../../components/TopSafeArea'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import {
  scoreLocally,
  storiesApi,
  type StampResult as Stamped,
  type Story,
  type StoryAudience,
  type StoryLang,
} from '../../services/storiesService'
import { KaavadStage } from './KaavadStage'
import { QuizBoard } from './QuizBoard'
import { StampResult } from './StampResult'
import { AUDIENCES, COPY, LANGUAGES, audienceLabel, clock, saveLang, savedLang, vibeWords } from './storiesData'
import { myStamps, storiesStore, useStories } from './storiesStore'
import { useNarration } from './useNarration'
import './StoryPage.css'

type View = 'story' | 'quiz' | 'result'

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Back to wherever the story was opened from (a stop, Explore, the passport), else to Explore */
function useLeave() {
  const navigate = useNavigate()
  return useCallback(() => {
    if (window.history.length > 1) window.history.back()
    else navigate('trip/explore', { replace: true })
  }, [navigate])
}

/**
 * The Kaavad screen: the painted doors open, the panels unfold one by one while a storyteller narrates in English or Hindi,
 * tuned to who is listening. Then a three-question quiz and a stamp in everyone's Heritage Passport.
 */
export function StoryPage({ siteId }: { siteId: string }) {
  const navigate = useNavigate()
  const leave = useLeave()
  const { trip, tripId: openTripId, error: tripError } = useActiveTrip()
  const { catalogue } = useStories({ passport: false })
  const tripId = trip?.id ?? null
  // The squad's vibe tunes the retelling, so the story waits a moment for the trip to load
  const waitingForTrip = !!openTripId && !trip && !tripError
  const [toast, showToast] = useToast(3600)
  const scroll = useRef<HTMLDivElement>(null)

  const [lang, setLang] = useState<StoryLang>(savedLang)
  const [audience, setAudience] = useState<StoryAudience>('classic')
  const [story, setStory] = useState<Story | null>(null)
  const [failed, setFailed] = useState(false)
  const [settled, setSettled] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState(0)
  const [view, setView] = useState<View>('story')
  const [answers, setAnswers] = useState<number[]>([])
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [stamped, setStamped] = useState<Stamped | null>(null)

  const copy = COPY[story?.lang ?? lang]
  const siteName = story?.siteName ?? catalogue.find((c) => c.siteId === siteId)?.name ?? 'Heritage story'

  /* Loading the story (again, when the language or audience changes) */
  const requestKey = `${siteId}|${lang}|${audience}|${tripId ?? ''}|${attempt}`
  const busy = settled !== requestKey
  const ticket = useRef(0)
  const shown = useRef<Story | null>(null)
  useEffect(() => {
    shown.current = story
  }, [story])

  useEffect(() => {
    if (waitingForTrip) return
    const mine = ++ticket.current
    storiesApi
      .story(siteId, { lang, audience, tripId })
      .then((next) => {
        if (mine !== ticket.current) return
        setStory(next)
        setFailed(false)
        setPanel((p) => Math.min(p, next.panels.length - 1))
        if (next.lang !== lang) showToast(lang === 'hi' ? 'This place has no Hindi telling yet, so here it is in English.' : 'Showing the story in another language.')
        else if (audience !== 'classic' && next.audience === 'classic') showToast('The retelling isn’t ready yet, so here is the classic telling. Tap the chip again in a moment.')
      })
      .catch(() => {
        if (mine !== ticket.current) return
        if (shown.current) showToast('Couldn’t reach the storyteller. Showing the last telling.')
        else setFailed(true)
      })
      .finally(() => {
        if (mine === ticket.current) setSettled(requestKey)
      })
  }, [siteId, lang, audience, tripId, requestKey, showToast, waitingForTrip])

  /* The painted doors swing open by themselves once the story is here */
  useEffect(() => {
    if (!story || open) return
    const timer = window.setTimeout(() => setOpen(true), prefersReducedMotion() ? 0 : 750)
    return () => window.clearTimeout(timer)
  }, [story, open])

  /* The storyteller */
  const narration = useNarration({ story, tripId, panel, onPanel: setPanel, onNotice: showToast })
  const { stop: stopNarration, seekToPanel } = narration

  const last = (story?.panels.length ?? 1) - 1
  const goTo = (index: number) => {
    const next = Math.max(0, Math.min(last, index))
    setPanel(next)
    seekToPanel(next)
  }

  const chooseLang = (next: StoryLang) => {
    if (next === (story?.lang ?? lang)) return
    saveLang(next)
    setLang(next)
  }

  const startQuiz = () => {
    stopNarration()
    setAnswers([])
    setStamped(null)
    setView('quiz')
    scroll.current?.scrollTo({ top: 0 })
  }

  const backToStory = () => {
    setView('story')
    scroll.current?.scrollTo({ top: 0 })
  }

  /* The squad: everyone else on the trip can be stamped along with you, since one phone reads to the whole group */
  const mates = useMemo(() => (trip?.members ?? []).filter((m) => m.memberId !== trip?.memberId).map((m) => ({ memberId: m.memberId, userId: m.userId })), [trip])
  const listeners = chosen ?? mates.map((m) => m.userId)
  const toggleListener = (userId: string) => setChosen(listeners.includes(userId) ? listeners.filter((id) => id !== userId) : [...listeners, userId])

  const stamp = async () => {
    if (!story) return
    setSaving(true)
    try {
      const result = await storiesApi.stamp(story.siteId, { lang: story.lang, audience: story.audience, answers, tripId, withUserIds: tripId ? listeners : [] })
      storiesStore.recordStamp(result)
      void storiesStore.loadPassport(true)
      if (tripId) void storiesStore.loadSquad(tripId)
      setStamped(result)
    } catch {
      // The passport desk is closed (or there is no connection): the stamp is kept on this phone
      const round = scoreLocally(story.quiz, answers)
      storiesStore.keepOnPhone(story.siteId, round.score, round.total)
      const state = storiesStore.get()
      setStamped({
        siteId: story.siteId,
        siteName: story.siteName,
        ...round,
        best: { score: round.score, total: round.total, grade: round.grade },
        firstTime: true,
        stampedWith: 0,
        passport: { stamped: myStamps(state).size, totalSites: state.passport?.totalSites ?? state.catalogue.length },
        savedOnPhone: true,
      })
    } finally {
      setSaving(false)
    }
  }

  const note = !story
    ? null
    : story.audience !== 'classic'
      ? `Retold by Gemini for ${audienceLabel(story.audience)}${story.vibe ? ` · your squad leans ${vibeWords(story.vibe)}` : ''}`
      : audience !== 'classic'
        ? 'Classic telling · the retelling for your audience wasn’t ready'
        : story.narration
          ? null
          : 'A short telling from the heritage guide'

  const playing = narration.status === 'playing'
  const loading = narration.status === 'loading'
  const ended = narration.status === 'ended'
  const progress = narration.duration ? Math.min(1, narration.elapsed / narration.duration) : 0
  const caption =
    narration.status === 'loading'
      ? 'Warming up the storyteller…'
      : narration.mode === 'voice'
        ? 'Reading aloud with your phone’s voice'
        : narration.mode === 'audio' && narration.source
          ? narration.source === 'static'
            ? 'Recorded with Gemini speech'
            : 'Narrated with Gemini speech'
          : copy.play

  return (
    <div className="story" lang={story?.lang ?? lang}>
      <div className="story__scroll" ref={scroll}>
        <header className="story__header">
          <img className="story__header-bg" src={headerBg} alt="" width={393} height={170} />
          <div className="story__header-content">
            <TopSafeArea />
            <div className="story__top-bar">
              <button type="button" className="story__back" onClick={leave} aria-label="Back">
                <img src={iconBack} alt="" width={20} height={20} />
              </button>
              {view === 'story' && (
              <div className="story__lang" role="group" aria-label="Story language">
                {LANGUAGES.map((l) => (
                  <button key={l.id} type="button" className="story__lang-option" aria-pressed={(story?.lang ?? lang) === l.id} aria-label={l.name} lang={l.id} onClick={() => chooseLang(l.id)}>
                    {l.short}
                  </button>
                ))}
              </div>
              )}
            </div>
            <div className="story__heading">
              <p className="story__eyebrow">Kaavad Tales · Udaipur</p>
              <h1 className="story__title">{siteName}</h1>
            </div>
            {view === 'story' && (
              <div className="story__audience no-scrollbar" role="group" aria-label="Who is listening">
                {AUDIENCES.map((a) => (
                  <Chip key={a.id} variant="onDark" selected={a.id === audience} onClick={() => setAudience(a.id)}>
                    {a.label}
                  </Chip>
                ))}
              </div>
            )}
            {view === 'story' && note && <p className="story__note">{note}</p>}
          </div>
        </header>

        <main className="story__body" aria-busy={busy}>
          {failed && !story && (
            <ErrorState
              title="The storyteller is away"
              text="We couldn’t open this story. Check your connection and try again."
              onRetry={() => {
                setFailed(false)
                setAttempt((n) => n + 1)
              }}
            />
          )}

          {!story && !failed && (
            <div className="story__loading" role="status">
              <Skeleton variant="card" height={470} radius={26} />
              <p className="story__loading-text">Unrolling the painted panels…</p>
            </div>
          )}

          {story && view === 'story' && (
            <>
              <KaavadStage siteName={story.siteName} panels={story.panels} index={panel} open={open} busy={busy} copy={copy} onOpen={() => setOpen(true)} onStep={(d) => goTo(panel + d)} />
              <p className="story__care">
                <strong>Visit lightly</strong>
                {story.careNote}
              </p>
              <p className="story__about">A Kaavad is a painted wooden shrine from Bassi, near Chittorgarh. Its doors open panel by panel as the Kavadiya Bhat tells the tale.</p>
            </>
          )}

          {story && view === 'quiz' && (
            <>
              <QuizBoard
                quiz={story.quiz}
                copy={copy}
                onDone={(given) => {
                  setAnswers(given)
                  setView('result')
                  scroll.current?.scrollTo({ top: 0 })
                }}
              />
              <LinkButton onClick={backToStory}>{copy.backToStory}</LinkButton>
            </>
          )}

          {story && view === 'result' && (
            <StampResult
              story={story}
              copy={copy}
              answers={answers}
              mates={mates}
              listeners={listeners}
              saving={saving}
              stamped={stamped}
              onToggle={toggleListener}
              onStamp={() => void stamp()}
              onPassport={() => navigate('trip/explore/passport')}
              onAnother={() => navigate('trip/explore')}
            />
          )}
        </main>
      </div>

      {story && view === 'story' && (
        <footer className="story__bar">
          <div className="story__player">
            <button
              type="button"
              className={`story__play${loading ? ' story__play--loading' : ''}`}
              onClick={narration.toggle}
              disabled={!open}
              aria-label={playing ? copy.pause : ended ? copy.replay : copy.play}
            >
              {loading ? <span className="story__spinner" aria-hidden="true" /> : <img src={playing ? iconPause : ended ? iconReplay : iconPlay} alt="" width={22} height={22} />}
            </button>
            <div className="story__track">
              <div className="story__times" aria-hidden="true">
                <span>{clock(narration.elapsed)}</span>
                <span>{narration.duration ? clock(narration.duration) : '—:—'}</span>
              </div>
              <div className="story__scrub-wrap">
                <input
                  type="range"
                  className="story__scrub"
                  min={0}
                  max={1000}
                  value={Math.round(progress * 1000)}
                  disabled={narration.mode !== 'audio' || !narration.duration}
                  aria-label="Narration progress"
                  aria-valuetext={`${clock(narration.elapsed)} of ${narration.duration ? clock(narration.duration) : 'unknown'}`}
                  style={{ '--progress': `${progress * 100}%` } as CSSProperties}
                  onChange={(e) => narration.seekToFraction(Number(e.target.value) / 1000)}
                />
                {narration.duration > 0 &&
                  narration.marks.slice(1).map((mark) => <span key={mark} className="story__tick" style={{ left: `${(mark / narration.duration) * 100}%` }} aria-hidden="true" />)}
              </div>
              <p className="story__caption" role="status">
                {caption}
              </p>
            </div>
          </div>

          <div className="story__nav">
            <button type="button" className="story__step" disabled={panel === 0} onClick={() => goTo(panel - 1)}>
              <img src={iconArrowPrimary} alt="" width={16} height={16} className="story__step-back" />
              {copy.back}
            </button>
            <div className="story__dots" role="group" aria-label="Panels">
              {story.panels.map((p, i) => (
                <button key={i} type="button" className={`story__dot${i === panel ? ' story__dot--on' : ''}`} aria-label={`${copy.panelOf(i + 1, story.panels.length)}: ${p.heading}`} aria-current={i === panel} onClick={() => goTo(i)} />
              ))}
            </div>
            {panel < last ? (
              <button type="button" className="pill-button story__next" onClick={() => goTo(panel + 1)}>
                {copy.next}
                <img src={iconArrowWhite} alt="" width={14} height={14} />
              </button>
            ) : (
              <button type="button" className="pill-button story__next" onClick={startQuiz}>
                {copy.quiz}
                <img src={iconArrowWhite} alt="" width={14} height={14} />
              </button>
            )}
          </div>
        </footer>
      )}

      <Toast message={toast} />
      <span className="home-indicator" aria-hidden="true" />
    </div>
  )
}
