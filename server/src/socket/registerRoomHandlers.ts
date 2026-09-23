import type { Ack, ClientToServerEvents, Result, RoomClosed, ServerToClientEvents } from '@hear-me-out/shared'
import type { Server, Socket } from 'socket.io'
import type { z } from 'zod'
import { RoomError, RoomService, type Departure } from '../services/roomService.ts'
import { createRoomSchema, joinRoomSchema, leaveRoomSchema, syncRoomSchema } from './roomSchemas.ts'

type RoomServer = Server<ClientToServerEvents, ServerToClientEvents>
type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents>
interface CachedRequest {
  fingerprint: string
  result: Result<unknown>
  membershipRoomId?: string
}

export function registerRoomHandlers(io: RoomServer, socket: RoomSocket, rooms: RoomService) {
  // These bounded, connection-local caches are discarded on disconnect.
  const requests = new Map<string, CachedRequest>()
  let windowStartedAt = Date.now()
  let requestCount = 0

  function run<P extends { requestId: string }, T>(
    event: string, schema: z.ZodType<P>, payload: unknown, ack: Ack<T>, action: (command: P) => T,
  ) {
    if (typeof ack !== 'function') return
    if (Date.now() - windowStartedAt >= 10_000) {
      windowStartedAt = Date.now()
      requestCount = 0
    }
    if (++requestCount > 40) {
      ack({ ok: false, error: { code: 'RATE_LIMITED', message: 'Trop de demandes. Patiente quelques secondes.' } })
      return
    }
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      ack({ ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Vérifie le code et ton pseudo (2 à 24 caractères, lettres et chiffres).' } })
      return
    }
    const command = parsed.data
    const fingerprint = `${event}:${JSON.stringify(command)}`
    const cached = requests.get(command.requestId)
    if (cached) {
      if (cached.fingerprint !== fingerprint) {
        ack({ ok: false, error: { code: 'REQUEST_CONFLICT', message: 'Cette demande a déjà été utilisée.' } })
      } else if (cached.membershipRoomId && rooms.current(socket.id)?.room.id !== cached.membershipRoomId) {
        ack({ ok: false, error: { code: 'STALE_REQUEST', message: 'Cette demande concerne un ancien salon.' } })
      } else {
        // Matching event and normalized payload guarantee the cached result type.
        ack(cached.result as Result<T>)
      }
      return
    }

    let result: Result<T>
    try {
      result = { ok: true, data: action(command) }
    } catch (error) {
      if (!(error instanceof RoomError)) console.error('Room command failed', error)
      result = { ok: false, error: error instanceof RoomError
        ? { code: error.code, message: error.message }
        : { code: 'INTERNAL_ERROR', message: 'Une erreur est survenue. Réessaie.' } }
    }

    // Synchronization is a fresh read, never a replay of a past snapshot.
    if (event !== 'room:sync') {
      if (requests.size >= 100) {
        const oldest = requests.keys().next().value
        if (oldest !== undefined) requests.delete(oldest)
      }
      requests.set(command.requestId, {
        fingerprint, result,
        membershipRoomId: result.ok && (event === 'room:create' || event === 'room:join')
          ? rooms.current(socket.id)?.room.id : undefined,
      })
    }
    ack(result)
  }

  function publishDeparture(departure: Departure | null, reason: RoomClosed['reason']) {
    if (!departure) return
    const channel = `room:${departure.code}`
    if (departure.snapshot) {
      void socket.leave(channel)
      io.to(channel).emit('room:update', departure.snapshot)
    } else {
      io.to(channel).emit('room:closed', { roomId: departure.roomId, reason })
      io.in(channel).socketsLeave(channel)
    }
  }

  socket.on('room:create', (payload, ack) => run('room:create', createRoomSchema, payload, ack, (command) => {
    const membership = rooms.create(socket.id, command.nickname)
    // The MVP uses Socket.IO's synchronous, in-memory adapter on one process.
    void socket.join(`room:${membership.room.code}`)
    io.to(`room:${membership.room.code}`).emit('room:update', membership.room)
    return membership
  }))

  socket.on('room:join', (payload, ack) => run('room:join', joinRoomSchema, payload, ack, (command) => {
    const membership = rooms.join(socket.id, command.code, command.nickname)
    void socket.join(`room:${membership.room.code}`)
    io.to(`room:${membership.room.code}`).emit('room:update', membership.room)
    return membership
  }))

  socket.on('room:leave', (payload, ack) => run('room:leave', leaveRoomSchema, payload, ack, (command) => {
    publishDeparture(rooms.leave(socket.id, command.roomId), 'HOST_LEFT')
    return { roomId: command.roomId }
  }))

  socket.on('room:sync', (payload, ack) => run('room:sync', syncRoomSchema, payload, ack, () => rooms.current(socket.id)))

  socket.on('disconnect', () => {
    publishDeparture(rooms.leave(socket.id), 'HOST_DISCONNECTED')
    requests.clear()
  })
}
