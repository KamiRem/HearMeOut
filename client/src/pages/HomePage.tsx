import { useState, type FormEvent } from 'react'

interface HomePageProps {
  connected: boolean
  busy: boolean
  createRoom: (nickname: string) => Promise<void>
  joinRoom: (nickname: string, code: string) => Promise<void>
}

export function HomePage({ connected, busy, createRoom, joinRoom }: HomePageProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!connected || busy) return
    if (mode === 'create') void createRoom(nickname)
    else void joinRoom(nickname, code)
  }

  return (
    <section className="connection-card" aria-labelledby="home-title">
      <div className="card-heading">
        <p className="eyebrow">Accueil.</p>
        <h2 id="home-title">Lobby.</h2>
        <p>Entre ton blase.</p>
      </div>
      <div className="mode-switch" aria-label="Choisir une action">
        <button type="button" aria-pressed={mode === 'create'} disabled={busy} onClick={() => setMode('create')}>Créer un salon</button>
        <button type="button" aria-pressed={mode === 'join'} disabled={busy} onClick={() => setMode('join')}>Rejoindre</button>
      </div>
      <form onSubmit={submit} aria-busy={busy}>
        <label htmlFor="nickname">Ton pseudo</label>
        <input id="nickname" name="nickname" autoComplete="nickname" required minLength={2} maxLength={24}
          placeholder="Ex. : Lukas" value={nickname} disabled={busy}
          onChange={(event) => setNickname(event.target.value)} aria-describedby="nickname-hint" />
        <p className="field-hint" id="nickname-hint">2 à 24 caractères. Choisis bien.</p>
        {mode === 'join' && (
          <div className="code-field">
            <label htmlFor="room-code">Code du salon</label>
            <input id="room-code" name="code" className="code-input" autoComplete="off" autoCapitalize="characters"
              spellCheck={false} required minLength={6} maxLength={6} pattern="[A-HJ-NP-Z2-9]{6}"
              placeholder="XKD42P" value={code} disabled={busy}
              onChange={(event) => setCode(event.target.value.toUpperCase().trim())} />
          </div>
        )}
        <button className="primary-action" type="submit" disabled={!connected || busy}>
          {busy ? 'Un petit instant…' : mode === 'create' ? 'Créer mon salon' : 'Rejoindre le salon'}
          <span aria-hidden="true">↗</span>
        </button>
      </form>
      <p className="field-hint">{connected ? 'Jusqu’à 12 joueurs. Aucun compte nécessaire.' : 'En attente du serveur pour continuer…'}</p>
    </section>
  )
}
