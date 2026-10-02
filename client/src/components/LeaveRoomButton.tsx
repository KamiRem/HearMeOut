interface LeaveRoomButtonProps {
  isHost: boolean
  inGame?: boolean
  disabled: boolean
  leaveRoom: () => Promise<void> | undefined
}

export function LeaveRoomButton({ isHost, inGame = false, disabled, leaveRoom }: LeaveRoomButtonProps) {
  return (
    <div className="leave-room">
      <p className="leave-hint" id="leave-hint">
        {isHost ? 'Si tu pars, le salon sera fermé pour tout le monde.'
          : inGame ? 'Quitter met fin à ta session : tu ne pourras plus rejoindre cette partie.'
            : 'Tu pourras revenir avec le même code tant que le salon reste ouvert.'}
      </p>
      <button className="secondary-button" disabled={disabled} aria-describedby="leave-hint" onClick={() => void leaveRoom()}>
        {isHost ? 'Fermer le salon et quitter' : 'Quitter le salon'}
      </button>
    </div>
  )
}
