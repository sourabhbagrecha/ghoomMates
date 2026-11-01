import { useEffect, useState } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { Skeleton } from '../../components/states/Skeleton'
import { useNavigate } from '../../hooks/navigation'
import { makersApi, type Craft } from '../../services/makersService'
import './MakersSection.css'

/**
 * “Makers of Udaipur” on the Explore tab: a row of the living crafts, each opening the makers who practise it.
 * Hides itself if the crafts can't be loaded, so Explore never shows a hole.
 */
export function MakersSection() {
  const navigate = useNavigate()
  const [crafts, setCrafts] = useState<Craft[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let stale = false
    makersApi
      .crafts()
      .then((items) => !stale && setCrafts(items))
      .catch(() => !stale && setFailed(true))
    return () => {
      stale = true
    }
  }, [])

  if (failed && !crafts) return null

  return (
    <>
      <SectionHeader
        title="Makers of Udaipur"
        action={
          <button type="button" className="text-link" onClick={() => navigate('trip/explore/makers')}>
            See all
          </button>
        }
      />
      <div className="makers-crafts no-scrollbar">
        {crafts
          ? crafts.map((craft) => (
              <article key={craft.id} className="makers-craft">
                <button
                  type="button"
                  className="makers-craft__open"
                  aria-label={`${craft.name}: ${craft.makerCount ?? 0} ${craft.makerCount === 1 ? 'maker' : 'makers'}`}
                  onClick={() => navigate(`trip/explore/makers?craft=${craft.id}`)}
                />
                <div className="makers-craft__cover">
                  <img src={craft.cover} alt="" width={164} height={104} loading="lazy" />
                  {craft.gi && <span className="makers-craft__badge">GI tag</span>}
                </div>
                <div className="makers-craft__body">
                  <h3 className="makers-craft__name">{craft.name}</h3>
                  <p className="makers-craft__hindi" lang="hi">
                    {craft.hindi}
                  </p>
                  <p className="makers-craft__count">
                    {craft.makerCount ?? 0} {craft.makerCount === 1 ? 'maker' : 'makers'}
                  </p>
                </div>
              </article>
            ))
          : [0, 1, 2].map((i) => (
              <div key={i} className="makers-craft makers-craft--loading" aria-hidden="true">
                <Skeleton variant="card" height={104} radius={0} />
                <div className="makers-craft__body">
                  <Skeleton height={14} width="80%" />
                  <Skeleton height={12} width="50%" />
                </div>
              </div>
            ))}
      </div>
      <p className="makers-caption">
        {crafts ? `${crafts.length} living crafts.` : 'Living crafts.'} Book a workshop for the whole squad and the money goes straight to the maker.
      </p>
    </>
  )
}
