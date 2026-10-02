import type { GamePhase, GameState } from '@hear-me-out/shared'

const labels: Record<GamePhase, string> = {
  LOBBY: 'Lobby',
  SUBMISSION: 'Choix du Hear Me Out',
  WAITING: 'En attente des révélations',
  REVEAL: 'Révélation',
  VOTING: 'Vote',
  SUBMISSION_RESULTS: 'Résultat de la soumission',
  ROUND_RESULTS: 'Résultats du round',
  GAME_RESULTS: 'Résultats de la partie',
}

export function GamePhasePanel({ state }: { state: Exclude<GameState, { phase: 'LOBBY' | 'SUBMISSION' }> }) {
  return (
    <section className="card mx-auto w-full max-w-2xl border border-base-content/10 bg-base-200 p-8 text-center" aria-labelledby="phase-title" aria-live="polite">
      <p className="mb-4 text-xs font-bold tracking-widest text-primary uppercase">{'roundNumber' in state ? `Round ${state.roundNumber} / ${state.totalRounds}` : 'Partie terminée'}</p>
      <h1 id="phase-title" className="text-3xl font-black">{labels[state.phase]}</h1>
      <p className="mt-4 text-sm text-base-content/75">
        Cette phase est synchronisée avec les autres joueurs. Son écran sera disponible dans une prochaine version.
      </p>
    </section>
  )
}
