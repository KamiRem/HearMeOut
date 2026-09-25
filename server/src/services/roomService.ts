import { randomInt, randomUUID } from 'node:crypto'
import { DEFAULT_GAME_SETTINGS, DEMO_CHOICES, MIN_PLAYERS } from '@hear-me-out/shared'
import type { ErrorCode, GameSettings, RoomMembership, RoomSnapshot, SubmissionCommand } from '@hear-me-out/shared'
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
  clock?: SubmissionClock
  onRoomUpdate?: (room: RoomSnapshot, serverNow: number) => void
}

export interface SubmissionClock {
  now(): number
  schedule(callback: () => void, delay: number): () => void
}

const systemClock: SubmissionClock = {
  now: Date.now,
  schedule(callback, delay) {
    const timer = setTimeout(callback, delay)
    timer.unref()
    return () => clearTimeout(timer)
  },
}

export class RoomService {
  private readonly rooms = new Map<string, GameRoom>()
  private readonly memberships = new Map<string, Membership>()
  private readonly generateCode: () => string
  private readonly maxRooms: number
  private readonly capacity: number
  private readonly clock: SubmissionClock
  private readonly onRoomUpdate: NonNullable<RoomServiceOptions['onRoomUpdate']>
  private readonly timers = new Map<string, { cancel: () => void }>()

  constructor({ generateCode = generateRoomCode, maxRooms = 1000, capacity = 12,
    clock = systemClock, onRoomUpdate = () => {} }: RoomServiceOptions = {}) {
    this.generateCode = generateCode
    this.maxRooms = maxRooms
    this.capacity = capacity
    this.clock = clock
    this.onRoomUpdate = onRoomUpdate
  }

  serverTime() { return this.clock.now() }

  dispose() {
    for (const timer of this.timers.values()) timer.cancel()
    this.timers.clear()
    this.rooms.clear()
    this.memberships.clear()
  }

