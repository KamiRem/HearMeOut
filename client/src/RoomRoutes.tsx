import { Navigate, Route, Routes, useLocation, useParams } from 'react-router'
import { HomePage } from './pages/HomePage'
import { LobbyPage } from './pages/LobbyPage'
import { GamePage } from './pages/GamePage'
import type { useRoom } from './hooks/useRoom'

interface RoomRoutesProps {
  room: ReturnType<typeof useRoom>
  connected: boolean
}

function JoinRoute({ room, connected }: RoomRoutesProps) {
  const { roomCode = '' } = useParams()
  const code = roomCode.toUpperCase()
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return <Navigate to="/" replace />
  return <HomePage key={code} initialCode={code} connected={connected} busy={room.pending !== null}
    createRoom={room.createRoom} joinRoom={room.joinRoom} />
}

function AnonymousGameRoute() {
  const { roomCode = '' } = useParams()
  return <Navigate to={`/room/${encodeURIComponent(roomCode)}`} replace />
}

export function RoomRoutes({ room, connected }: RoomRoutesProps) {
  const { pathname } = useLocation()
  if (room.restoring) return (
    <section className="card mx-auto max-w-lg border border-base-content/10 bg-base-200 p-8 text-center" aria-live="polite">
      <span className="loading loading-ring loading-lg mx-auto mb-5 text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Reconnexion à ton salon…</h1>
      <p className="mt-4 text-sm text-base-content/75">{room.resumeFailed ? 'La réponse tarde à arriver. Tu peux relancer la connexion.' : 'Récupération de ta place et de l’état de la partie.'}</p>
      {room.resumeFailed && <button className="btn btn-primary mt-6" onClick={room.retryResume}>Réessayer la connexion</button>}
    </section>
  )
  const membership = room.membership
  if (membership) {
    const inLobby = membership.room.state.phase === 'LOBBY'
    const target = `/${inLobby ? 'room' : 'game'}/${membership.room.code}`
    if (pathname !== target) return <Navigate to={target} replace />
    return <Routes>
      <Route path="/room/:roomCode" element={<LobbyPage membership={membership} busy={room.pending !== null}
        connected={connected} leaveRoom={room.leaveRoom} setReady={room.setReady}
        updateSettings={room.updateSettings} startGame={room.startGame} />} />
      <Route path="/game/:roomCode" element={<GamePage membership={membership} busy={room.pending !== null}
        uploading={room.pending === 'submit'} connected={connected} leaveRoom={room.leaveRoom}
        clockSample={room.clockSample} submitImage={room.submitImage} reveal={room.reveal} />} />
    </Routes>
  }
  if (room.sessionEnded && pathname !== '/') return <Navigate to="/" replace />
  return <Routes>
    <Route path="/" element={<HomePage connected={connected} busy={room.pending !== null}
      createRoom={room.createRoom} joinRoom={room.joinRoom} />} />
    <Route path="/room/:roomCode" element={<JoinRoute room={room} connected={connected} />} />
    <Route path="/game/:roomCode" element={<AnonymousGameRoute />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
