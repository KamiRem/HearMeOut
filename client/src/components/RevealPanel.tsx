import type { RoomSnapshot } from '@hear-me-out/shared'
import { RevealCake } from './RevealCake'

interface RevealPanelProps {
  room: RoomSnapshot
  isHost: boolean
  disabled: boolean
  reveal: (action: 'start' | 'next') => Promise<void> | undefined
}

export function RevealPanel({ room, isHost, disabled, reveal }: RevealPanelProps) {
  const state = room.state
  if (!('roundNumber' in state)) return null
  const waiting = state.phase === 'WAITING'
  const finished = state.phase === 'ROUND_RESULTS'
  const total = room.submissionProgress?.submitted ?? 0
  const count = room.revealedSubmissions.length
  return (
    <section className="reveal-panel mx-auto w-full max-w-3xl text-center" aria-labelledby="reveal-title">
      <p className="mb-4 text-xs font-bold tracking-widest text-primary uppercase">Round {state.roundNumber} / {state.totalRounds}</p>
      <div aria-live="polite">
        <h1 id="reveal-title" className="text-3xl font-black tracking-tight sm:text-4xl">{total === 0 ? 'Pas de choix pour ce round' : waiting ? 'Le gâteau attend vos secrets' : finished ? 'Le gâteau est complet' : 'Hear me out…'}</h1>
        <p className="reveal-progress badge badge-primary badge-soft mt-4">{total === 0 ? 'Aucune image validée' : `${count} / ${total} images révélées`}</p>
      </div>
      <RevealCake images={room.revealedSubmissions} currentId={state.phase === 'REVEAL' ? state.submissionId : undefined} />
      <p className="mt-6 text-sm leading-relaxed text-base-content/80">{total === 0 ? 'Le temps est écoulé. Aucun choix n’a été validé pour ce round.'
        : waiting ? 'Tous les choix sont verrouillés. Place aux révélations !'
          : 'À qui appartient ce choix ? Les auteurs restent secrets.'}</p>
      {isHost && !finished && <button className="reveal-action btn btn-primary btn-lg mt-6 w-full sm:w-auto" disabled={disabled}
        onClick={() => void reveal(waiting ? 'start' : 'next')}>
        {waiting ? 'Commencer les révélations' : count === total ? 'Terminer les révélations' : 'Révéler l’image suivante'}
      </button>}
      {!isHost && !finished && <p className="mt-5 flex items-center justify-center gap-3 text-sm text-base-content/65"><span className="loading loading-dots loading-sm text-primary" aria-hidden="true" />{waiting
        ? 'Le Host va commencer les révélations.' : 'Le Host choisit quand passer à la suite.'}</p>}
      {finished && <p className="mt-5 text-sm text-base-content/65">{total > 0 ? 'Toutes les images ont été présentées. ' : ''}La suite des rounds sera disponible dans une prochaine version.</p>}
    </section>
  )
}
