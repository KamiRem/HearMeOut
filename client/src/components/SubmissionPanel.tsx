import { useState } from 'react'
import { DEMO_CHOICES } from '@hear-me-out/shared'
import type { ChoiceId, GameState, OwnSubmission, SubmissionProgress } from '@hear-me-out/shared'
import { useCountdown, type ServerClockSample } from '../hooks/useCountdown'

interface SubmissionPanelProps {
  state: Extract<GameState, { phase: 'SUBMISSION' }>
  ownSubmission: OwnSubmission
  progress: SubmissionProgress | null
  clockSample: ServerClockSample | null
  disabled: boolean
  submitChoice: (choiceId: ChoiceId) => Promise<void> | undefined
}

export function SubmissionPanel({ state, ownSubmission, progress, clockSample, disabled, submitChoice }: SubmissionPanelProps) {
  const [selected, setSelected] = useState<ChoiceId | null>(null)
  const seconds = useCountdown(state.deadlineAt, clockSample)
  const locked = ownSubmission.roundId === state.roundId ? ownSubmission.choiceId : null
  const choice = DEMO_CHOICES.find((item) => item.id === (locked ?? selected))
  const expired = seconds === 0

  return (
    <section className="game-launched submission-panel" aria-labelledby="phase-title">
      <div className="submission-heading">
        <p className="eyebrow">Round {state.roundNumber} / {state.totalRounds}</p>
        <span className={`submission-timer ${seconds !== null && seconds <= 10 ? 'is-urgent' : ''}`}
          role="timer" aria-label={seconds === null ? 'Synchronisation du temps' : `${seconds} secondes restantes`}>
          {seconds === null ? '—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
        </span>
      </div>
      <h2 id="phase-title">Choix du Hear Me Out</h2>
      <p className="field-hint">Choix d’exemple pour cette version. L’upload de tes images arrive à l’étape 6.</p>
      <p className="submission-progress" role="status">{progress?.submitted ?? 0} / {progress?.expected ?? 0} choix validés</p>
      {locked ? (
        <div className="submission-waiting" role="status">
          <span className="choice-preview" aria-hidden="true">{choice?.symbol}</span>
          <strong>{choice?.label} · Choix verrouillé</strong>
          <p>En attente des autres joueurs…</p>
        </div>
      ) : (
        <form onSubmit={(event) => {
          event.preventDefault()
          if (selected && !disabled && seconds !== null && !expired) void submitChoice(selected)
        }}>
          <fieldset className="choice-fieldset" disabled={disabled || seconds === null || expired}>
            <legend>Quel est ton Hear Me Out ?</legend>
            <div className="choice-grid">
              {DEMO_CHOICES.map((item) => (
                <label className={`choice-card ${selected === item.id ? 'is-selected' : ''}`} key={item.id}>
                  <input type="radio" name="choice" value={item.id} checked={selected === item.id}
                    onChange={() => setSelected(item.id)} />
                  <span className="choice-symbol" aria-hidden="true">{item.symbol}</span>
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {choice && <p className="choice-summary">Ton choix : <strong>{choice.label}</strong>. Une fois validé, il sera verrouillé.</p>}
          <button className="primary-button" type="submit" disabled={!selected || disabled || seconds === null || expired}>
            Valider mon Hear Me Out
          </button>
        </form>
      )}
      {expired && <p role="status">Temps écoulé. En attente de la confirmation du serveur…</p>}
    </section>
  )
}
