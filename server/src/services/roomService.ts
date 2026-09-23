import { randomInt, randomUUID } from 'node:crypto'
import type { ErrorCode, RoomMembership, RoomSnapshot } from '@hear-me-out/shared'
import type { GameRoom, ServerPlayer } from '../models/room.ts'

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode() {
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('')
}

export class RoomError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

interface Membership {
  code: string
  playerId: string
}

export interface Departure {
  roomId: string
  code: string
  snapshot: RoomSnapshot | null
}

interface RoomServiceOptions {
  generateCode?: () => string
  maxRooms?: number
  capacity?: number
}

export class RoomService {
  private readonly rooms = new Map<string, GameRoom>()
  private readonly memberships = new Map<string, Membership>()
  private readonly generateCode: () => string
  private readonly maxRooms: number
  private readonly capacity: number

  constructor({ generateCode = generateRoomCode, maxRooms = 1000, capacity = 12 }: RoomServiceOptions = {}) {
    this.generateCode = generateCode
    this.maxRooms = maxRooms
    this.capacity = capacity
  }

  current(connectionId: string): RoomMembership | null {
    const membership = this.memberships.get(connectionId)
    if (!membership) return null
    const room = this.rooms.get(membership.code)
    if (!room) return null
    return { room: this.snapshot(room), playerId: membership.playerId }
  }

  create(connectionId: string, nickname: string): RoomMembership {
    this.assertAvailable(connectionId)
    if (this.rooms.size >= this.maxRooms) {
      throw new RoomError('SERVER_CAPACITY', 'Le serveur est plein. Réessaie plus tard.')
    }

    let code: string | undefined
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = this.generateCode()
      if (!this.rooms.has(candidate)) {
        code = candidate
        break
      }
    }
    if (!code) throw new RoomError('SERVER_CAPACITY', 'Impossible de générer un code. Réessaie.')

    const player = this.player(connectionId, nickname)
    const room: GameRoom = {
      id: randomUUID(), code, hostPlayerId: player.id, revision: 1,
      players: new Map([[player.id, player]]),
    }
    this.rooms.set(code, room)
    this.memberships.set(connectionId, { code, playerId: player.id })
    return { room: this.snapshot(room), playerId: player.id }
  }

  join(connectionId: string, code: string, nickname: string): RoomMembership {
    this.assertAvailable(connectionId)
    const room = this.rooms.get(code)
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Ce salon est introuvable ou a été fermé.')
    if (room.players.size >= this.capacity) throw new RoomError('ROOM_FULL', 'Ce salon est complet.')
    const key = nickname.toLocaleLowerCase('fr')
    if ([...room.players.values()].some((player) => player.nickname.toLocaleLowerCase('fr') === key)) {
      throw new RoomError('NICKNAME_TAKEN', 'Ce pseudo est déjà utilisé dans le salon.')
    }

    const player = this.player(connectionId, nickname)
    room.players.set(player.id, player)
    room.revision++
    this.memberships.set(connectionId, { code, playerId: player.id })
    return { room: this.snapshot(room), playerId: player.id }
  }

  leave(connectionId: string, expectedRoomId?: string): Departure | null {
    const membership = this.memberships.get(connectionId)
    const room = membership && this.rooms.get(membership.code)
    if (!membership || !room || (expectedRoomId !== undefined && room.id !== expectedRoomId)) {
      if (expectedRoomId !== undefined) throw new RoomError('NOT_A_MEMBER', 'Tu ne fais pas partie de ce salon.')
      return null
    }

    if (membership.playerId === room.hostPlayerId) {
      for (const player of room.players.values()) this.memberships.delete(player.connectionId)
      this.rooms.delete(room.code)
      return { roomId: room.id, code: room.code, snapshot: null }
    }

    this.memberships.delete(connectionId)
    room.players.delete(membership.playerId)
    room.revision++
    return { roomId: room.id, code: room.code, snapshot: this.snapshot(room) }
  }

  private assertAvailable(connectionId: string) {
    if (this.memberships.has(connectionId)) {
      throw new RoomError('ALREADY_IN_ROOM', 'Quitte ton salon actuel avant d’en rejoindre un autre.')
    }
  }

  private player(connectionId: string, nickname: string): ServerPlayer {
    return { id: randomUUID(), nickname, connectionId }
  }

  private snapshot(room: GameRoom): RoomSnapshot {
    return {
      id: room.id,
      code: room.code,
      hostPlayerId: room.hostPlayerId,
      revision: room.revision,
      capacity: this.capacity,
      players: [...room.players.values()].map(({ id, nickname }) => ({ id, nickname })),
    }
  }
}
