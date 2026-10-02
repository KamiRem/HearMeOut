import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { RevealedSubmission } from '@hear-me-out/shared'
import { CakeBase } from './CakeBase'

const positions = [2, 3, 1, 4, 0, 5]

function RevealImage({ image, label }: { image: RevealedSubmission; label: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? <span className="reveal-image-error">Image indisponible</span>
    : <img src={image.previewUrl} width={image.width} height={image.height} alt={label}
        referrerPolicy="no-referrer" onError={() => setFailed(true)} />
}

export function RevealCake({ images, currentId }: { images: RevealedSubmission[]; currentId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<RevealedSubmission | null>(null)
  return (
    <>
      <div className="reveal-cake" aria-label={images.length ? 'Gâteau des images révélées' : 'Gâteau vide'}>
        <CakeBase />
        <ol className="m-0 list-none p-0" aria-label="Images révélées">
          {images.map((image, index) => <li key={image.submissionId}
            className={`reveal-pick${image.submissionId === currentId ? ' is-current' : ''}`}
            style={{ '--pick-left': `${8.5 + positions[index % 6]! * 16.6}%`,
              '--pick-top': index < 6 ? '20px' : '120px', '--pick-depth': index < 6 ? 1 : 2 } as CSSProperties}>
            <button className="reveal-photo transition-transform hover:-rotate-3" aria-label={`Agrandir l’image ${index + 1}${image.submissionId === currentId ? ', révélation actuelle' : ''}`}
              onClick={() => { setSelected(image); dialog.current?.showModal() }}>
              <RevealImage key={image.previewUrl} image={image} label={`Hear Me Out ${index + 1}`} />
              <span className="reveal-photo-number" aria-hidden="true">{index + 1}</span>
            </button>
          </li>)}
        </ol>
      </div>
      {images.length > 0 && <p className="mt-2 text-xs text-base-content/65">Touche une image pour l’agrandir.</p>}
      <dialog ref={dialog} className="reveal-dialog modal" aria-label="Image révélée agrandie">
        <div className="modal-box max-w-3xl border border-base-content/10 bg-base-200 [&_img]:mx-auto [&_img]:mt-5 [&_img]:max-h-[65svh] [&_img]:w-full [&_img]:object-contain">
        <button className="btn btn-outline min-h-11 w-full" autoFocus onClick={() => dialog.current?.close()}>Fermer l’image</button>
        {selected && <RevealImage key={selected.previewUrl} image={selected} label="Hear Me Out révélé" />}
        </div>
      </dialog>
    </>
  )
}
