import type { RoomMembership } from '@hear-me-out/shared'

interface RoomPageProps {
  membership: RoomMembership
  busy: boolean
  connected: boolean
  leaveRoom: () => Promise<void> | undefined
}

export function RoomPage({ membership: { room, playerId }, busy, connected, leaveRoom }: RoomPageProps) {
  const isCreator = room.hostPlayerId === playerId

  return (
    <section className="connection-card room-card" aria-labelledby="room-title">
      <div className="card-heading">
        <p className="eyebrow">Votre petit comité</p>
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
            {player.id === playerId && <span className="you-badge">toi</span>}
          </li>
        ))}
      </ul>
      {room.players.length === 1 && <p className="field-hint">Tu es le premier arrivé. Il ne manque que tes amis !</p>}
      <p className="leave-hint" id="leave-hint">
        {isCreator ? 'Si tu pars, le salon sera fermé pour tout le monde.' : 'Tu pourras revenir avec le même code tant que le salon reste ouvert.'}
      </p>
      <button className="secondary-button" disabled={busy || !connected} aria-describedby="leave-hint" onClick={() => void leaveRoom()}>
        {busy ? 'Départ en cours…' : isCreator ? 'Fermer le salon et quitter' : 'Quitter le salon'}
      </button>
    </section>
  )
}
