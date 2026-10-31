import { useState } from 'react'
import { Button, LinkButton } from '../../components/Button'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { PermissionRow } from '../../components/PermissionRow'
import { PERMISSIONS, type PermissionId } from './onboardingData'
import './PermissionsPage.css'

type PermissionsPageProps = {
  onBack: () => void
  onDone: () => void
}

export function PermissionsPage({ onBack, onDone }: PermissionsPageProps) {
  // TODO: request the real OS/browser permission in onAllow once the native shell exists
  const [allowed, setAllowed] = useState<Set<PermissionId>>(() => new Set())

  return (
    <OnboardingLayout
      eyebrow="Almost there"
      title="Turn on the good stuff"
      subtitle="GhoomMate works best with these. Change them anytime in Settings."
      onBack={onBack}
      bodyClassName="permissions__body"
      actions={
        <>
          <Button variant="primary" onClick={onDone}>
            Let’s go
          </Button>
          <LinkButton onClick={onDone}>Maybe later</LinkButton>
        </>
      }
    >
      {PERMISSIONS.map((p) => (
        <PermissionRow
          key={p.id}
          icon={p.icon}
          title={p.title}
          description={p.description}
          allowed={allowed.has(p.id)}
          onAllow={() => setAllowed((prev) => new Set(prev).add(p.id))}
        />
      ))}
      <div className="permissions__tip">
        <GhoomMateTip>Try it now: say “Hey GhoomMate, plan Day 3”.</GhoomMateTip>
      </div>
    </OnboardingLayout>
  )
}
