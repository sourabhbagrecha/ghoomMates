import { useRef, useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconCamera from '../../assets/figma/icon-camera-sky-18.svg'
import iconCheck from '../../assets/figma/icon-check.svg'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { TextField } from '../../components/TextField'
import { PEOPLE, SQUAD, type PersonId } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { PersonToggle } from './PersonToggle'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from './tripDetailData'
import { formatINR } from './tripFormat'
import { tripActions } from './tripStore'
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
  const receiptInput = useRef<HTMLInputElement>(null)
  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState('')
  const [paidBy, setPaidBy] = useState<PersonId>('you')
  const [mode, setMode] = useState<SplitMode>('equal')
  const [included, setIncluded] = useState<PersonId[]>(SQUAD)
  const [custom, setCustom] = useState<Partial<Record<PersonId, string>>>({})
  const [category, setCategory] = useState<ExpenseCategory>('food')
  const [receipt, setReceipt] = useState<string | null>(null)

  const total = Number(amount) || 0
  const equalShare = included.length ? total / included.length : 0
  const assigned = SQUAD.reduce((sum, id) => sum + (Number(custom[id]) || 0), 0)
  const remaining = total - assigned
  const splitValid = mode === 'equal' ? included.length > 0 : remaining === 0
  const canSave = total > 0 && title.trim().length > 0 && splitValid

  const back = () => navigate('trip/expenses')

  const toggleIncluded = (id: PersonId) =>
    setIncluded((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : SQUAD.filter((p) => p === id || prev.includes(p))))

  const save = () => {
    const shares = Object.fromEntries(
      mode === 'equal'
        ? included.map((id) => [id, Math.round(equalShare)])
        : SQUAD.filter((id) => Number(custom[id])).map((id) => [id, Number(custom[id])]),
    )
    // TODO: sync to the expenses service and notify the squad
    tripActions.addExpense({
      id: `expense-${Date.now().toString(36)}`,
      title: title.trim(),
      amount: total,
      paidBy,
      category,
      shares,
      receipt,
    })
    back()
  }

  let splitNote: string
  if (mode === 'equal') {
    splitNote = included.length
      ? `${formatINR(total)} ÷ ${included.length} = ${formatINR(equalShare)} each`
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
      eyebrow="Goa Gang · Expenses"
      title="Add expense"
      onBack={back}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="add-expense__body"
      actions={
        <Button variant="primary" disabled={!canSave} onClick={save}>
          Save expense
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
          {total > 0 && mode === 'equal' && included.length
            ? `Split ${included.length} ways · ${formatINR(equalShare)} each`
            : 'Goa Gang · 5 mates'}
        </span>
      </label>

      <TextField label="What for?" placeholder="Cab to Anjuna" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div className="add-expense__group">
        <p className="add-expense__label">Paid by</p>
        <div className="add-expense__people" role="group" aria-label="Paid by">
          {SQUAD.map((id) => (
            <PersonToggle key={id} person={id} label="Paid by" selected={paidBy === id} onClick={() => setPaidBy(id)} />
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
          {SQUAD.map((id) => {
            const isIn = included.includes(id)
            return (
              <li key={id} className="add-expense__share">
                <Avatar person={id} size={34} />
                <span className="add-expense__share-text">
                  <span className="add-expense__share-name">{PEOPLE[id].name}</span>
                  {mode === 'equal' && (
                    <span className="add-expense__share-note">
                      {isIn ? `${id === paidBy ? 'Paid · share' : 'Owes'} ${formatINR(equalShare)}` : 'Not in this one'}
                    </span>
                  )}
                </span>
                {mode === 'equal' ? (
                  <button
                    type="button"
                    className={`add-expense__include${isIn ? ' add-expense__include--on' : ''}`}
                    aria-pressed={isIn}
                    aria-label={`Include ${PEOPLE[id].name}`}
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
                      aria-label={`${PEOPLE[id].name}’s share in rupees`}
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

      {/* TODO: upload the receipt and let GhoomMate read the total from it */}
      <input
        ref={receiptInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) setReceipt(URL.createObjectURL(file))
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
          <span className="add-expense__receipt-title">{receipt ? 'Receipt added' : 'Add receipt photo'}</span>
          <span className="add-expense__receipt-note">{receipt ? 'Tap to retake' : 'Optional · snap the bill'}</span>
        </span>
      </button>
    </OnboardingLayout>
  )
}
