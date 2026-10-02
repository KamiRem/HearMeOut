import type { ClientToServerEvents, HealthResponse, ServerToClientEvents } from '@hear-me-out/shared'
import Fastify from 'fastify'
import { Server } from 'socket.io'
import { registerHandlers } from './socket/registerHandlers.ts'
import { RoomService } from './services/roomService.ts'
import { ImageUploadService } from './services/imageUploadService.ts'
import type { ImageStorage } from './storage/imageStorage.ts'
import { registerImageUpload } from './routes/imageUpload.ts'

interface AppOptions {
  clientOrigin: string
  logger?: boolean
  imageStorage?: ImageStorage
}

export function buildApp({ clientOrigin, logger = false, imageStorage }: AppOptions) {
  const app = Fastify({ logger, requestTimeout: 30_000 })
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    maxHttpBufferSize: 16_384,
    allowRequest: (request, callback) => {
      const origin = request.headers.origin
      callback(null, origin === undefined || origin === clientOrigin)
    },
  })

  app.get<{ Reply: HealthResponse }>('/api/health', async () => ({
    status: 'ok',
    service: 'hear-me-out-server',
  }))

  const rooms = new RoomService({
    signImage: imageStorage ? (objectKey) => imageStorage.sign(objectKey) : undefined,
    onRoomUpdate: (room, serverNow) => io.to(`room:${room.code}`).emit('room:update', room, serverNow),
    onDiscardImage: (objectKey) => uploads.discard(objectKey),
    onSessionExpired: (departure) => {
      const channel = `room:${departure.code}`
      if (departure.snapshot) io.to(channel).emit('room:update', departure.snapshot, rooms.serverTime())
      else {
        io.to(channel).emit('room:closed', { roomId: departure.roomId, reason: 'HOST_DISCONNECTED' })
        io.in(channel).socketsLeave(channel)
      }
    },
  })
  const uploads = new ImageUploadService(rooms, imageStorage, (message) => app.log.warn(message))
  registerHandlers(io, rooms, uploads)
  app.register(async (scope) => registerImageUpload(scope, uploads, clientOrigin, (membership) => {
    io.to(`room:${membership.room.code}`).emit('room:update', membership.room, rooms.serverTime())
  }))

  // Close WebSockets before Fastify waits for its HTTP connections to end.
  app.addHook('preClose', async () => {
    uploads.stop()
    rooms.dispose()
    await new Promise<void>((resolve) => io.close(() => resolve()))
  })
  app.addHook('onClose', async () => uploads.drain())

  return app
}
