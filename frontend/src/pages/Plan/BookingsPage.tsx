import { useRef, useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconBed from '../../assets/figma/icon-bed-primary.svg'
import iconCalendar from '../../assets/figma/icon-calendar-sky.svg'
import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconPaperclip from '../../assets/figma/icon-paperclip-sky.svg'
import iconPlus from '../../assets/figma/icon-plus.svg'
import iconUpload from '../../assets/figma/icon-upload-primary.svg'
import { Avatar, AvatarStack } from '../../components/Avatar'
import { Button, LinkButton } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { TextField } from '../../components/TextField'
import { PEOPLE, type PersonId } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import {
  BOOKING_KINDS,
  bookingIcon,
  rupees,
  STAY_HOLD,
  TRIP,
  VOTES,
  type Booking,
  type BookingKind,
  type VoteOption,
} from './planData'
import { StatusTag } from './PlanParts'
import type { PlanState } from './planState'
import './BookingsPage.css'

type BookingsPageProps = {
  plan: PlanState
  onBack: () => void
}

export function BookingsPage({ plan, onBack }: BookingsPageProps) {
  const [adding, setAdding] = useState(false)
  const stay = plan.result('stay')
  const stayPick = stay.complete ? stay.leader : null

  return (
    <OnboardingLayout
      eyebrow={`${TRIP.dates} · ${TRIP.place}`}
      title="Bookings"
      onBack={onBack}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="plan-page__body"
    >
      <SectionHeader title="Stay" />
      {stayPick ? <StayCard option={stayPick} plan={plan} /> : <StayPending />}

      <SectionHeader
        title="Transport and more"
        action={
          !adding && (
            <button type="button" className="pill-button" onClick={() => setAdding(true)}>
              <img src={iconPlus} alt="" width={14} height={14} />
              Add
            </button>
          )
        }
      />
      {adding && (
        <AddBookingForm
          onAdd={(booking) => {
            plan.addBooking(booking)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      <ul className="bookings-list">
        {plan.bookings.map((b) => (
          <BookingCard key={b.id} booking={b} plan={plan} />
        ))}
      </ul>
    </OnboardingLayout>
  )
}

function StayPending() {
  const navigate = useNavigate()
  return (
    <section className="card bookings-pending">
      <span className="plan-icon-tile">
        <img src={iconBed} alt="" width={20} height={20} />
      </span>
      <span className="bookings-pending__text">
        <span className="bookings-pending__title">Waiting on the stay vote</span>
        <span className="bookings-pending__meta">
          {VOTES.stay.options.length} options · Closes {VOTES.stay.closes} · {PEOPLE[STAY_HOLD.heldBy].name} books the
          winner
        </span>
      </span>
      <button type="button" className="pill-button" onClick={() => navigate('plan/vote/stay')}>
        Vote now
      </button>
    </section>
  )
}

function StayCard({ option, plan }: { option: VoteOption; plan: PlanState }) {
  return (
    <section className="card bookings-stay" aria-label={`Stay: ${option.name}`}>
      <div className="bookings-stay__cover">
        <img src={option.photo} alt="" width={116} height={110} />
      </div>
      <div className="bookings-stay__head">
        <h3 className="bookings-stay__name">{option.name}</h3>
        <StatusTag tone="action">On hold</StatusTag>
      </div>
      <p className="bookings-meta">
        <img src={iconCalendar} alt="" width={14} height={14} />
        {STAY_HOLD.dates}
      </p>
      <p className="bookings-meta">
        {STAY_HOLD.rooms} · {option.price}
      </p>
      <Code label="Hold ref" code={STAY_HOLD.code} />
      <p className="plan-feedback">
        <Avatar person={STAY_HOLD.heldBy} size={18} />
        {PEOPLE[STAY_HOLD.heldBy].name}’s holding it · {STAY_HOLD.cancellation}
      </p>
      <TicketUpload bookingId="stay" label="Upload confirmation" plan={plan} />
    </section>
  )
}

function BookingCard({ booking: b, plan }: { booking: Booking; plan: PlanState }) {
  return (
    <li className="card booking">
      <div className="booking__head">
        <span className="plan-icon-tile">
          <img src={bookingIcon(b.kind)} alt="" width={20} height={20} />
        </span>
        <span className="booking__title-group">
          <span className="booking__title">{b.title}</span>
          <span className="booking__details">{b.details}</span>
        </span>
        {b.status === 'booked' ? <StatusTag tone="done">Booked</StatusTag> : <StatusTag tone="waiting">To book</StatusTag>}
      </div>
      <p className="bookings-meta">
        <img src={iconClock} alt="" width={14} height={14} />
        {b.when}
      </p>
      {b.code && <Code label={b.kind === 'bus' ? 'PNR' : 'Confirmation'} code={b.code} />}
      {b.paidBy && b.share ? <Payment booking={b} paidBy={b.paidBy} share={b.share} plan={plan} /> : null}
      {b.status === 'to-book' && b.owner && (
        <p className="plan-feedback">
          <Avatar person={b.owner} size={18} />
          {b.owner === 'you' ? 'You’re on it' : `${PEOPLE[b.owner].name}’s on it`}
          {b.note && ` · ${b.note}`}
        </p>
      )}
      {b.status === 'booked' && <TicketUpload bookingId={b.id} label="Upload ticket" plan={plan} />}
    </li>
  )
}

function Code({ label, code }: { label: string; code: string }) {
  return (
    <p className="bookings-code">
      <span className="overline">{label}</span>
      <span className="bookings-code__value">{code}</span>
    </p>
  )
}

type PaymentProps = {
  booking: Booking
  paidBy: PersonId
  share: number
  plan: PlanState
}

function Payment({ booking, paidBy, share, plan }: PaymentProps) {
  const settled = plan.settled[booking.id] ?? []
  const youSettled = paidBy === 'you' || settled.includes('you')

  return (
    <div className="booking__payment">
      <AvatarStack people={settled} size={18} overlap={6} />
      <span className="booking__payment-text">
        {PEOPLE[paidBy].name} paid · {rupees(share)} each · {settled.length}/{TRIP.members.length} squared up
      </span>
      {!youSettled && (
        <button type="button" className="pill-button" onClick={() => plan.payShare(booking.id)}>
          Pay {rupees(share)}
        </button>
      )}
    </div>
  )
}

type TicketUploadProps = {
  bookingId: string
  label: string
  plan: PlanState
}

function TicketUpload({ bookingId, label, plan }: TicketUploadProps) {
  const input = useRef<HTMLInputElement>(null)
  const file = plan.tickets[bookingId]

  if (file) {
    return (
      <p className="plan-feedback" role="status">
        <img src={iconPaperclip} alt="" width={14} height={14} />
        <span className="booking__file">{file}</span>· Added
      </p>
    )
  }

  return (
    <>
      <button type="button" className="booking__upload" onClick={() => input.current?.click()}>
        <img src={iconUpload} alt="" width={16} height={16} />
        {label}
      </button>
      {/* TODO: upload to trip storage; for now we only keep the file name */}
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) plan.addTicket(bookingId, picked.name)
        }}
      />
    </>
  )
}

type AddBookingFormProps = {
  onAdd: (booking: Booking) => void
  onCancel: () => void
}

function AddBookingForm({ onAdd, onCancel }: AddBookingFormProps) {
  const [kind, setKind] = useState<BookingKind>('activity')
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const kindLabel = BOOKING_KINDS.find((k) => k.id === kind)?.label

  return (
    <form
      className="card bookings-add"
      aria-label="Add a booking"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        // TODO: save to the planning service
        onAdd({
          id: `extra-${Date.now()}`,
          kind,
          title: title.trim(),
          details: `${kindLabel} · Added by you`,
          when: when.trim() || 'Date to be decided',
          summary: when.trim() || 'Added by you',
          status: 'to-book',
          owner: 'you',
        })
      }}
    >
      <p className="overline">New booking</p>
      <div className="bookings-add__kinds">
        {BOOKING_KINDS.map((k) => (
          <Chip key={k.id} selected={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </Chip>
        ))}
      </div>
      <TextField
        label="What is it?"
        placeholder="Paragliding at Solang"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <TextField label="When?" placeholder="Mon 14 Dec, 10:00 AM" value={when} onChange={(e) => setWhen(e.target.value)} />
      <Button type="submit" variant="primary" disabled={!title.trim()}>
        Add booking
      </Button>
      <LinkButton onClick={onCancel}>Cancel</LinkButton>
    </form>
  )
}
