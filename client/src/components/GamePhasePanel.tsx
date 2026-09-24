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

export function GamePhasePanel({ state }: { state: Exclude<GameState, { phase: 'LOBBY' }> }) {
  return (
    <section className="game-launched" aria-labelledby="phase-title" aria-live="polite">
      <p className="eyebrow">{'roundNumber' in state ? `Round ${state.roundNumber} / ${state.totalRounds}` : 'Partie terminée'}</p>
      <h2 id="phase-title">{labels[state.phase]}</h2>
      <p className="field-hint">
        {state.phase === 'SUBMISSION'
          ? 'La partie a commencé. Le choix des images et le compte à rebours seront disponibles dans une prochaine version.'
          : 'Cette phase est synchronisée avec les autres joueurs. Son écran de jeu sera disponible dans une prochaine version.'}
      </p>
    </section>
  )
}
