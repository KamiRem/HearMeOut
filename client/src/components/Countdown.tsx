export function Countdown({ seconds }: { seconds: number | null }) {
  const critical = seconds !== null && seconds <= 5
  const low = seconds !== null && seconds <= 10
  return <div className={`rounded-box border px-4 py-2 text-center ${critical
    ? 'border-error/50 bg-error/10 text-error' : low ? 'border-warning/40 bg-warning/10 text-warning'
      : 'border-primary/20 bg-primary/5 text-primary'}`}>
    <span className="submission-timer block font-mono text-2xl font-bold tabular-nums" role="timer"
      aria-label={seconds === null ? 'Synchronisation du temps' : `${seconds} secondes restantes`}>
      {seconds === null ? '—' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}
    </span>
    <span className="block text-xs">{critical ? 'Dernières secondes' : low ? 'Bientôt terminé' : 'Temps restant'}</span>
  </div>
}
