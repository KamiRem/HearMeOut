import type { RoomMembership } from '@hear-me-out/shared'
import { LobbyControls, type LobbyActions } from '../components/LobbyControls'
import { LeaveRoomButton } from '../components/LeaveRoomButton'

interface LobbyPageProps extends LobbyActions {
  membership: RoomMembership
  busy: boolean
  connected: boolean
  leaveRoom: () => Promise<void> | undefined
}

export function LobbyPage({ membership, busy, connected, leaveRoom, setReady, updateSettings, startGame }: LobbyPageProps) {
  const { room, playerId } = membership
  const isCreator = room.hostPlayerId === playerId

  return (
    <section className="connection-card room-card" aria-labelledby="room-title">
      <div className="card-heading">
        <p className="eyebrow">Le gang </p>
        <h1 id="room-title" className="room-title">Le salon est ouvert.</h1>
        <p>Transmets ce code à tes amis pour qu’ils te rejoignent.</p>
        <strong className="room-code" aria-label={`Code du salon : ${room.code}`}>{room.code}</strong>
      </div>
      <div className="players-heading">
        <h2>Autour du gâteau</h2>
        <p role="status">{room.players.length} / {room.capacity} joueurs</p>
      </div>
      <ul className="player-list" aria-label="Joueurs connectés">
        {room.players.map((player) => (
          <li key={player.id}>
            <span className="player-avatar" aria-hidden="true">{Array.from(player.nickname)[0]?.toUpperCase()}</span>
            <span className="player-name">{player.nickname}</span>
            {player.id === room.hostPlayerId && <span className="host-badge">Host</span>}
            {player.id === playerId && <span className="you-badge">toi</span>}
            <span className={`ready-badge ${player.isReady && player.isConnected ? 'is-ready' : ''}`}>
              {!player.isConnected ? 'Reconnexion…' : player.isReady ? 'Prêt' : 'Pas prêt'}
            </span>
          </li>
        ))}
      </ul>
      {room.players.length === 1 && <p className="field-hint">Tu es le premier arrivé. Invites tes potes !</p>}
      <LobbyControls key={`${room.id}:${room.settingsRevision}`} membership={membership} disabled={busy || !connected}
        setReady={setReady} updateSettings={updateSettings} startGame={startGame} />
      <LeaveRoomButton isHost={isCreator} disabled={busy || !connected} leaveRoom={leaveRoom} />
    </section>
  )
}
