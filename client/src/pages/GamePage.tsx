import type { RoomMembership } from '@hear-me-out/shared'
import { GamePhasePanel } from '../components/GamePhasePanel'
import { SubmissionPanel } from '../components/SubmissionPanel'
import { LeaveRoomButton } from '../components/LeaveRoomButton'
import type { ServerClockSample } from '../hooks/useCountdown'

interface GamePageProps {
  membership: RoomMembership
  busy: boolean
  uploading: boolean
  connected: boolean
  clockSample: ServerClockSample | null
  submitImage: (file: File) => Promise<void> | undefined
  leaveRoom: () => Promise<void> | undefined
}

export function GamePage({ membership, busy, uploading, connected, clockSample, submitImage, leaveRoom }: GamePageProps) {
  const { room, playerId } = membership
  const state = room.state
  // Routing owns access; this guard also prevents an inconsistent frame during a snapshot update.
  if (state.phase === 'LOBBY') return null

  const phase = state.phase === 'SUBMISSION'
    ? <SubmissionPanel key={state.roundId} state={state} ownSubmission={membership.ownSubmission}
        progress={room.submissionProgress} clockSample={clockSample} disabled={busy || !connected}
        uploading={uploading} submitImage={submitImage} />
    : <GamePhasePanel state={state} submitted={room.submissionProgress?.submitted ?? 0} />

  return (
    <div className="game-page">
      <div className="game-stage" aria-label="Partie en cours">{phase}</div>
      <section className="game-presence" aria-label="Joueurs de la partie">
        <p>{room.players.filter((player) => player.isConnected).length} / {room.players.length} joueurs connectés</p>
        <ul>
          {room.players.map((player) => <li key={player.id} className={player.isConnected ? '' : 'is-offline'}>
            {player.nickname}{player.id === playerId ? ' (toi)' : ''}{!player.isConnected ? ' · reconnexion…' : ''}
          </li>)}
        </ul>
      </section>
      <LeaveRoomButton isHost={room.hostPlayerId === playerId} inGame disabled={busy || !connected} leaveRoom={leaveRoom} />
    </div>
  )
}
