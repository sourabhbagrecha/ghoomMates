import type { CSSProperties } from 'react'
import { PEOPLE, type PersonId } from '../data/people'
import './Avatar.css'

type AvatarProps = {
  person: PersonId
  size?: number
}

export function Avatar({ person, size = 40 }: AvatarProps) {
  const { name, initial, color } = PEOPLE[person]
  const style = { '--avatar-size': `${size}px`, '--avatar-color': color } as CSSProperties

  return (
    <span className="avatar" style={style} title={name}>
      {initial}
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
