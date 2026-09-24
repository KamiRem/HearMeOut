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
  const readyCount = room.players.filter((player) => player.isReady).length
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
    <section className="lobby-controls" aria-labelledby="settings-title">
      <h2 id="settings-title">Au menu</h2>
      {isHost ? (
        <form onSubmit={save}>
          <fieldset disabled={disabled} className="settings-fields">
            <legend className="field-hint">Tu es le Host : choisis les paramètres de la partie.</legend>
            <div className="settings-grid">
              {fields.map(({ name, label, unit }) => (
                <div key={name}>
                  <label htmlFor={`setting-${name}`}>{label}</label>
                  <input id={`setting-${name}`} name={name} type="number" required step={1}
                    min={GAME_SETTINGS_LIMITS[name].min} max={GAME_SETTINGS_LIMITS[name].max}
                    value={draft[name]} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
                    aria-describedby={`hint-${name}`} />
                  <p className="field-hint" id={`hint-${name}`}>{GAME_SETTINGS_LIMITS[name].min}–{GAME_SETTINGS_LIMITS[name].max} {unit}</p>
                </div>
              ))}
            </div>
            <button className="secondary-button save-settings" type="submit" disabled={disabled || !dirty}>Enregistrer les paramètres</button>
          </fieldset>
          <p className="field-hint">Modifier les paramètres remet tout le monde « pas prêt ».</p>
        </form>
      ) : (
        <>
          <dl className="settings-summary">
            {fields.map(({ name, label, unit }) => <div key={name}><dt>{label}</dt><dd>{room.settings[name]} {unit}</dd></div>)}
          </dl>
          <p className="field-hint">Seul le Host peut modifier ces paramètres.</p>
        </>
      )}
      <div className="ready-controls">
        <p role="status">{readyCount} / {room.players.length} joueurs prêts</p>
        <button className={`ready-button ${self?.isReady ? 'is-ready' : ''}`} type="button"
          disabled={disabled || (isHost && dirty)} aria-pressed={self?.isReady ?? false}
          onClick={() => void setReady(!self?.isReady)}>
          {self?.isReady ? 'Je ne suis plus prêt' : 'Je suis prêt'}
        </button>
        {isHost && dirty && <p className="field-hint">Enregistre tes modifications avant de te déclarer prêt ou de lancer.</p>}
      </div>
      {isHost ? (
        <div className="start-controls">
          <button className="start-game" type="button" disabled={!canStart} aria-describedby="start-hint" onClick={() => void startGame()}>Lancer la partie</button>
          <p className="field-hint" id="start-hint" role="status">
            {!enoughPlayers ? 'Invite au moins un autre joueur pour commencer.'
              : !allReady ? 'Tout le monde doit être prêt, toi compris.'
                : dirty ? 'Enregistre les paramètres avant de lancer.' : 'Tout le monde est prêt. À toi de lancer !'}
          </p>
        </div>
      ) : <p className="field-hint">Le Host lancera la partie quand tout le monde sera prêt.</p>}
    </section>
  )
}
