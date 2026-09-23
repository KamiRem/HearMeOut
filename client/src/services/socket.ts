import type { ClientToServerEvents, ServerToClientEvents } from '@hear-me-out/shared'
import { io, type Socket } from 'socket.io-client'

export function createSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  // Same origin: Vite proxies HTTP polling and WebSocket upgrades to Fastify.
  return io({ autoConnect: false })
}
