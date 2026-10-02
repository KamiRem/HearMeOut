import { useState } from 'react'
import type { GameState, OwnSubmission, SubmissionProgress } from '@hear-me-out/shared'
import { ImagePicker } from './ImagePicker'
import { Countdown } from './Countdown'
import { Feedback } from './Feedback'
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
    <section className="submission-panel mx-auto w-full max-w-2xl" aria-labelledby="phase-title">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-widest text-primary uppercase">Round {state.roundNumber} / {state.totalRounds}</p>
          <p className="mt-2 text-sm text-base-content/65">{locked ? 'Ton secret est bien gardé.' : 'Surprends tout le monde.'}</p>
        </div>
        <Countdown seconds={seconds} />
      </div>
      <div className="card border border-base-content/10 bg-base-200 p-5 sm:p-8">
      <h1 id="phase-title" className="text-2xl font-black tracking-tight sm:text-3xl">{locked ? 'Ton Hear Me Out est verrouillé.' : 'Choix du Hear Me Out'}</h1>
      <p className="mt-3 text-sm leading-relaxed text-base-content/75">{locked ? 'Plus qu’à attendre les autres. Prépare tes arguments !' : 'Trouve ton Hear Me Out et valide-le avant la fin du temps. Ton image reste secrète jusqu’aux révélations.'}</p>
      <div className="my-5">
        <p className="submission-progress mb-2 text-xs text-base-content/75" role="status">{progress?.submitted ?? 0} / {progress?.expected ?? 0} choix validés</p>
        <progress className="progress progress-primary block w-full" value={progress?.submitted ?? 0} max={Math.max(1, progress?.expected ?? 0)} aria-label="Choix validés" />
      </div>
      {locked ? (
        <div className="submission-waiting space-y-5 text-center">
          <img className="submitted-image mx-auto max-h-64 w-full rounded-box bg-base-300 object-contain" src={locked.previewUrl} alt="Ton Hear Me Out validé" />
          <Feedback tone="success">Image validée · Choix verrouillé</Feedback>
          <p className="flex items-center justify-center gap-3 text-sm" role="status"><span className="loading loading-dots loading-sm text-primary" aria-hidden="true" />En attente des autres joueurs…</p>
        </div>
      ) : (
        <form aria-busy={uploading} onSubmit={(event) => {
          event.preventDefault()
          if (file && !disabled && seconds !== null && !expired) void submitImage(file)
        }}>
          <ImagePicker disabled={disabled || seconds === null || expired} file={file} onSelect={setFile} />
          <p className="my-4 text-xs leading-relaxed text-base-content/65">Une fois l’envoi confirmé, ton choix sera verrouillé. L’envoi doit se terminer avant la fin du temps.</p>
          <button className="primary-button btn btn-primary btn-lg w-full" type="submit" disabled={!file || disabled || seconds === null || expired}>
            {uploading && <span className="loading loading-spinner loading-sm" aria-hidden="true" />}
            {uploading ? 'Envoi et validation…' : 'Valider mon Hear Me Out'}
          </button>
          {uploading && <div className="mt-4"><Feedback>Ton image est en cours d’envoi. Le compte à rebours continue.</Feedback></div>}
        </form>
      )}
      {expired && <div className="mt-4"><Feedback>Temps écoulé. En attente de la confirmation du serveur…</Feedback></div>}
      </div>
    </section>
  )
}
