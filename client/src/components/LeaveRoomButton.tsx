interface LeaveRoomButtonProps {
  isHost: boolean
  inGame?: boolean
  disabled: boolean
  leaveRoom: () => Promise<void> | undefined
}

export function LeaveRoomButton({ isHost, inGame = false, disabled, leaveRoom }: LeaveRoomButtonProps) {
  return (
    <div className="leave-room mt-8 flex flex-col items-start gap-3 border-t border-base-content/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-lg text-xs leading-relaxed text-base-content/65" id="leave-hint">
        {isHost ? 'Si tu pars, le salon sera fermé pour tout le monde.'
          : inGame ? 'Quitter met fin à ta session : tu ne pourras plus rejoindre cette partie.'
            : 'Tu pourras revenir avec le même code tant que le salon reste ouvert.'}
      </p>
      <button className="btn btn-ghost btn-error min-h-11 w-full sm:w-auto" disabled={disabled} aria-describedby="leave-hint" onClick={() => void leaveRoom()}>
        {isHost ? 'Fermer le salon et quitter' : 'Quitter le salon'}
      </button>
    </div>
  )
}
