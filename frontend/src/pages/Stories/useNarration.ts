import { useCallback, useEffect, useRef, useState } from 'react'
import { storiesApi, type Narration, type Story } from '../../services/storiesService'

/**
 * The storyteller's voice. Plays the recording that matches the story (shipped with the app, or recorded by Gemini speech
 * and kept in the bucket) and tells the Kaavad when to unfold the next panel. If no recording can be had, the phone's own
 * voice reads the panels instead, so the story is never silent.
 */

export type NarrationStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended'

export type NarrationControls = {
  status: NarrationStatus
  /** Recorded audio, or the phone's own voice; null before the first play */
  mode: 'audio' | 'voice' | null
  /** Where the recording came from, for the caption */
  source: Narration['source'] | null
  elapsed: number
  duration: number
  /** Second at which each panel starts, when known */
  marks: number[]
  toggle: () => void
  stop: () => void
  /** Follow the reader to a panel they chose themselves */
  seekToPanel: (index: number) => void
  /** 0–1 across the whole story */
  seekToFraction: (fraction: number) => void
}

type Options = {
  story: Story | null
  tripId: string | null
  /** The panel on screen */
  panel: number
  /** The voice moved on to this panel */
  onPanel: (index: number) => void
  /** Something worth telling the reader (the voice is warming up, or not available) */
  onNotice: (message: string) => void
}

/** What the reader sees of the narration; it belongs to one story and starts over when the story changes */
type View = {
  key: string
  status: NarrationStatus
  mode: 'audio' | 'voice' | null
  source: Narration['source'] | null
  elapsed: number
  duration: number
  marks: number[]
}

const IDLE: Omit<View, 'key'> = { status: 'idle', mode: null, source: null, elapsed: 0, duration: 0, marks: [] }

const SEEK_SLACK = 0.25

/** The panel being narrated at a moment in the recording */
export function panelAt(marks: number[], seconds: number) {
  let found = 0
  marks.forEach((mark, i) => {
    if (seconds + SEEK_SLACK >= mark) found = i
  })
  return found
}

const hasVoice = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

