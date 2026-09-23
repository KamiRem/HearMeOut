const labels = {
  connecting: 'Connexion en cours…',
  connected: 'Connecté au serveur',
  disconnected: 'Connexion interrompue',
  error: 'Serveur indisponible',
}

export function ConnectionStatus({ status }: { status: keyof typeof labels }) {
  return (
    <div className="connection-status" role="status">
      <span className={`status-dot ${status}`} aria-hidden="true" />
      <span>{labels[status]}</span>
    </div>
  )
}
