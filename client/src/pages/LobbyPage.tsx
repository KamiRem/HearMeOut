import type { RoomMembership } from '@hear-me-out/shared'
import { LobbyControls, type LobbyActions } from '../components/LobbyControls'
import { LeaveRoomButton } from '../components/LeaveRoomButton'
import { RoomCode } from '../components/RoomCode'
import { PlayerAvatar } from '../components/PlayerAvatar'

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
    <section className="room-card mx-auto max-w-6xl" aria-labelledby="room-title">
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="mb-3 text-xs font-bold tracking-widest text-primary uppercase">Avant la première bouchée</p>
          <h1 id="room-title" className="text-3xl font-black tracking-tight sm:text-4xl">Le salon est ouvert.</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-base-content/75">Rassemble ta bande, prépare tes arguments.<br />Transmets ce code à tes amis pour qu’ils te rejoignent.</p>
        </div>
        <RoomCode code={room.code} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
      <section className="card border border-base-content/10 bg-base-200 p-5 sm:p-6" aria-labelledby="players-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="players-title" className="text-lg font-bold">Autour du gâteau</h2>
        <p className="badge badge-neutral" role="status">{room.players.length} / {room.capacity} joueurs</p>
      </div>
      <ul className="player-list space-y-3" aria-label="Joueurs du salon">
        {room.players.map((player) => (
          <li key={player.id} className="flex flex-wrap items-center gap-3 rounded-box border border-base-content/5 bg-base-100 p-3">
            <PlayerAvatar nickname={player.nickname} connected={player.isConnected} />
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold">{player.nickname} {player.id === playerId && <span className="text-xs font-normal text-base-content/65">(toi)</span>}</p>
              {player.id === room.hostPlayerId && <span className="host-badge text-xs text-primary"><span aria-hidden="true">♛ </span>Host</span>}
            </div>
            <span className={`badge badge-sm ${!player.isConnected ? 'badge-warning badge-soft' : player.isReady ? 'badge-success badge-soft' : 'badge-ghost'}`}>
              {!player.isConnected ? 'Reconnexion…' : player.isReady ? '✓ Prêt' : 'Pas prêt'}
            </span>
          </li>
        ))}
      </ul>
      {room.players.length === 1 && <div className="mt-4 rounded-box border border-dashed border-base-content/20 p-6 text-center text-sm text-base-content/65">Une place pour chacun de tes complices.<br />Invite tes amis avec le code du salon.</div>}
      </section>
      <LobbyControls key={`${room.id}:${room.settingsRevision}`} membership={membership} disabled={busy || !connected}
        setReady={setReady} updateSettings={updateSettings} startGame={startGame} />
      </div>
      <LeaveRoomButton isHost={isCreator} disabled={busy || !connected} leaveRoom={leaveRoom} />
    </section>
  )
}
