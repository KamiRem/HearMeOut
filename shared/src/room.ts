import type { GameSettings } from './lobby.ts'
import type { GameState } from './game.ts'
import type { OwnSubmission, SubmissionProgress } from './submission.ts'
import type { RevealedSubmission } from './reveal.ts'

export interface Player {
  id: string
  nickname: string
  isReady: boolean
  isConnected: boolean
}

export interface RoomSnapshot {
  id: string
  code: string
  hostPlayerId: string
  revision: number
  capacity: number
  players: Player[]
  settings: GameSettings
  settingsRevision: number
  state: GameState
  submissionProgress: SubmissionProgress | null
  revealedSubmissions: RevealedSubmission[]
}

export interface RoomMembership {
  room: RoomSnapshot
  playerId: string
  sessionToken: string
  ownSubmission: OwnSubmission
  serverNow: number
}

export interface RoomClosed {
  roomId: string
  reason: 'HOST_LEFT' | 'HOST_DISCONNECTED'
}

export interface CreateRoomCommand {
  requestId: string
  nickname: string
}

export interface JoinRoomCommand extends CreateRoomCommand {
  code: string
}

export interface LeaveRoomCommand {
  requestId: string
  roomId: string
}
