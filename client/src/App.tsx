import { BrandIntro } from './components/BrandIntro'
import { ConnectionStatus } from './components/ConnectionStatus'
import { useConnection } from './hooks/useConnection'
import { useRoom } from './hooks/useRoom'
import { HomePage } from './pages/HomePage'
import { RoomPage } from './pages/RoomPage'
import './App.css'

function App() {
  const { socket, status, probe, ping } = useConnection()
  const { membership, pending, message, createRoom, joinRoom, leaveRoom } = useRoom(socket)
  const connected = status === 'connected'

  return (
    <main className={`page ${membership ? 'in-room' : ''}`}>
      <header className="masthead">
        <span className="wordmark" aria-label="Hear Me Out">hmo<span>.</span></span>
        <ConnectionStatus status={status} />
      </header>
      {message && <p className="room-message" role="alert">{message}</p>}
      {membership ? (
        <RoomPage membership={membership} busy={pending !== null} connected={connected} leaveRoom={leaveRoom} />
      ) : (
        <>
          <BrandIntro />
          <HomePage connected={connected} busy={pending !== null} createRoom={createRoom} joinRoom={joinRoom} />
        </>
      )}
      <footer>
        <p>À partager entre amis. Les goûts discutables sont les bienvenus.</p>
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
      </footer>
    </main>
  )
}

export default App
