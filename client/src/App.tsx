import { ConnectionStatus } from './components/ConnectionStatus'
import { useConnection } from './hooks/useConnection'
import { useRoom } from './hooks/useRoom'
import { RoomRoutes } from './RoomRoutes'
import './App.css'

function App() {
  const { socket, status, probe, ping } = useConnection()
  const room = useRoom(socket)
  const { membership, message } = room
  const inGame = membership && membership.room.state.phase !== 'LOBBY'
  const connected = status === 'connected'

  return (
    <main className={`page ${inGame ? 'in-game' : membership ? 'in-room' : ''}`}>
      <header className="masthead">
        <span className="wordmark" aria-label="Hear Me Out">hmo<span>.</span></span>
        <ConnectionStatus status={status} />
      </header>
      {message && <p className="room-message" role="alert">{message}</p>}
      <RoomRoutes room={room} connected={connected} />
      {!inGame && <footer>
        <p>Ici le footer.</p>
        <details className="connection-diagnostics">
          <summary>Vérifier ma connexion</summary>
          <button className="secondary-button" onClick={ping} disabled={!connected || probe.status === 'pending'}>
            {probe.status === 'pending' ? 'Vérification…' : 'Tester la connexion'}
          </button>
          <p role="status">
            {probe.status === 'success' && `Message reçu et confirmé en ${probe.latency} ms.`}
            {probe.status === 'error' && 'Pas de confirmation reçue. Tu peux réessayer.'}
          </p>
        </details>
      </footer>}
    </main>
  )
}

export default App
