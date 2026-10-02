const labels = {
  connecting: 'Connexion en cours…',
  connected: 'Connecté au serveur',
  disconnected: 'Connexion interrompue',
  error: 'Serveur indisponible',
}

export function ConnectionStatus({ status }: { status: keyof typeof labels }) {
  return (
    <div className="connection-status flex items-center gap-2 text-xs text-base-content/75" role="status">
      <span className={status === 'connecting' ? 'loading loading-spinner loading-xs text-warning'
        : `status ${status === 'connected' ? 'status-success' : 'status-error'}`} aria-hidden="true" />
      <span className="max-w-32 sm:max-w-none">{labels[status]}</span>
    </div>
  )
}
