import { randomInt, randomUUID } from 'node:crypto'
import { DEFAULT_GAME_SETTINGS, MIN_PLAYERS } from '@hear-me-out/shared'
import type { ErrorCode, GameSettings, RoomMembership, RoomSnapshot } from '@hear-me-out/shared'
import type { GameRoom, ServerPlayer } from '../models/room.ts'
import { createGameMachine, projectGameState, transitionGame, type RoundEvent } from '../game/gameMachine.ts'

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
      settings: { ...DEFAULT_GAME_SETTINGS }, settingsRevision: 1, game: createGameMachine(),
    }
    this.rooms.set(code, room)
    this.memberships.set(connectionId, { code, playerId: player.id })
    return { room: this.snapshot(room), playerId: player.id }
  }

  join(connectionId: string, code: string, nickname: string): RoomMembership {
    this.assertAvailable(connectionId)
    const room = this.rooms.get(code)
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Ce salon est introuvable ou a été fermé.')
    this.assertLobby(room)
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

  setReady(connectionId: string, roomId: string, settingsRevision: number, isReady: boolean): RoomMembership {
    const { room, player } = this.lobbyMember(connectionId, roomId, settingsRevision)
    if (player.isReady !== isReady) {
      player.isReady = isReady
      room.revision++
    }
    return { room: this.snapshot(room), playerId: player.id }
  }

  updateSettings(connectionId: string, roomId: string, settingsRevision: number, settings: GameSettings): RoomMembership {
    const { room, player } = this.lobbyMember(connectionId, roomId, settingsRevision, true)
    if (room.settings.rounds !== settings.rounds
      || room.settings.submissionDuration !== settings.submissionDuration
      || room.settings.voteDuration !== settings.voteDuration) {
      room.settings = { ...settings }
      room.settingsRevision++
      for (const member of room.players.values()) member.isReady = false
      room.revision++
    }
    return { room: this.snapshot(room), playerId: player.id }
  }

  startGame(connectionId: string, roomId: string, settingsRevision: number): RoomMembership {
    const { room, player } = this.lobbyMember(connectionId, roomId, settingsRevision, true)
    if (room.players.size < MIN_PLAYERS) {
      throw new RoomError('NOT_ENOUGH_PLAYERS', 'Il faut au moins deux joueurs pour lancer la partie.')
    }
    if ([...room.players.values()].some((member) => !member.isReady)) {
      throw new RoomError('PLAYERS_NOT_READY', 'Tous les joueurs doivent être prêts, Host compris.')
    }
    room.game = transitionGame(room.game, {
      type: 'START_GAME', expectedVersion: room.game.state.version,
      gameId: randomUUID(), roundId: randomUUID(), startedAt: Date.now(),
      participantIds: [...room.players.keys()], totalRounds: room.settings.rounds,
    })
    room.revision++
    return { room: this.snapshot(room), playerId: player.id }
  }

  // Internal orchestration entry point for future timers/services, never a socket command.
  advanceGame(roomId: string, event: RoundEvent): RoomSnapshot {
    const room = [...this.rooms.values()].find((candidate) => candidate.id === roomId)
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Ce salon est introuvable ou a été fermé.')
    const next = transitionGame(room.game, event)
    room.game = next
    room.revision++
    return this.snapshot(room)
  }

  private lobbyMember(connectionId: string, roomId: string, settingsRevision: number, hostOnly = false) {
    const membership = this.memberships.get(connectionId)
    const room = membership && this.rooms.get(membership.code)
    const player = membership && room?.players.get(membership.playerId)
    if (!room || room.id !== roomId || !player) {
      throw new RoomError('NOT_A_MEMBER', 'Tu ne fais pas partie de ce salon.')
    }
    if (hostOnly && player.id !== room.hostPlayerId) {
      throw new RoomError('HOST_ONLY', 'Seul le Host peut effectuer cette action.')
    }
    this.assertLobby(room)
    if (settingsRevision !== room.settingsRevision) {
      throw new RoomError('STALE_SETTINGS', 'Les paramètres ont changé. Vérifie-les puis réessaie.')
    }
    return { room, player }
  }

  private assertLobby(room: GameRoom) {
    if (room.game.state.phase !== 'LOBBY') throw new RoomError('INVALID_PHASE', 'La partie est déjà lancée. Le lobby est verrouillé.')
  }

  private assertAvailable(connectionId: string) {
    if (this.memberships.has(connectionId)) {
      throw new RoomError('ALREADY_IN_ROOM', 'Quitte ton salon actuel avant d’en rejoindre un autre.')
    }
  }

  private player(connectionId: string, nickname: string): ServerPlayer {
    return { id: randomUUID(), nickname, connectionId, isReady: false }
  }

  private snapshot(room: GameRoom): RoomSnapshot {
    return {
      id: room.id,
      code: room.code,
      hostPlayerId: room.hostPlayerId,
      revision: room.revision,
      capacity: this.capacity,
      players: [...room.players.values()].map(({ id, nickname, isReady }) => ({ id, nickname, isReady })),
      settings: { ...room.settings },
      settingsRevision: room.settingsRevision,
      state: projectGameState(room.game),
    }
  }
}
