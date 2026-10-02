import { useEffect, useRef, useState } from 'react'
import { IMAGE_LIMITS } from '@hear-me-out/shared'

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
    <div className={`image-picker ${dragging && !disabled ? 'is-dragging' : ''}`} onDragOver={(event) => {
      event.preventDefault()
      if (!disabled) setDragging(true)
    }} onDragLeave={() => setDragging(false)} onDrop={(event) => {
      event.preventDefault()
      setDragging(false)
      choose(event.dataTransfer.files)
    }}>
      <label htmlFor="submission-image">Choisis ton image ou dépose-la ici</label>
      <p className="field-hint" id="image-limits">JPEG, PNG ou WebP non animé · 5 Mio maximum · 20 mégapixels maximum.</p>
      <input id="submission-image" type="file" accept={IMAGE_LIMITS.mimeTypes.join(',')} disabled={disabled}
        aria-describedby="image-limits" onChange={(event) => {
          choose(event.currentTarget.files)
          event.currentTarget.value = ''
        }} />
      {preview && <figure className="image-preview">
        <img src={preview} alt="Aperçu de ton Hear Me Out" onError={() => {
          setError('Impossible de lire cette image. Choisis un autre fichier.')
          clearPreview()
          onSelect(null)
        }} />
        <figcaption>{file?.name}</figcaption>
      </figure>}
      {error && <p className="image-error" role="alert">{error}</p>}
    </div>
  )
}
