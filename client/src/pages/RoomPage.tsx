import type { RoomMembership } from '@hear-me-out/shared'
import { LobbyControls, type LobbyActions } from '../components/LobbyControls'
import { GamePhasePanel } from '../components/GamePhasePanel'

interface RoomPageProps extends LobbyActions {
  membership: RoomMembership
  busy: boolean
  connected: boolean
  leaveRoom: () => Promise<void> | undefined
}

export function RoomPage({ membership, busy, connected, leaveRoom, setReady, updateSettings, startGame }: RoomPageProps) {
  const { room, playerId } = membership
  const isCreator = room.hostPlayerId === playerId
  const inLobby = room.state.phase === 'LOBBY'

  return (
    <section className="connection-card room-card" aria-labelledby="room-title">
      <div className="card-heading">
        <p className="eyebrow">Le gang </p>
        <h1 id="room-title" className="room-title">{inLobby ? 'Le salon est ouvert.' : 'La partie est lancée.'}</h1>
        <p>{inLobby ? 'Transmets ce code à tes amis pour qu’ils te rejoignent.' : 'Le lobby est verrouillé pour tous les joueurs.'}</p>
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
            {inLobby && <span className={`ready-badge ${player.isReady ? 'is-ready' : ''}`}>{player.isReady ? 'Prêt' : 'Pas prêt'}</span>}
          </li>
        ))}
      </ul>
      {inLobby && room.players.length === 1 && <p className="field-hint">Tu es le premier arrivé. Invites tes potes !</p>}
      {room.state.phase !== 'LOBBY' ? (
        <GamePhasePanel state={room.state} />
      ) : (
        <LobbyControls key={`${room.id}:${room.settingsRevision}`} membership={membership} disabled={busy || !connected}
          setReady={setReady} updateSettings={updateSettings} startGame={startGame} />
      )}
      <p className="leave-hint" id="leave-hint">
        {isCreator ? 'Si tu pars, le salon sera fermé pour tout le monde.'
          : !inLobby ? 'La partie est lancée : tu ne pourras pas rejoindre de nouveau ce salon.'
            : 'Tu pourras revenir avec le même code tant que le salon reste ouvert.'}
      </p>
      <button className="secondary-button" disabled={busy || !connected} aria-describedby="leave-hint" onClick={() => void leaveRoom()}>
        {isCreator ? 'Fermer le salon et quitter' : 'Quitter le salon'}
      </button>
    </section>
  )
}
