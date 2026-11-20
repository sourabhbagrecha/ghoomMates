import { Chip } from '../../components/Chip'
import { SearchField } from '../../components/SearchField'
import { useVoice } from '../../components/voice/voiceContext'
import { PersonToggle } from '../Trip/PersonToggle'
import { capitalise, EXPRESSION_CHIPS, type PhotoSearch } from './usePhotoSearch'
import './PhotoSearch.css'

/** The sentence box, floating on the blue header */
export function PhotoSearchField({ search, disabled }: { search: PhotoSearch; disabled?: boolean }) {
  const voice = useVoice()
  return (
    <SearchField
      value={search.query}
      onChange={search.setQuery}
      onSubmit={search.submit}
      placeholder="Try “me smiling at the haldi”"
      label="Search photos by people, smiles or moments"
      maxLength={200}
      disabled={disabled}
      onVoice={() => voice.open(search.query.trim() || 'Show my hiking photos')}
      voiceLabel="Search photos by voice"
    />
  )
}

/** Who's in them, then smiles and scenes: two flat rows that scroll sideways */
export function PhotoFilters({ search }: { search: PhotoSearch }) {
  const { shown, members, sceneTags } = search
  const together = shown.match === 'all'
  // Everyone shows at full strength until someone is picked, then the rest step back
  const picking = shown.userIds.length > 0

  return (
    <section className={`photo-filters${picking ? ' photo-filters--picking' : ''}`} aria-label="Filter photos">
      <div className="photo-filters__people no-scrollbar" role="group" aria-label="Who’s in them">
        {members.map((m) => {
          const ready = m.selfie === 'ready' || m.selfie === undefined
          return (
            <PersonToggle
              key={m.memberId}
              person={m.memberId}
              label="Photos of"
              selected={shown.userIds.includes(m.userId)}
              disabled={!ready}
              hint={ready ? undefined : m.selfie === 'processing' ? 'Reading…' : 'No selfie'}
              onClick={() => search.togglePerson(m.userId)}
            />
          )
        })}
      </div>

      <div className="photo-filters__chips no-scrollbar">
        {shown.userIds.length > 1 && (
          <Chip selected={together} onClick={search.toggleTogether}>
            Together
          </Chip>
        )}
        {EXPRESSION_CHIPS.map((c) => (
          <Chip key={c.expression} selected={shown.expression === c.expression} onClick={() => search.toggleExpression(c.expression)}>
            {c.label}
          </Chip>
        ))}
        {sceneTags.map((tag) => (
          <Chip key={tag} selected={shown.scene === tag} onClick={() => search.toggleScene(tag)}>
            {capitalise(tag)}
          </Chip>
        ))}
      </div>
    </section>
  )
}
