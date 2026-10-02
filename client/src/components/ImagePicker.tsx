import { useEffect, useRef, useState } from 'react'
import { IMAGE_LIMITS } from '@hear-me-out/shared'
import { Feedback } from './Feedback'

interface ImagePickerProps {
  disabled: boolean
  file: File | null
  onSelect: (file: File | null) => void
}

export function ImagePicker({ disabled, file, onSelect }: ImagePickerProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const previewUrl = useRef<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
  }, [])

  function clearPreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
    setPreview(null)
  }

  function choose(files: FileList | null) {
    if (disabled || !files?.length) return
    setError(null)
    clearPreview()
    const next = files[0]!
    if (files.length !== 1 || !IMAGE_LIMITS.mimeTypes.some((mime) => mime === next.type)) {
      setError('Choisis un seul fichier JPEG, PNG ou WebP.')
      onSelect(null)
    } else if (next.size === 0 || next.size > IMAGE_LIMITS.maxBytes) {
      setError('L’image doit peser entre 1 octet et 5 Mio.')
      onSelect(null)
    } else {
      previewUrl.current = URL.createObjectURL(next)
      setPreview(previewUrl.current)
      onSelect(next)
    }
  }

  return (
    <div className={`image-picker rounded-box border-2 border-dashed p-5 text-center transition-colors ${dragging && !disabled ? 'border-primary bg-primary/10' : 'border-base-content/20 bg-base-100'} ${disabled ? 'opacity-60' : ''}`} onDragOver={(event) => {
      event.preventDefault()
      if (!disabled) setDragging(true)
    }} onDragLeave={() => setDragging(false)} onDrop={(event) => {
      event.preventDefault()
      setDragging(false)
      choose(event.dataTransfer.files)
    }}>
      <label className="sr-only" htmlFor="submission-image">Choisis ton image ou dépose-la ici</label>
      <input ref={input} className="sr-only" tabIndex={-1} id="submission-image" type="file" accept={IMAGE_LIMITS.mimeTypes.join(',')} disabled={disabled}
        aria-describedby="image-limits" onChange={(event) => {
          choose(event.currentTarget.files)
          event.currentTarget.value = ''
        }} />
      {preview ? <figure className="image-preview mb-5">
        <img className="mx-auto max-h-64 w-full rounded-box object-contain" src={preview} alt="Aperçu de ton Hear Me Out" onError={() => {
          setError('Impossible de lire cette image. Choisis un autre fichier.')
          clearPreview()
          onSelect(null)
        }} />
        <figcaption className="mt-3 truncate text-xs text-base-content/75">{file?.name}</figcaption>
      </figure> : <div className="py-5">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-3xl text-primary" aria-hidden="true">↑</span>
        <p className="text-lg font-bold">Glisse ton image ici</p>
        <p className="mt-1 text-sm text-base-content/65">Le choix est discutable. Le format, un peu moins.</p>
      </div>}
      <button type="button" className="btn btn-outline min-h-11 w-full sm:w-auto" disabled={disabled} onClick={() => input.current?.click()}>
        {preview ? 'Changer l’image' : 'Choisir un fichier'}
      </button>
      <p className="mt-4 text-xs leading-relaxed text-base-content/65" id="image-limits">JPEG, PNG ou WebP non animé · 5 Mio maximum · 20 mégapixels maximum.</p>
      {error && <div className="image-error mt-4 text-left"><Feedback tone="error">{error}</Feedback></div>}
    </div>
  )
}
