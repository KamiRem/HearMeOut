export interface Player {
  id: string
  nickname: string
}

export interface RoomSnapshot {
  id: string
  code: string
  hostPlayerId: string
  revision: number
  capacity: number
  players: Player[]
}

export interface RoomMembership {
  room: RoomSnapshot
  playerId: string
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
