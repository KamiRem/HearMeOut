import type { CreateRoomCommand, JoinRoomCommand, LeaveRoomCommand, RoomClosed, RoomMembership, RoomSnapshot } from './room.ts'
import type { LobbyCommand, ReadyCommand, UpdateSettingsCommand } from './lobby.ts'

export interface ServerHello {
  protocolVersion: 1
  serverNow: number
}

export interface HealthResponse {
  status: 'ok'
  service: 'hear-me-out-server'
}

export type ErrorCode =
  | 'INVALID_PAYLOAD'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_IN_ROOM'
  | 'NICKNAME_TAKEN'
  | 'NOT_A_MEMBER'
  | 'SERVER_CAPACITY'
  | 'RATE_LIMITED'
  | 'REQUEST_CONFLICT'
  | 'STALE_REQUEST'
  | 'INTERNAL_ERROR'
  | 'HOST_ONLY'
  | 'INVALID_PHASE'
  | 'STALE_SETTINGS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYERS_NOT_READY'

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } }

export type Ack<T> = (result: Result<T>) => void

export interface ClientToServerEvents {
  'player:ready': (payload: ReadyCommand, ack: Ack<RoomMembership>) => void
  'room:settings:update': (payload: UpdateSettingsCommand, ack: Ack<RoomMembership>) => void
  'game:start': (payload: LobbyCommand, ack: Ack<RoomMembership>) => void
  'room:create': (payload: CreateRoomCommand, ack: Ack<RoomMembership>) => void
  'room:join': (payload: JoinRoomCommand, ack: Ack<RoomMembership>) => void
  'room:leave': (payload: LeaveRoomCommand, ack: Ack<{ roomId: string }>) => void
  'room:sync': (payload: { requestId: string }, ack: Ack<RoomMembership | null>) => void
  'connection:ping': (
    payload: { requestId: string },
    ack: Ack<{ requestId: string; serverNow: number }>,
  ) => void
}

export interface ServerToClientEvents {
  'room:update': (room: RoomSnapshot) => void
  'room:closed': (event: RoomClosed) => void
  'connection:welcome': (payload: ServerHello) => void
}