  current(connectionId: string): RoomMembership | null {
    const membership = this.memberships.get(connectionId)
    if (!membership) return null
    const room = this.rooms.get(membership.code)
    if (!room) return null
    return this.membership(room, membership.playerId)
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
      submissionRound: null,
    }
    this.rooms.set(code, room)
    this.memberships.set(connectionId, { code, playerId: player.id })
    return this.membership(room, player.id)
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
    return this.membership(room, player.id)
  }

  leave(connectionId: string, expectedRoomId?: string): Departure | null {
    const membership = this.memberships.get(connectionId)
    const room = membership && this.rooms.get(membership.code)
    if (!membership || !room || (expectedRoomId !== undefined && room.id !== expectedRoomId)) {
      if (expectedRoomId !== undefined) throw new RoomError('NOT_A_MEMBER', 'Tu ne fais pas partie de ce salon.')
      return null
    }

    if (membership.playerId === room.hostPlayerId) {
      this.cancelTimer(room.id)
      for (const player of room.players.values()) this.memberships.delete(player.connectionId)
      this.rooms.delete(room.code)
      return { roomId: room.id, code: room.code, snapshot: null }
    }

    this.memberships.delete(connectionId)
    room.players.delete(membership.playerId)
    room.revision++
    if (room.game.state.phase === 'SUBMISSION' && room.submissionRound) {
      const round = room.submissionRound
      if (!round.submissions.has(membership.playerId)) round.expectedPlayerIds.delete(membership.playerId)
      if (round.submissions.size === round.expectedPlayerIds.size || this.clock.now() >= room.game.state.deadlineAt) {
        this.finishSubmission(room)
      }
    }
    return { roomId: room.id, code: room.code, snapshot: this.snapshot(room) }
  }

  setReady(connectionId: string, roomId: string, settingsRevision: number, isReady: boolean): RoomMembership {
    const { room, player } = this.lobbyMember(connectionId, roomId, settingsRevision)
    if (player.isReady !== isReady) {
      player.isReady = isReady
      room.revision++
    }
    return this.membership(room, player.id)
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
    return this.membership(room, player.id)
  }

  startGame(connectionId: string, roomId: string, settingsRevision: number): RoomMembership {
    const { room, player } = this.lobbyMember(connectionId, roomId, settingsRevision, true)
    if (room.players.size < MIN_PLAYERS) {
      throw new RoomError('NOT_ENOUGH_PLAYERS', 'Il faut au moins deux joueurs pour lancer la partie.')
    }
    if ([...room.players.values()].some((member) => !member.isReady)) {
      throw new RoomError('PLAYERS_NOT_READY', 'Tous les joueurs doivent être prêts, Host compris.')
    }
    const startedAt = this.clock.now()
    room.game = transitionGame(room.game, {
      type: 'START_GAME', expectedVersion: room.game.state.version,
      gameId: randomUUID(), roundId: randomUUID(), startedAt,
      deadlineAt: startedAt + room.settings.submissionDuration * 1000,
      participantIds: [...room.players.keys()], totalRounds: room.settings.rounds,
    })
    room.revision++
    this.beginSubmission(room)
    return this.membership(room, player.id)
  }

  // Internal orchestration entry point for future timers/services, never a socket command.
  advanceGame(roomId: string, event: RoundEvent): RoomSnapshot {
    const room = [...this.rooms.values()].find((candidate) => candidate.id === roomId)
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Ce salon est introuvable ou a été fermé.')
    const next = transitionGame(room.game, event)
    this.cancelTimer(room.id)
    room.game = next
    room.revision++
    if (next.state.phase === 'SUBMISSION') this.beginSubmission(room)
    return this.snapshot(room)
  }

  submit(connectionId: string, command: SubmissionCommand): RoomMembership {
    const member = this.memberships.get(connectionId)
    const room = member && this.rooms.get(member.code)
    if (!member || !room || room.id !== command.roomId) {
      throw new RoomError('NOT_A_MEMBER', 'Tu ne fais pas partie de ce salon.')
    }
    const state = room.game.state
    if (state.phase === 'LOBBY' || state.phase === 'GAME_RESULTS'
      || state.id !== command.gameId || state.roundId !== command.roundId) {
      throw new RoomError('STALE_ROUND', 'Cette demande concerne un autre round.')
    }
    if (state.phase !== 'SUBMISSION') throw new RoomError('INVALID_PHASE', 'Les soumissions sont terminées.')
    if (this.clock.now() >= state.deadlineAt) {
      this.finishSubmission(room)
      this.onRoomUpdate(this.snapshot(room), this.serverTime())
      throw new RoomError('DEADLINE_EXPIRED', 'Le temps de soumission est écoulé.')
    }
    const round = room.submissionRound!
    if (!round.expectedPlayerIds.has(member.playerId)) throw new RoomError('NOT_A_MEMBER', 'Tu ne participes pas à ce round.')
    if (round.submissions.has(member.playerId)) throw new RoomError('ALREADY_SUBMITTED', 'Ton choix est déjà verrouillé.')
    if (!DEMO_CHOICES.some((choice) => choice.id === command.choiceId)) throw new RoomError('INVALID_PAYLOAD', 'Choix invalide.')
    round.submissions.set(member.playerId, {
      id: randomUUID(), roundId: round.id, playerId: member.playerId,
      choiceId: command.choiceId, submittedAt: this.clock.now(),
    })
    room.revision++
    if (round.submissions.size === round.expectedPlayerIds.size) this.finishSubmission(room)
    return this.membership(room, member.playerId)
  }

  private beginSubmission(room: GameRoom) {
    const state = room.game.state
    if (state.phase !== 'SUBMISSION') return
    room.submissionRound = {
      id: state.roundId, expectedPlayerIds: new Set(room.players.keys()), submissions: new Map(),
    }
    this.armTimer(room)
  }

  private armTimer(room: GameRoom) {
    const state = room.game.state
    if (state.phase !== 'SUBMISSION') return
    const timer = { cancel: () => {} }
    this.timers.set(room.id, timer)
    timer.cancel = this.clock.schedule(() => {
      if (this.timers.get(room.id) !== timer || room.game.state !== state) return
      this.timers.delete(room.id)
      if (this.clock.now() < state.deadlineAt) {
        this.armTimer(room)
        return
      }
      this.finishSubmission(room)
      this.onRoomUpdate(this.snapshot(room), this.serverTime())
    }, Math.max(0, state.deadlineAt - this.clock.now()))
  }

  private cancelTimer(roomId: string) {
    this.timers.get(roomId)?.cancel()
    this.timers.delete(roomId)
  }

  private finishSubmission(room: GameRoom) {
    const state = room.game.state
    if (state.phase !== 'SUBMISSION') return
    const submissionIds = [...room.submissionRound!.submissions.values()].map((submission) => submission.id)
    for (let index = submissionIds.length - 1; index > 0; index--) {
      const other = randomInt(index + 1)
      const previous = submissionIds[index]!
      submissionIds[index] = submissionIds[other]!
      submissionIds[other] = previous
    }
    this.advanceGame(room.id, {
      type: 'END_SUBMISSION', expectedVersion: state.version, gameId: state.id,
      roundId: state.roundId, submissionIds,
    })
  }

  private membership(room: GameRoom, playerId: string): RoomMembership {
    return {
      room: this.snapshot(room), playerId, serverNow: this.serverTime(),
      ownSubmission: {
        roundId: room.submissionRound?.id ?? null,
        choiceId: room.submissionRound?.submissions.get(playerId)?.choiceId ?? null,
      },
    }
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
      submissionProgress: room.submissionRound ? {
        roundId: room.submissionRound.id,
        submitted: room.submissionRound.submissions.size,
        expected: room.submissionRound.expectedPlayerIds.size,
      } : null,
    }
  }
}
