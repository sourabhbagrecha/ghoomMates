import { useEffect, useState, type FormEvent } from 'react'
import { Button, LinkButton } from '../../components/Button'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { Toast } from '../../components/Toast'
import { VIBE_AXES, type VibeAxis } from '../../data/vibe'
import { useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import {
  MAX_NOTE_LENGTH,
  MAX_NOTES,
  loadMemory,
  refreshMemory,
  ruleLabels,
  saveMemory,
  type GhoomateMemory,
  type MemoryNote,
} from '../../services/ghoomateMemory'
import { Switch } from './ProfileParts'
import './GhoomMateMemoryPage.css'

type Draft = Omit<MemoryNote, 'at'>
type Lean = 'like' | 'avoid' | undefined

/** When a note was added or edited */
const stamp = () => new Date().toISOString()

/** "What GhoomMate remembers": the notes it uses to pick experiences and plan your days. View, edit, add, remove. */
export function GhoomMateMemoryPage() {
  const navigate = useNavigate()
  const [memory, setMemory] = useState<GhoomateMemory>(loadMemory)
  // Index of the note being edited, 'new' while adding, null otherwise
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, showToast] = useToast()

  // GhoomMate may have added notes in a chat since this device last saw your profile
  useEffect(() => {
    refreshMemory()
      .then(setMemory)
      .catch(() => {})
  }, [])

  const persist = async (notes: MemoryNote[], message: string) => {
    setSaving(true)
    setError(null)
    try {
      setMemory(await saveMemory({ notes }))
      setEditing(null)
      showToast(message)
    } catch {
      setError('Couldn’t save that. Try again?')
    } finally {
      setSaving(false)
    }
  }

  const add = (draft: Draft) =>
    void persist([...memory.notes.filter((n) => n.text.toLowerCase() !== draft.text.toLowerCase()), { ...draft, at: stamp() }], 'Saved')
  const update = (index: number, draft: Draft) =>
    void persist(memory.notes.map((n, i) => (i === index ? { ...draft, at: stamp() } : n)), 'Updated')
  const remove = (index: number) => void persist(memory.notes.filter((_, i) => i !== index), 'Removed')

  const full = memory.notes.length >= MAX_NOTES

  return (
    <>
      <OnboardingLayout
        eyebrow="Profile · GhoomMate"
        title="GhoomMate remembers"
        onBack={() => navigate('profile')}
        bodyClassName="memory__body"
      >
        <section className="card memory__intro">
          <GhoomMateAvatar size={44} ring={2} />
          <p>
            I use these to pick experiences and plan your days. Tell me things in a chat (“I’m not a morning person”), or add
            and edit them here.
          </p>
        </section>

        {error && (
          <p className="memory__error" role="alert">
            {error}
          </p>
        )}

        {memory.notes.length === 0 && editing !== 'new' && (
          <p className="memory__empty">Nothing yet. Add something GhoomMate should keep in mind.</p>
        )}

        <ul className="memory__list">
          {memory.notes.map((note, index) =>
            editing === index ? (
              <li key={`${note.text}-${note.at}`}>
                <NoteForm initial={note} submitLabel="Save" saving={saving} onSubmit={(d) => update(index, d)} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={`${note.text}-${note.at}`} className="list-card memory__note">
                <div className="memory__note-text">
                  <strong>{note.text}</strong>
                  {ruleLabels(note).length > 0 && (
                    <span className="memory__rules">
                      {ruleLabels(note).map((r) => (
                        <span key={r} className="tag">
                          {r}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <div className="memory__note-actions">
                  <LinkButton disabled={saving} onClick={() => setEditing(index)}>
                    Edit
                  </LinkButton>
                  <LinkButton disabled={saving} onClick={() => remove(index)}>
                    Remove
                  </LinkButton>
                </div>
              </li>
            ),
          )}
        </ul>

        {editing === 'new' ? (
          <NoteForm submitLabel="Add" saving={saving} onSubmit={add} onCancel={() => setEditing(null)} />
        ) : (
          <Button variant="outline" disabled={saving || full || editing !== null} onClick={() => setEditing('new')}>
            {full ? `That’s ${MAX_NOTES}; remove one to add more` : 'Add something'}
          </Button>
        )}
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}

type NoteFormProps = {
  initial?: MemoryNote
  submitLabel: string
  saving: boolean
  onSubmit: (draft: Draft) => void
  onCancel: () => void
}

/** A note and its optional rules: no early starts, a budget, vibes to like or avoid */
function NoteForm({ initial, submitLabel, saving, onSubmit, onCancel }: NoteFormProps) {
  const [text, setText] = useState(initial?.text ?? '')
  const [noEarlyStarts, setNoEarlyStarts] = useState(!!initial?.noEarlyStarts)
  const [budget, setBudget] = useState(initial?.maxPriceRupees ? String(initial.maxPriceRupees) : '')
  const [lean, setLean] = useState<Partial<Record<VibeAxis, Lean>>>(() => ({
    ...Object.fromEntries((initial?.likes ?? []).map((a) => [a, 'like'])),
    ...Object.fromEntries((initial?.avoid ?? []).map((a) => [a, 'avoid'])),
  }))

  // Tap cycles: neutral → like → avoid → neutral
  const cycle = (axis: VibeAxis) =>
    setLean((l) => ({ ...l, [axis]: l[axis] === undefined ? 'like' : l[axis] === 'like' ? 'avoid' : undefined }))

  const price = Number(budget)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    const pick = (want: Lean) => VIBE_AXES.map((a) => a.id).filter((id) => lean[id] === want)
    onSubmit({
      text: text.trim(),
      ...(noEarlyStarts ? { noEarlyStarts: true } : {}),
      ...(Number.isFinite(price) && price > 0 ? { maxPriceRupees: Math.round(price) } : {}),
      ...(pick('like').length ? { likes: pick('like') } : {}),
      ...(pick('avoid').length ? { avoid: pick('avoid') } : {}),
    })
  }

  return (
    <form className="card memory__form" onSubmit={submit}>
      <TextField
        label="Something GhoomMate should know"
        placeholder="e.g. vegetarian, not a morning person"
        value={text}
        maxLength={MAX_NOTE_LENGTH}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="memory__row">
        <span>
          <strong>No early starts</strong>
          <span>Skip anything before 8 AM</span>
        </span>
        <Switch on={noEarlyStarts} label="No early starts" onChange={setNoEarlyStarts} />
      </div>
      <TextField
        label="Budget per experience (₹, optional)"
        inputMode="numeric"
        placeholder="e.g. 1500"
        value={budget}
        onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ''))}
      />
      <div className="memory__vibes">
        <p className="overline">Vibes · tap to like, again to avoid</p>
        <div className="memory__chips">
          {VIBE_AXES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`memory__chip${lean[id] ? ` memory__chip--${lean[id]}` : ''}`}
              aria-pressed={lean[id] !== undefined}
              onClick={() => cycle(id)}
            >
              {lean[id] === 'like' ? `Likes ${label.toLowerCase()}` : lean[id] === 'avoid' ? `Avoids ${label.toLowerCase()}` : label}
            </button>
          ))}
        </div>
      </div>
      <div className="memory__form-actions">
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving || !text.trim()}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
