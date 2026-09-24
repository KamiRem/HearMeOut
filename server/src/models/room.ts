import type { GameSettings, Player } from '@hear-me-out/shared'
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
}
