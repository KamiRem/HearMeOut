import type { Player } from '@hear-me-out/shared'

export interface ServerPlayer extends Player {
  connectionId: string
}

export interface GameRoom {
  id: string
  code: string
  hostPlayerId: string
  revision: number
  players: Map<string, ServerPlayer>
}
