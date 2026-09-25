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

export function GamePhasePanel({ state, submitted }: { state: Exclude<GameState, { phase: 'LOBBY' | 'SUBMISSION' }>; submitted: number }) {
  return (
    <section className="game-launched" aria-labelledby="phase-title" aria-live="polite">
      <p className="eyebrow">{'roundNumber' in state ? `Round ${state.roundNumber} / ${state.totalRounds}` : 'Partie terminée'}</p>
      <h2 id="phase-title">{labels[state.phase]}</h2>
      <p className="field-hint">
        {state.phase === 'WAITING'
          ? `${submitted} choix validé${submitted > 1 ? 's' : ''}. Les soumissions sont fermées. Le gâteau et les révélations arrivent à l’étape 7.`
          : state.phase === 'ROUND_RESULTS' && submitted === 0
            ? 'Temps écoulé : aucun choix validé pour ce round. La suite des rounds arrive à l’étape 9.'
            : 'Cette phase est synchronisée avec les autres joueurs. Son écran de jeu sera disponible dans une prochaine version.'}
      </p>
    </section>
  )
}
