import type { ClientToServerEvents, ServerToClientEvents } from '@hear-me-out/shared'
import type { Server } from 'socket.io'
import { z } from 'zod'
import { RoomService } from '../services/roomService.ts'
import { registerRoomHandlers } from './registerRoomHandlers.ts'

const pingSchema = z.strictObject({ requestId: z.uuid() })

export function registerHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  const rooms = new RoomService()
  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket, rooms)
    socket.emit('connection:welcome', { protocolVersion: 1, serverNow: Date.now() })

    socket.on('connection:ping', (payload, ack) => {
      // A remote client may ignore the TypeScript contract entirely.
      if (typeof ack !== 'function') return

      const result = pingSchema.safeParse(payload)
      if (!result.success) {
        ack({ ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Requête invalide.' } })
        return
      }

      ack({ ok: true, data: { requestId: result.data.requestId, serverNow: Date.now() } })
    })
  })
}
