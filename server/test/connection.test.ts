import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test, type TestContext } from 'node:test'
import type { ClientToServerEvents, ServerHello, ServerToClientEvents } from '@hear-me-out/shared'
import { io, type Socket } from 'socket.io-client'
import { buildApp } from '../src/app.ts'
import { readConfig } from '../src/config.ts'

const clientOrigin = 'http://localhost:5173'
type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>

async function startServer(t: TestContext) {
  const app = buildApp({ clientOrigin })
  t.after(() => app.close())
  const address = await app.listen({ host: '127.0.0.1', port: 0 })
  return { app, address }
}

function createClient(t: TestContext, address: string, transport: 'polling' | 'websocket') {
  const socket: ClientSocket = io(address, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: [transport],
    extraHeaders: { Origin: clientOrigin },
  })
  t.after(() => socket.disconnect())
  return socket
}

async function connect(socket: ClientSocket) {
  const welcome = new Promise<ServerHello>((resolve, reject) => {
    socket.once('connection:welcome', resolve)
    socket.once('connect_error', reject)
  })
  socket.connect()
  return welcome
}

test('HTTP health endpoint identifies the service', { timeout: 5000 }, async (t) => {
  const { app } = await startServer(t)
  const response = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { status: 'ok', service: 'hear-me-out-server' })
})

test('two independent clients receive welcome and private acknowledgements', { timeout: 10_000 }, async (t) => {
  const { address } = await startServer(t)
  // Cover both Socket.IO transports, including environments without WebSocket support.
  const clients = [createClient(t, address, 'polling'), createClient(t, address, 'websocket')]
  const welcomes = await Promise.all(clients.map(connect))
  for (const welcome of welcomes) {
    assert.equal(welcome.protocolVersion, 1)
    assert.ok(Number.isSafeInteger(welcome.serverNow))
  }
  assert.notEqual(clients[0]?.id, clients[1]?.id)

  await Promise.all(clients.map(async (socket) => {
    const requestId = randomUUID()
    const before = Date.now()
    const result = await socket.timeout(2000).emitWithAck('connection:ping', { requestId })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error(result.error.message)
    assert.equal(result.data.requestId, requestId)
    assert.ok(result.data.serverNow >= before && result.data.serverNow <= Date.now())
  }))
})

test('invalid payloads and missing acknowledgements do not break the server', { timeout: 10_000 }, async (t) => {
  const { address } = await startServer(t)
  const socket = createClient(t, address, 'websocket')
  await connect(socket)

  for (const payload of [null, {}, { requestId: 'invalid' }, { requestId: randomUUID(), extra: true }]) {
    // Deliberately bypass compile-time types to exercise untrusted wire input.
    const result = await socket.timeout(2000).emitWithAck('connection:ping', payload as { requestId: string })
    assert.equal(result.ok, false)
    if (result.ok) throw new Error('Invalid input was accepted')
    assert.equal(result.error.code, 'INVALID_PAYLOAD')
  }

  // @ts-expect-error Simulate an untyped client omitting the acknowledgement callback.
  socket.emit('connection:ping', { requestId: randomUUID() })
  const result = await socket.timeout(2000).emitWithAck('connection:ping', { requestId: randomUUID() })
  assert.equal(result.ok, true)
})

test('unexpected browser origins are rejected', { timeout: 5000 }, async (t) => {
  const { address } = await startServer(t)
  const socket = createClient(t, address, 'websocket')
  socket.io.opts.extraHeaders = { Origin: 'https://unexpected.example' }
  const rejected = new Promise<void>((resolve) => socket.once('connect_error', () => resolve()))
  socket.connect()
  await rejected
  assert.equal(socket.connected, false)
})

test('server shutdown closes an active client connection', { timeout: 5000 }, async (t) => {
  const { app, address } = await startServer(t)
  const socket = createClient(t, address, 'websocket')
  await connect(socket)
  const disconnected = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()))
  await app.close()
  await disconnected
  assert.equal(socket.connected, false)
})

test('server configuration has defaults and rejects invalid ports and origins', () => {
  assert.deepEqual(readConfig({}), { HOST: '127.0.0.1', PORT: 3001, CLIENT_ORIGIN: clientOrigin })
  assert.throws(() => readConfig({ PORT: 'not-a-number' }), /Configuration invalide/)
  assert.throws(() => readConfig({ PORT: '70000' }), /Configuration invalide/)
  assert.throws(() => readConfig({ CLIENT_ORIGIN: 'https://example.com/path' }), /Configuration invalide/)
  assert.throws(() => readConfig({ CLIENT_ORIGIN: 'ftp://example.com' }), /Configuration invalide/)
})
