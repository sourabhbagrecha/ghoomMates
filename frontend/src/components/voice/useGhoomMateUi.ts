import { useCallback, useEffect, useRef, useState } from 'react'
import { RpcError, type Room } from 'livekit-client'
import { activeTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { ACTION_RPC_METHOD, UI_RPC_METHOD, type UiAction } from './protocol'
import { dispatchUiEvent, parseUiEvent, type MemoryUpdate, type UiCard, type UiEffects } from './uiEvents'
import { useVoice } from './voiceContext'

export type CardAction = UiAction['type']

const ACTION_ERRORS: Record<string, string> = {
  NOT_PENDING: 'That draft’s already been handled, mate.',
  FORBIDDEN: 'GhoomMate can’t do that one for you.',
  BAD_PAYLOAD: 'GhoomMate didn’t get that. Try again?',
}

/** The agent replies `{ok:true}` or `{ok:false, error}`; anything else counts as fine */
function actionFailure(reply: string): string | null {
  try {
    const value: unknown = JSON.parse(reply)
    if (value && typeof value === 'object' && 'ok' in value && value.ok === false) {
      const code = 'error' in value && typeof value.error === 'string' ? value.error : ''
      return ACTION_ERRORS[code] ?? 'That didn’t go through. Try again?'
    }
  } catch {
    // Not JSON: nothing to report
  }
  return null
}

/**
 * Lets the agent drive the sheet: registers the `ghoomate.ui` RPC on the room and dispatches each event
 * through the registry in uiEvents.ts. `act` sends a card button tap back to the agent (`ghoomate.action`).
 */
export function useGhoomMateUi(
  room: Room,
  agentIdentity: string | undefined,
  /** The sheet moves out of the way for a screen the agent opens, and comes back for a new card; `end` closes the call */
  sheet: { minimize: () => void; expand: () => void; end: () => void },
) {
  const navigate = useNavigate()
  const { notify } = useVoice()
  const { minimize, expand, end } = sheet
  const [card, setCard] = useState<UiCard | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [memoryUpdate, setMemoryUpdate] = useState<MemoryUpdate | null>(null)
  const [pending, setPending] = useState<CardAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // The RPC handler is registered once per room, so it reads the latest effects through a ref
  const fx = useRef<UiEffects | null>(null)
  useEffect(() => {
    fx.current = {
      setCard: (update) => {
        setActionError(null)
        setCard(update)
      },
      show: expand,
      setWorking,
      setMemoryUpdate,
      notify,
      endCall: (message) => {
        end()
        notify({ message })
      },
      navigate: (route) => {
        navigate(route)
        minimize()
      },
      refreshMoney: () => void activeTrip.refreshMoney(),
      refreshItinerary: () => void activeTrip.loadItinerary(),
    }
  }, [navigate, notify, expand, minimize, end])

  // Only the GhoomMate agent may drive the sheet
  const agent = useRef(agentIdentity)
  useEffect(() => {
    agent.current = agentIdentity
  }, [agentIdentity])

  useEffect(() => {
    room.registerRpcMethod(UI_RPC_METHOD, async ({ payload, callerIdentity }) => {
      if (agent.current && callerIdentity !== agent.current) return JSON.stringify('forbidden')
      const event = parseUiEvent(payload)
      if (!event || !fx.current) return JSON.stringify('unknown')
      dispatchUiEvent(event, fx.current)
      return JSON.stringify('ok')
    })
    return () => room.unregisterRpcMethod(UI_RPC_METHOD)
  }, [room])

  const act = useCallback(
    async (action: UiAction) => {
      if (!agentIdentity) {
        setActionError('GhoomMate isn’t here right now. Give it a sec?')
        return
      }
      setPending(action.type)
      setActionError(null)
      try {
        const reply = await room.localParticipant.performRpc({
          destinationIdentity: agentIdentity,
          method: ACTION_RPC_METHOD,
          payload: JSON.stringify(action),
          // Saving can take up to the agent's 15s backend timeout; don't report a failure before then
          responseTimeout: 20_000,
        })
        const failure = actionFailure(reply)
        if (failure) {
          setActionError(failure)
          return
        }
        // The agent also pushes a cancelled event; hide the card now so the tap feels instant
        if (action.type === 'cancel') setCard((c) => (c?.kind === 'expense' && c.draft.id === action.draftId ? null : c))
        if (action.type === 'plan.cancel') setCard((c) => (c?.kind === 'dayPlan' && c.plan.id === action.planId ? null : c))
      } catch (err) {
        const reason = err instanceof RpcError && err.message ? ` (${err.message})` : ''
        setActionError(`Couldn’t reach GhoomMate${reason}. Try again?`)
      } finally {
        setPending(null)
      }
    },
    [room, agentIdentity],
  )

  return { card, pending, actionError, act, working, memoryUpdate }
}
