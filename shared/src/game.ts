interface GameContext {
  id: string
  startedAt: number
  participantIds: readonly string[]
  totalRounds: number
  version: number
}

interface RoundContext {
  roundId: string
  roundNumber: number
}

export type GameState =
  | { phase: 'LOBBY'; version: number }
  | (GameContext & RoundContext & { phase: 'SUBMISSION' | 'WAITING' | 'ROUND_RESULTS' })
  | (GameContext & RoundContext & {
      phase: 'REVEAL' | 'VOTING' | 'SUBMISSION_RESULTS'
      submissionId: string
    })
  | (GameContext & { phase: 'GAME_RESULTS' })

export type GamePhase = GameState['phase']
