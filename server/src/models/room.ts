import type { ChoiceId, GameSettings, Player } from '@hear-me-out/shared'
import type { GameMachine } from '../game/gameMachine.ts'

export interface ServerPlayer extends Player {
  connectionId: string
}

export interface GameRoom {
  id: string
  code: string
  hostPlayerId: string
  revision: number
  players: Map<string, ServerPlayer>
  settings: GameSettings
  settingsRevision: number
  game: GameMachine
  submissionRound: SubmissionRound | null
}

export interface Submission {
  id: string
  roundId: string
  playerId: string
  choiceId: ChoiceId
  submittedAt: number
}

export interface SubmissionRound {
  id: string
  expectedPlayerIds: Set<string>
  submissions: Map<string, Submission>
}
