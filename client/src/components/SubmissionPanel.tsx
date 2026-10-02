import { useState } from 'react'
import type { GameState, OwnSubmission, SubmissionProgress } from '@hear-me-out/shared'
import { ImagePicker } from './ImagePicker'
import { useCountdown, type ServerClockSample } from '../hooks/useCountdown'

interface SubmissionPanelProps {
  state: Extract<GameState, { phase: 'SUBMISSION' }>
  ownSubmission: OwnSubmission
  progress: SubmissionProgress | null
  clockSample: ServerClockSample | null
  disabled: boolean
  uploading: boolean
  submitImage: (file: File) => Promise<void> | undefined
}

export function SubmissionPanel({ state, ownSubmission, progress, clockSample, disabled, uploading, submitImage }: SubmissionPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const seconds = useCountdown(state.deadlineAt, clockSample)
  const locked = ownSubmission.roundId === state.roundId ? ownSubmission.image : null
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
      <p className="field-hint">Trouve ton Hear Me Out et valide-le avant la fin du temps. Ton image reste secrète jusqu’aux révélations.</p>
      <p className="submission-progress" role="status">{progress?.submitted ?? 0} / {progress?.expected ?? 0} choix validés</p>
      {locked ? (
        <div className="submission-waiting" role="status">
          <img className="submitted-image" src={locked.previewUrl} alt="Ton Hear Me Out validé" />
          <strong>Image validée · Choix verrouillé</strong>
          <p>En attente des autres joueurs…</p>
        </div>
      ) : (
        <form onSubmit={(event) => {
          event.preventDefault()
          if (file && !disabled && seconds !== null && !expired) void submitImage(file)
        }}>
          <ImagePicker disabled={disabled || seconds === null || expired} file={file} onSelect={setFile} />
          <p className="field-hint">Une fois l’envoi confirmé, ton choix sera verrouillé. L’envoi doit se terminer avant la fin du temps.</p>
          <button className="primary-button" type="submit" disabled={!file || disabled || seconds === null || expired}>
            {uploading ? 'Envoi et validation…' : 'Valider mon Hear Me Out'}
          </button>
          {uploading && <p role="status">Ton image est en cours d’envoi. Le compte à rebours continue.</p>}
        </form>
      )}
      {expired && <p role="status">Temps écoulé. En attente de la confirmation du serveur…</p>}
    </section>
  )
}
