import { ConnectionStatus } from './components/ConnectionStatus'
import { useConnection } from './hooks/useConnection'
import { useRoom } from './hooks/useRoom'
import { RoomRoutes } from './RoomRoutes'
import { Feedback } from './components/Feedback'
import './App.css'

function App() {
  const { socket, status, probe, ping } = useConnection()
  const room = useRoom(socket)
  const { membership, message } = room
  const inGame = membership && membership.room.state.phase !== 'LOBBY'
  const connected = status === 'connected'

  return (
    <div className={`min-h-svh bg-base-100 text-base-content ${inGame ? 'in-game' : membership ? 'in-room' : ''}`}>
      <a href="#main-content" className="btn btn-primary fixed top-2 left-2 z-50 -translate-y-24 focus:translate-y-0">Aller au contenu</a>
      <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col px-4 sm:px-8">
        <header className="masthead flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-base-content/10 py-4">
          <span className="flex items-center gap-3" aria-label="Hear Me Out">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-lg font-black text-primary-content" aria-hidden="true">h!</span>
            <span className="text-sm leading-tight font-black tracking-wider">HEAR<br className="sm:hidden" /> ME OUT<span className="text-primary">.</span></span>
          </span>
          <ConnectionStatus status={status} />
        </header>
        <main id="main-content" className="flex-1 py-8 sm:py-12" tabIndex={-1}>
          {message && <div className="room-message mb-6"><Feedback tone={room.messageTone}>{message}</Feedback></div>}
          <RoomRoutes room={room} connected={connected} />
        </main>
        {!inGame && <footer className="flex flex-col gap-4 border-t border-base-content/10 py-6 text-xs text-base-content/65 sm:flex-row sm:items-start sm:justify-between">
          <p>Un gâteau. Des choix discutables. De très bons amis.</p>
          <details className="connection-diagnostics max-w-sm">
            <summary className="min-h-6">Vérifier ma connexion</summary>
            <button className="btn btn-sm btn-ghost my-3" onClick={ping} disabled={!connected || probe.status === 'pending'}>
              {probe.status === 'pending' && <span className="loading loading-spinner loading-xs" aria-hidden="true" />}
              {probe.status === 'pending' ? 'Vérification…' : 'Tester la connexion'}
            </button>
            {probe.status === 'success' && <Feedback tone="success">Message reçu et confirmé en {probe.latency} ms.</Feedback>}
            {probe.status === 'error' && <Feedback tone="error">Pas de confirmation reçue. Tu peux réessayer.</Feedback>}
          </details>
        </footer>}
      </div>
    </div>
  )
}

export default App
