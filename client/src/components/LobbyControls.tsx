import { useState, type FormEvent } from 'react'
import { GAME_SETTINGS_LIMITS, MIN_PLAYERS } from '@hear-me-out/shared'
import type { GameSettings, RoomMembership } from '@hear-me-out/shared'

export interface LobbyActions {
  setReady: (isReady: boolean) => Promise<void> | undefined
  updateSettings: (settings: GameSettings) => Promise<void> | undefined
  startGame: () => Promise<void> | undefined
}

interface LobbyControlsProps extends LobbyActions {
  membership: RoomMembership
  disabled: boolean
}

const fields: { name: keyof GameSettings; label: string; unit: string }[] = [
  { name: 'rounds', label: 'Nombre de rounds', unit: 'rounds' },
  { name: 'submissionDuration', label: 'Temps de choix', unit: 'secondes' },
  { name: 'voteDuration', label: 'Temps de vote', unit: 'secondes' },
]

export function LobbyControls({ membership: { room, playerId }, disabled, setReady, updateSettings, startGame }: LobbyControlsProps) {
  const isHost = room.hostPlayerId === playerId
  const self = room.players.find((player) => player.id === playerId)
  const [draft, setDraft] = useState(() => ({
    rounds: String(room.settings.rounds),
    submissionDuration: String(room.settings.submissionDuration),
    voteDuration: String(room.settings.voteDuration),
  }))
  const dirty = fields.some(({ name }) => draft[name] === '' || Number(draft[name]) !== room.settings[name])
  const readyCount = room.players.filter((player) => player.isReady && player.isConnected).length
  const enoughPlayers = room.players.length >= MIN_PLAYERS
  const allReady = readyCount === room.players.length
  const canStart = enoughPlayers && allReady && !dirty && !disabled

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isHost || disabled || !dirty) return
    void updateSettings({
      rounds: Number(draft.rounds),
      submissionDuration: Number(draft.submissionDuration),
      voteDuration: Number(draft.voteDuration),
    })
  }

  return (
    <section className="lobby-controls contents" aria-labelledby="settings-title">
      <div className="card border border-base-content/10 bg-base-200 p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="settings-title" className="text-lg font-bold">Au menu</h2>
        <span className="badge badge-ghost badge-sm">Paramètres</span>
      </div>
      {isHost ? (
        <form onSubmit={save}>
          <fieldset disabled={disabled} className="fieldset min-w-0 p-0">
            <legend className="mb-4 text-sm text-base-content/75">Tu es le Host : choisis les paramètres de la partie.</legend>
            <div className="settings-grid grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {fields.map(({ name, label, unit }) => (
                <div key={name}>
                  <label className="mb-2 block text-xs font-semibold" htmlFor={`setting-${name}`}>{label}</label>
                  <input className="input w-full min-w-0 bg-base-100 text-base" id={`setting-${name}`} name={name} type="number" required step={1}
                    min={GAME_SETTINGS_LIMITS[name].min} max={GAME_SETTINGS_LIMITS[name].max}
                    value={draft[name]} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
                    aria-describedby={`hint-${name}`} />
                  <p className="mt-2 text-xs text-base-content/65" id={`hint-${name}`}>{GAME_SETTINGS_LIMITS[name].min}–{GAME_SETTINGS_LIMITS[name].max} {unit}</p>
                </div>
              ))}
            </div>
            <button className="save-settings btn btn-outline mt-5 w-full" type="submit" disabled={disabled || !dirty}>Enregistrer les paramètres</button>
          </fieldset>
          <p className="mt-3 text-xs leading-relaxed text-base-content/65">Modifier les paramètres remet tout le monde « pas prêt ».</p>
        </form>
      ) : (
        <>
          <dl className="space-y-3">
            {fields.map(({ name, label, unit }) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-box bg-base-100 p-4" key={name}>
              <dt className="text-sm text-base-content/75">{label}</dt><dd className="font-semibold text-primary">{room.settings[name]} {unit}</dd>
            </div>)}
          </dl>
          <p className="mt-4 text-xs text-base-content/65">Seul le Host peut modifier ces paramètres.</p>
        </>
      )}
      </div>
      <div className="col-span-full grid gap-6 rounded-box border border-primary/20 bg-primary/5 p-5 sm:p-6 md:grid-cols-2 md:items-center">
      <div className="ready-controls space-y-3">
        <p className="text-sm font-semibold" role="status">{readyCount} / {room.players.length} joueurs prêts</p>
        <progress className="progress progress-primary w-full" value={readyCount} max={room.players.length} aria-label="Joueurs prêts" />
        <button className={`ready-button btn btn-lg w-full ${self?.isReady ? 'btn-success btn-outline' : 'btn-primary'}`} type="button"
          disabled={disabled || (isHost && dirty)} aria-pressed={self?.isReady ?? false}
          onClick={() => void setReady(!self?.isReady)}>
          {self?.isReady ? 'Je ne suis plus prêt' : 'Je suis prêt'}
        </button>
        {isHost && dirty && <p className="text-xs text-warning">Enregistre tes modifications.</p>}
      </div>
      {isHost ? (
        <div className="space-y-3"> 
          <button className="start-game btn btn-primary btn-lg w-full" type="button" disabled={!canStart} aria-describedby="start-hint" onClick={() => void startGame()}>Lancer la partie <span aria-hidden="true">→</span></button>
          <p className="text-xs leading-relaxed text-base-content/75" id="start-hint" role="status">
            {!enoughPlayers ? 'Invite au moins un autre joueur pour commencer.'
              : !allReady ? 'Tout le monde doit être prêt, toi compris.'
                : dirty ? 'Enregistre les paramètres avant de lancer.' : 'Tout le monde est prêt. À toi de lancer !'}
          </p>
        </div>
      ) : <p className="text-sm leading-relaxed text-base-content/75">Installe-toi, ça va commencer.<br />Le Host lancera la partie quand tout le monde sera prêt.</p>}
      </div>
    </section>
  )
}
