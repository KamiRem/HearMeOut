import { useState, type FormEvent } from 'react'
import { BrandIntro } from '../components/BrandIntro'

interface HomePageProps {
  connected: boolean
  busy: boolean
  initialCode?: string
  createRoom: (nickname: string) => Promise<void>
  joinRoom: (nickname: string, code: string) => Promise<void>
}

export function HomePage({ connected, busy, createRoom, joinRoom, initialCode = '' }: HomePageProps) {
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create')
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState(initialCode)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!connected || busy) return
    if (mode === 'create') void createRoom(nickname)
    else void joinRoom(nickname, code)
  }

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 py-2 sm:py-6 lg:grid-cols-2 lg:gap-16">
      <BrandIntro />
      <section className="card w-full border border-base-content/10 bg-base-200 shadow-xl shadow-base-300/20" aria-labelledby="home-title">
      <div className="card-body gap-5 p-6 sm:p-8">
      <div>
        <p className="mb-2 text-xs font-bold tracking-widest text-primary uppercase">La soirée commence ici</p>
        <h2 id="home-title" className="text-2xl font-extrabold">Ramène ta bande.</h2>
        <p className="mt-2 text-sm text-base-content/70">Un pseudo, un salon, et c’est parti.</p>
      </div>
      <div className="mode-switch grid grid-cols-2 gap-2 rounded-box bg-base-300 p-1" aria-label="Choisir une action">
        <button className={`btn border-0 ${mode === 'create' ? 'btn-primary' : 'btn-ghost'}`} type="button" aria-pressed={mode === 'create'} disabled={busy} onClick={() => setMode('create')}>Créer une partie</button>
        <button className={`btn border-0 ${mode === 'join' ? 'btn-primary' : 'btn-ghost'}`} type="button" aria-pressed={mode === 'join'} disabled={busy} onClick={() => setMode('join')}>Rejoindre</button>
      </div>
      <form onSubmit={submit} aria-busy={busy} className="space-y-5">
        <div>
        <label className="mb-2 block text-sm font-semibold" htmlFor="nickname">Ton pseudo</label>
        <input className="input input-bordered input-lg w-full bg-base-100" id="nickname" name="nickname" autoComplete="nickname" required minLength={2} maxLength={24}
          placeholder="Ex. : Camille" value={nickname} disabled={busy}
          onChange={(event) => setNickname(event.target.value)} aria-describedby="nickname-hint" />
        <p className="mt-2 text-xs text-base-content/65" id="nickname-hint">2 à 24 caractères. Fais-toi reconnaître.</p>
        </div>
        {mode === 'join' && (
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="room-code">Code du salon</label>
            <input id="room-code" name="code" className="input input-lg w-full bg-base-100 font-mono tracking-widest" autoComplete="off" autoCapitalize="characters"
              spellCheck={false} required minLength={6} maxLength={6} pattern="[A-HJ-NP-Z2-9]{6}"
              placeholder="XKD42P" value={code} disabled={busy}
              onChange={(event) => setCode(event.target.value.toUpperCase().trim())} />
          </div>
        )}
        <button className="primary-action btn btn-primary btn-lg w-full" type="submit" disabled={!connected || busy}>
          {busy && <span className="loading loading-spinner loading-sm" aria-hidden="true" />}
          {busy ? 'Un petit instant…' : mode === 'create' ? 'Créer mon salon' : 'Rejoindre le salon'}
          {!busy && <span aria-hidden="true">→</span>}
        </button>
      </form>
      <p className="text-center text-xs text-base-content/65" role="status">{connected ? (mode === 'create' ? 'Tu recevras un code à partager avec tes amis.' : 'Demande le code à la personne qui a créé le salon.') : 'En attente du serveur pour continuer…'}</p>
      </div>
    </section>
    </div>
  )
}
