import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconSparkles from '../../assets/icons/icon-sparkles-white.svg'
import { CrowdChip } from '../../components/crowd/Crowd'
import { EmptyState } from '../../components/states/EmptyState'
import type { OpsHotspot, PartnerAdvisory } from '../../services/opsService'
import { formatWindow, numberText, squadsText } from './opsData'

type HotspotListProps = {
  hotspots: OpsHotspot[]
  /** Advisories already live on this day */
  advisories: PartnerAdvisory[]
  onOpen: (hotspot: OpsHotspot) => void
  onDraft: (hotspot: OpsHotspot) => void
}

/** An advisory for the same site that overlaps the window */
const covering = (hotspot: OpsHotspot, advisories: PartnerAdvisory[]) =>
  advisories.find((a) => a.siteId === hotspot.siteId && a.startMinutes < hotspot.endMinutes && a.endMinutes > hotspot.startMinutes)

/** The windows where squads are heading into a crowd: the places to nudge, with a one-tap way to draft the advisory */
export function HotspotList({ hotspots, advisories, onOpen, onDraft }: HotspotListProps) {
  if (!hotspots.length) {
    return (
      <EmptyState
        size="compact"
        headingLevel={3}
        title="No crunch expected"
        text="No site is expected to be busy with squads heading into it. Check back as plans change."
      />
    )
  }

  return (
    <ul className="ops-hot">
      {hotspots.map((h) => {
        const live = covering(h, advisories)
        return (
          <li key={h.siteId} className="list-card ops-hot__item">
            <button
              type="button"
              className="ops-hot__open"
              aria-label={`Open ${h.siteName}, ${formatWindow(h.startMinutes, h.endMinutes)}`}
              onClick={() => onOpen(h)}
            />
            <div className="ops-hot__info">
              <p className="ops-hot__when">
                {formatWindow(h.startMinutes, h.endMinutes)}
                <CrowdChip label={h.label} />
              </p>
              <h3 className="ops-hot__name">{h.siteName}</h3>
              <p className="ops-hot__people">
                {squadsText(h.squads)} · about {numberText(h.people)} people
              </p>
            </div>
            {live ? (
              <span className="ops-hot__live">
                <img src={iconCheck} alt="" width={12} height={12} />
                Advisory live
              </span>
            ) : (
              <button type="button" className="pill-button ops-hot__draft" onClick={() => onDraft(h)}>
                <img src={iconSparkles} alt="" width={14} height={14} />
                Draft
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
