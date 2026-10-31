import { useState } from 'react'
import iconChevronDown from '../../assets/figma/icon-chevron-down-muted.svg'
import iconChevron from '../../assets/figma/icon-chevron-right-muted.svg'
import iconMail from '../../assets/figma/icon-mail-primary.svg'
import iconSearch from '../../assets/figma/icon-search.svg'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { Toast } from '../../components/Toast'
import { useEntryRoute, useNavigate } from '../../hooks/navigation'
import { useToast } from '../../hooks/useToast'
import { APP_VERSION, FAQS, SUPPORT_EMAIL } from './profileData'
import './HelpPage.css'

export function HelpPage() {
  const navigate = useNavigate()
  // Help opens from Profile, Settings, or the sign-in screens before there's an account
  const entry = useEntryRoute('profile', 'profile')
  const backTo = entry === 'sign-in' || entry === 'verify' ? entry : 'profile'
  const [toast, showToast] = useToast()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const term = query.trim().toLowerCase()
  const results = term ? FAQS.filter((f) => `${f.question} ${f.answer}`.toLowerCase().includes(term)) : FAQS

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      <OnboardingLayout
        eyebrow="Profile · Support"
        title="Help & FAQ"
        onBack={() => navigate(backTo)}
        headerExtra={
          <div className="help__search-row">
            <label className="help__search">
              <img src={iconSearch} alt="" width={18} height={18} />
              <input
                type="search"
                placeholder="Search splits, UPI, photos…"
                aria-label="Search help"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        }
        bodyClassName="help__body"
      >
        <SectionHeader
          title={term ? 'Results' : 'Common questions'}
          action={
            term ? (
              <button type="button" className="text-link" onClick={() => setQuery('')}>
                Clear
              </button>
            ) : undefined
          }
        />
        <p className="help__count" role="status">
          {term ? `${results.length} ${results.length === 1 ? 'answer' : 'answers'} for “${query.trim()}”` : ''}
        </p>

        {results.length ? (
          <ul className="help__faqs">
            {results.map((f) => {
              const expanded = open.has(f.id)
              return (
                <li key={f.id} className={`help__faq${expanded ? ' help__faq--open' : ''}`}>
                  <h3>
                    <button
                      type="button"
                      className="help__question"
                      aria-expanded={expanded}
                      aria-controls={`help-answer-${f.id}`}
                      onClick={() => toggle(f.id)}
                    >
                      {f.question}
                      <img className="help__chevron" src={iconChevronDown} alt="" width={14} height={14} />
                    </button>
                  </h3>
                  <p id={`help-answer-${f.id}`} className="help__answer" hidden={!expanded}>
                    {f.answer}
                  </p>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="card help__empty">
            <p className="help__empty-title">Nothing on that yet</p>
            <p className="help__empty-text">Try another word, or ask GhoomMate or our team below.</p>
          </div>
        )}

        <SectionHeader title="Still stuck?" />
        <ul className="help__contacts">
          <li>
            {/* TODO: open the GhoomMate chat with a support context */}
            <button type="button" className="list-card help__contact" onClick={() => showToast('Coming soon')}>
              <GhoomMateAvatar size={44} ring={2} />
              <span className="help__contact-text">
                <strong>Chat with GhoomMate</strong>
                <span>Instant answers, any time</span>
              </span>
              <img src={iconChevron} alt="" width={16} height={16} />
            </button>
          </li>
          <li>
            {/* TODO: mailto: with device and app version filled in */}
            <button
              type="button"
              className="list-card help__contact"
              onClick={() => showToast(`Write to us at ${SUPPORT_EMAIL}`)}
            >
              <span className="help__contact-icon">
                <img src={iconMail} alt="" width={20} height={20} />
              </span>
              <span className="help__contact-text">
                <strong>Email support</strong>
                <span>{SUPPORT_EMAIL} · replies within a day</span>
              </span>
              <img src={iconChevron} alt="" width={16} height={16} />
            </button>
          </li>
        </ul>

        <p className="onboarding__footnote">{APP_VERSION}</p>
      </OnboardingLayout>
      <Toast message={toast} />
    </>
  )
}
