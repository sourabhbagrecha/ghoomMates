import type { CSSProperties } from 'react'
import { personOf, type PersonId } from '../data/people'
import './Avatar.css'

type AvatarProps = {
  person: PersonId
  size?: number
}

export function Avatar({ person, size = 40 }: AvatarProps) {
  const { name, initial, color, picture } = personOf(person)
  const style = { '--avatar-size': `${size}px`, '--avatar-color': color } as CSSProperties

  return (
    <span className="avatar" style={style} title={name}>
      {picture ? <img className="avatar__photo" src={picture} alt="" /> : initial}
    </span>
  )
}

type AvatarStackProps = {
  people: PersonId[]
  size: number
  overlap: number
}

export function AvatarStack({ people, size, overlap }: AvatarStackProps) {
  return (
    <span className="avatar-stack" style={{ '--avatar-overlap': `${-overlap}px` } as CSSProperties}>
      {people.map((id) => (
        <Avatar key={id} person={id} size={size} />
      ))}
    </span>
  )
}
