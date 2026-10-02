import type { RoomMembership } from '@hear-me-out/shared'
import { GamePhasePanel } from '../components/GamePhasePanel'
import { RevealPanel } from '../components/RevealPanel'
import { SubmissionPanel } from '../components/SubmissionPanel'
import { LeaveRoomButton } from '../components/LeaveRoomButton'
import { PlayerAvatar } from '../components/PlayerAvatar'
import type { ServerClockSample } from '../hooks/useCountdown'

interface GamePageProps {
  membership: RoomMembership
  busy: boolean
  uploading: boolean
  connected: boolean
  clockSample: ServerClockSample | null
  submitImage: (file: File) => Promise<void> | undefined
  leaveRoom: () => Promise<void> | undefined
  reveal: (action: 'start' | 'next') => Promise<void> | undefined
}

export function GamePage({ membership, busy, uploading, connected, clockSample, submitImage, leaveRoom, reveal }: GamePageProps) {
  const { room, playerId } = membership
  const state = room.state
  // Routing owns access; this guard also prevents an inconsistent frame during a snapshot update.
  if (state.phase === 'LOBBY') return null

  const phase = state.phase === 'SUBMISSION'
    ? <SubmissionPanel key={state.roundId} state={state} ownSubmission={membership.ownSubmission}
        progress={room.submissionProgress} clockSample={clockSample} disabled={busy || !connected}
        uploading={uploading} submitImage={submitImage} />
    : state.phase === 'WAITING' || state.phase === 'REVEAL' || state.phase === 'ROUND_RESULTS'
      ? <RevealPanel key={state.roundId} room={room} isHost={room.hostPlayerId === playerId}
          disabled={busy || !connected} reveal={reveal} />
      : <GamePhasePanel state={state} />

  return (
    <div className="game-page mx-auto flex min-h-[calc(100svh-12rem)] max-w-5xl flex-col">
      <div className="game-stage grid flex-1 items-center pb-10" aria-label="Partie en cours">{phase}</div>
      <section className="game-presence border-t border-base-content/10 pt-5" aria-label="Joueurs de la partie">
        <p className="mb-4 text-xs text-base-content/65">{room.players.filter((player) => player.isConnected).length} / {room.players.length} joueurs connectés</p>
        <ul className="flex flex-wrap gap-3">
          {room.players.map((player) => <li key={player.id} className="flex max-w-full items-center gap-3 rounded-box bg-base-200 py-2 pr-4 pl-2 text-sm">
            <PlayerAvatar nickname={player.nickname} connected={player.isConnected} />
            <span className="min-w-0 break-words">{player.nickname}{player.id === playerId ? ' (toi)' : ''}
              {!player.isConnected && <span className="block text-xs text-warning">Reconnexion…</span>}
            </span>
          </li>)}
        </ul>
      </section>
      <LeaveRoomButton isHost={room.hostPlayerId === playerId} inGame disabled={busy || !connected} leaveRoom={leaveRoom} />
    </div>
  )
}
