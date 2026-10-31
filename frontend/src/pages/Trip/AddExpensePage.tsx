import { useRef, useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconCamera from '../../assets/figma/icon-camera-sky-18.svg'
import iconCheck from '../../assets/figma/icon-check.svg'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { activeTrip, useActiveTrip } from '../../data/activeTrip'
import { personOf, type PersonId } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { newIdempotencyKey, tripsApi, uploadImage, type NewExpense } from '../../services/tripsService'
import { PersonToggle } from './PersonToggle'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from './tripDetailData'
import { formatINR } from './tripFormat'
import './AddExpensePage.css'

type SplitMode = 'equal' | 'amount'

const SPLIT_MODES: { id: SplitMode; label: string }[] = [
  { id: 'equal', label: 'Equally' },
  { id: 'amount', label: 'By amount' },
]

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 7)
const grouped = (value: string) => (value ? Number(value).toLocaleString('en-IN') : '')

export function AddExpensePage() {
  const navigate = useNavigate()
  const { trip } = useActiveTrip()
  const squad: PersonId[] = trip?.members.map((m) => m.memberId) ?? []
  const receiptInput = useRef<HTMLInputElement>(null)
  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState('')
  const [paidBy, setPaidBy] = useState<PersonId | null>(null)
  const [mode, setMode] = useState<SplitMode>('equal')
  // null = everyone, so mates who join while the form is open are included too
  const [included, setIncluded] = useState<PersonId[] | null>(null)
  const [custom, setCustom] = useState<Partial<Record<PersonId, string>>>({})
  const [category, setCategory] = useState<ExpenseCategory>('food')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [receiptKey, setReceiptKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One key per form, so a retried save can't record the expense twice
  const [idempotencyKey] = useState(newIdempotencyKey)

  const payer = paidBy ?? trip?.memberId ?? null
  const inSplit = included ?? squad
  const total = Number(amount) || 0
  const equalShare = inSplit.length ? total / inSplit.length : 0
  const assigned = squad.reduce((sum, id) => sum + (Number(custom[id]) || 0), 0)
  const remaining = total - assigned
  const splitValid = mode === 'equal' ? inSplit.length > 0 : remaining === 0
  const canSave = !!trip && !!payer && total > 0 && title.trim().length > 0 && splitValid && !uploading && !saving

  const back = () => navigate('trip/expenses')

  const toggleIncluded = (id: PersonId) =>
    setIncluded(inSplit.includes(id) ? inSplit.filter((p) => p !== id) : squad.filter((p) => p === id || inSplit.includes(p)))

  // The receipt goes straight to the bucket as soon as it's picked; the expense only carries its key
  const pickReceipt = async (file: File) => {
    if (!trip) return
    setReceipt(URL.createObjectURL(file))
    setReceiptKey(null)
    setUploading(true)
    setError(null)
    try {
      setReceiptKey((await uploadImage(trip.id, 'receipt', file)).key)
    } catch (err) {
      setReceipt(null)
      setError(err instanceof Error ? err.message : 'Receipt upload failed')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!trip || !payer) return
    // Amounts are whole rupees on screen; the ledger works in paise and splits equally without losing any
    const split: NewExpense['split'] =
      mode === 'equal'
        ? { type: 'equal', participants: inSplit.map((memberId) => ({ memberId })) }
        : {
            type: 'exact',
            participants: squad.filter((id) => Number(custom[id])).map((memberId) => ({ memberId, value: Number(custom[memberId]) * 100 })),
          }
    setSaving(true)
    setError(null)
    try {
      await tripsApi.addExpense(
        trip.id,
        { description: title.trim(), amountPaise: total * 100, payerMemberId: payer, category, split, receiptKey: receiptKey ?? undefined },
        idempotencyKey,
      )
      void activeTrip.refreshMoney()
      back()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the expense')
      setSaving(false)
    }
  }

  let splitNote: string
  if (mode === 'equal') {
    splitNote = inSplit.length
      ? `${formatINR(total)} ÷ ${inSplit.length} = ${formatINR(equalShare)} each`
      : 'Pick at least one person'
  } else if (remaining > 0) {
    splitNote = `${formatINR(remaining)} left to assign`
  } else if (remaining < 0) {
    splitNote = `${formatINR(-remaining)} over the total`
  } else {
    splitNote = `All ${formatINR(total)} assigned`
  }

  return (
    <OnboardingLayout
      eyebrow={`${trip?.groupName ?? 'Trip'} · Expenses`}
      title="Add expense"
      onBack={back}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="add-expense__body"
      actions={
        <Button variant="primary" disabled={!canSave} onClick={save}>
          {saving ? 'Saving…' : uploading ? 'Uploading receipt…' : 'Save expense'}
        </Button>
      }
    >
      <label className="card add-expense__amount">
        <span className="overline">Amount</span>
        <span className="add-expense__amount-field">
          <span className="add-expense__rupee">₹</span>
          <input
            className="add-expense__amount-input"
            inputMode="numeric"
            placeholder="0"
            value={grouped(amount)}
            onChange={(e) => setAmount(digits(e.target.value))}
            // Grows with the number so the ₹ stays snug against it
            style={{ width: `${Math.max(grouped(amount).length, 1) + 0.5}ch` }}
            aria-label="Amount in rupees"
          />
        </span>
        <span className="add-expense__amount-note">
          {total > 0 && mode === 'equal' && inSplit.length
            ? `Split ${inSplit.length} ways · ${formatINR(equalShare)} each`
            : `${trip?.groupName ?? 'Trip'} · ${squad.length} ${squad.length === 1 ? 'mate' : 'mates'}`}
        </span>
      </label>

      <TextField label="What for?" placeholder="Auto to Fateh Sagar" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div className="add-expense__group">
        <p className="add-expense__label">Paid by</p>
        <div className="add-expense__people" role="group" aria-label="Paid by">
          {squad.map((id) => (
            <PersonToggle key={id} person={id} label="Paid by" selected={payer === id} onClick={() => setPaidBy(id)} />
          ))}
        </div>
      </div>

      <div className="add-expense__group">
        <div className="add-expense__label-row">
          <p className="add-expense__label">Split</p>
          <div className="add-expense__modes" role="group" aria-label="How to split">
            {SPLIT_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`add-expense__mode${mode === m.id ? ' add-expense__mode--selected' : ''}`}
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="card add-expense__split">
          {squad.map((id) => {
            const isIn = inSplit.includes(id)
            const { name } = personOf(id)
            return (
              <li key={id} className="add-expense__share">
                <Avatar person={id} size={34} />
                <span className="add-expense__share-text">
                  <span className="add-expense__share-name">{name}</span>
                  {mode === 'equal' && (
                    <span className="add-expense__share-note">
                      {isIn ? `${id === payer ? 'Paid · share' : 'Owes'} ${formatINR(equalShare)}` : 'Not in this one'}
                    </span>
                  )}
                </span>
                {mode === 'equal' ? (
                  <button
                    type="button"
                    className={`add-expense__include${isIn ? ' add-expense__include--on' : ''}`}
                    aria-pressed={isIn}
                    aria-label={`Include ${name}`}
                    onClick={() => toggleIncluded(id)}
                  >
                    {isIn && <img src={iconCheck} alt="" width={12} height={12} />}
                  </button>
                ) : (
                  <span className="add-expense__share-box">
                    ₹
                    <input
                      inputMode="numeric"
                      placeholder="0"
                      value={grouped(custom[id] ?? '')}
                      onChange={(e) => setCustom((prev) => ({ ...prev, [id]: digits(e.target.value) }))}
                      aria-label={`${name}’s share in rupees`}
                    />
                  </span>
                )}
              </li>
            )
          })}
          <li className={`add-expense__split-note${splitValid ? '' : ' add-expense__split-note--pending'}`}>{splitNote}</li>
        </ul>
      </div>

      <div className="add-expense__group">
        <p className="add-expense__label">Category</p>
        <div className="add-expense__chips">
          {EXPENSE_CATEGORIES.map((c) => (
            <Chip key={c.id} selected={c.id === category} onClick={() => setCategory(c.id)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* TODO: let GhoomMate read the total from the receipt */}
      <input
        ref={receiptInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void pickReceipt(file)
          e.target.value = ''
        }}
      />
      <button type="button" className="add-expense__receipt" onClick={() => receiptInput.current?.click()}>
        {receipt ? (
          <img className="add-expense__receipt-preview" src={receipt} alt="Receipt" />
        ) : (
          <span className="add-expense__receipt-icon">
            <img src={iconCamera} alt="" width={18} height={18} />
          </span>
        )}
        <span className="add-expense__receipt-text">
          <span className="add-expense__receipt-title">
            {uploading ? 'Uploading receipt…' : receipt ? 'Receipt added' : 'Add receipt photo'}
          </span>
          <span className="add-expense__receipt-note">{receipt ? 'Tap to retake' : 'Optional · snap the bill'}</span>
        </span>
      </button>
      {error && (
        <p className="add-expense__error" role="alert">
          {error}
        </p>
      )}
    </OnboardingLayout>
  )
}
