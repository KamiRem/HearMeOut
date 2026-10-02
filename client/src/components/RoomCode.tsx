import { useEffect, useRef, useState } from 'react'

export function RoomCode({ code }: { code: string }) {
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setMessage('Code copié')
    } catch {
      setMessage('Copie indisponible : sélectionne le code ci-dessus.')
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(''), 4000)
  }

  return <div className="w-full rounded-box border border-primary/25 bg-primary/5 p-5 sm:w-auto sm:min-w-72">
    <p className="mb-2 text-xs font-bold tracking-widest text-primary uppercase">Code du salon</p>
    <div className="flex flex-wrap items-center gap-4">
      <strong className="room-code select-all font-mono text-3xl tracking-widest text-base-content" aria-label={`Code du salon : ${code}`}>{code}</strong>
      <button type="button" className="btn btn-sm btn-outline btn-primary min-h-11" onClick={() => void copy()} aria-label="Copier le code du salon">Copier</button>
    </div>
    <p className="mt-2 min-h-4 text-xs text-base-content/75" role="status">{message || 'Un code. Toute ta bande.'}</p>
  </div>
}
