import type { ClientToServerEvents, HealthResponse, ServerToClientEvents } from '@hear-me-out/shared'
import Fastify from 'fastify'
import { Server } from 'socket.io'
import { registerHandlers } from './socket/registerHandlers.ts'

interface AppOptions {
  clientOrigin: string
  logger?: boolean
}

export function buildApp({ clientOrigin, logger = false }: AppOptions) {
  const app = Fastify({ logger })
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

  registerHandlers(io)

  // Close WebSockets before Fastify waits for its HTTP connections to end.
  app.addHook('preClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()))
  })

  return app
}