export function useNarration({ story, tripId, panel, onPanel, onNotice }: Options): NarrationControls {
  const storyKey = story ? `${story.siteId}|${story.lang}|${story.audience}|${story.vibe ?? ''}` : ''
  const [state, setState] = useState<View>({ key: '', ...IDLE })
  const view: View = state.key === storyKey ? state : { key: storyKey, ...IDLE }

  const audio = useRef<HTMLAudioElement | null>(null)
  const loaded = useRef<{ key: string; narration: Narration } | null>(null)
  const voicePanel = useRef(0)
  const latest = useRef({ story, panel, onPanel, onNotice, marks: [] as number[], key: storyKey, status: 'idle' as NarrationStatus })
  useEffect(() => {
    latest.current = { ...latest.current, story, panel, onPanel, onNotice, key: storyKey, status: view.status }
  })

  /** Changes what the reader sees, for the story on screen */
  const update = useCallback((patch: Partial<Omit<View, 'key'>>) => {
    setState((prev) => ({ ...(prev.key === latest.current.key ? prev : { key: latest.current.key, ...IDLE }), ...patch }))
  }, [])

  const silence = useCallback(() => {
    audio.current?.pause()
    if (hasVoice()) window.speechSynthesis.cancel()
  }, [])

  // A different story (language, audience) needs its own recording, and the old one stops
  useEffect(() => {
    loaded.current = null
    latest.current.marks = []
    voicePanel.current = 0
    silence()
  }, [storyKey, silence])

  // Leaving the screen silences the storyteller
  useEffect(
    () => () => {
      audio.current?.pause()
      audio.current = null
      if (hasVoice()) window.speechSynthesis.cancel()
    },
    [],
  )

  const stop = useCallback(() => {
    silence()
    update({ status: 'idle', elapsed: 0 })
  }, [silence, update])

  const speak = useCallback(
    (from: number) => {
      const current = latest.current.story
      if (!current || !hasVoice()) return false
      const synth = window.speechSynthesis
      synth.cancel()
      const voices = synth.getVoices()
      const wanted = current.lang === 'hi' ? 'hi' : 'en'
      const voice = voices.find((v) => v.lang.toLowerCase().startsWith(`${wanted}-in`)) ?? voices.find((v) => v.lang.toLowerCase().startsWith(wanted))
      const read = (index: number) => {
        const text = current.panels[index]?.text
        if (!text) {
          update({ status: 'ended' })
          return
        }
        voicePanel.current = index
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = voice?.lang ?? (wanted === 'hi' ? 'hi-IN' : 'en-IN')
        if (voice) utterance.voice = voice
        utterance.rate = 0.92
        utterance.onend = () => {
          // A cancelled reading (the reader moved on) also ends, so only follow on from the one still current
          if (voicePanel.current !== index) return
          if (index + 1 < current.panels.length) {
            latest.current.onPanel(index + 1)
            read(index + 1)
          } else {
            update({ status: 'ended' })
          }
        }
        utterance.onerror = () => undefined
        synth.speak(utterance)
        if (latest.current.panel !== index) latest.current.onPanel(index)
      }
      update({ mode: 'voice', source: null, status: 'playing', marks: [], duration: 0, elapsed: 0 })
      read(from)
      return true
    },
    [update],
  )

  const ensureAudio = useCallback(() => {
    if (audio.current) return audio.current
    const element = new Audio()
    element.preload = 'auto'
    element.addEventListener('timeupdate', () => {
      update({ elapsed: element.currentTime })
      const marks = latest.current.marks
      if (marks.length) {
        const index = panelAt(marks, element.currentTime)
        if (index !== latest.current.panel) latest.current.onPanel(index)
      }
    })
    element.addEventListener('ended', () => update({ status: 'ended', elapsed: element.duration || 0 }))
    audio.current = element
    return element
  }, [update])

  /** Gets the recording for this story: shipped with the app, or recorded now (which can take a little while) */
  const resolve = useCallback(async (): Promise<Narration> => {
    const current = latest.current.story!
    const key = latest.current.key
    if (loaded.current?.key === key) return loaded.current.narration
    const narration = current.narration ?? (await storiesApi.narration(current.siteId, { lang: current.lang, audience: current.audience, tripId }))
    loaded.current = { key, narration }
    return narration
  }, [tripId])

  const play = useCallback(
    async (fromPanel: number) => {
      const current = latest.current.story
      if (!current) return
      update({ status: 'loading' })
      if (!current.narration && !loaded.current) latest.current.onNotice('The storyteller is clearing their throat…')
      try {
        const narration = await resolve()
        const element = ensureAudio()
        if (!element.src.endsWith(narration.url) && element.src !== narration.url) {
          element.src = narration.url
          element.load()
        }
        latest.current.marks = narration.marks
        update({ mode: 'audio', source: narration.source, marks: narration.marks, duration: narration.durationSec })
        const start = narration.marks[fromPanel] ?? 0
        const begin = () => {
          element.currentTime = start
        }
        if (element.readyState >= 1) begin()
        else element.addEventListener('loadedmetadata', begin, { once: true })
        await element.play()
        update({ status: 'playing' })
      } catch {
        // No recording (offline, Gemini out of reach, blocked): the phone's own voice carries on
        loaded.current = null
        audio.current?.pause()
        if (!speak(fromPanel)) {
          update({ status: 'idle' })
          latest.current.onNotice('The storyteller’s voice isn’t available right now. Read on, the panels tell it too.')
        } else {
          latest.current.onNotice('Using your phone’s voice for now.')
        }
      }
    },
    [ensureAudio, resolve, speak, update],
  )

  const { status, mode } = view

  const toggle = useCallback(() => {
    if (status === 'loading') return
    if (status === 'playing') {
      if (mode === 'voice') window.speechSynthesis.pause()
      else audio.current?.pause()
      update({ status: 'paused' })
      return
    }
    if (status === 'paused') {
      if (mode === 'voice') window.speechSynthesis.resume()
      else void audio.current?.play()
      update({ status: 'playing' })
      return
    }
    // Idle, or finished: start from the panel on screen (or the top when the story had ended)
    if (status === 'ended') latest.current.onPanel(0)
    void play(status === 'ended' ? 0 : latest.current.panel)
  }, [mode, play, status, update])

  const seekToPanel = useCallback(
    (index: number) => {
      if (status !== 'playing' && status !== 'paused') return
      const marks = latest.current.marks
      if (mode === 'audio' && audio.current && marks.length) {
        const target = marks[index]
        if (target !== undefined && panelAt(marks, audio.current.currentTime) !== index) audio.current.currentTime = target
      } else if (mode === 'voice' && voicePanel.current !== index) {
        voicePanel.current = index
        speak(index)
      }
    },
    [mode, speak, status],
  )

  const duration = view.duration
  const seekToFraction = useCallback(
    (fraction: number) => {
      if (mode !== 'audio' || !audio.current || !duration) return
      audio.current.currentTime = Math.max(0, Math.min(duration - 0.1, fraction * duration))
      update({ elapsed: audio.current.currentTime })
    },
    [duration, mode, update],
  )

  return { status, mode, source: view.source, elapsed: view.elapsed, duration, marks: view.marks, toggle, stop, seekToPanel, seekToFraction }
}
