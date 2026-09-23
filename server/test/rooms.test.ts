import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test, type TestContext } from 'node:test'
import type { ClientToServerEvents, Result, RoomClosed, RoomMembership, RoomSnapshot, ServerToClientEvents } from '@hear-me-out/shared'
import { io, type Socket } from 'socket.io-client'
import { buildApp } from '../src/app.ts'
import { generateRoomCode, RoomError, RoomService } from '../src/services/roomService.ts'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
const clientOrigin = 'http://localhost:5173'

function value<T>(result: Result<T>): T {
  assert.ok(result.ok, result.ok ? '' : result.error.message)
  return result.data
}

function failure<T>(result: Result<T>, code: string) {
  assert.equal(result.ok, false)
  if (result.ok) throw new Error('Expected an error')
  assert.equal(result.error.code, code)
}

async function setup(t: TestContext) {
  const app = buildApp({ clientOrigin })
  t.after(() => app.close())
  const address = await app.listen({ host: '127.0.0.1', port: 0 })
  return async () => {
    const socket: Client = io(address, {
      autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'],
      extraHeaders: { Origin: clientOrigin },
    })
    t.after(() => socket.disconnect())
    const welcome = new Promise<void>((resolve, reject) => {
      socket.once('connection:welcome', () => resolve())
      socket.once('connect_error', reject)
    })
    socket.connect()
    await welcome
    return socket
  }
}

function create(socket: Client, nickname = 'Camille'): Promise<Result<RoomMembership>> {
  return socket.timeout(2000).emitWithAck('room:create', { requestId: randomUUID(), nickname })
}

function join(socket: Client, code: string, nickname = 'Alex'): Promise<Result<RoomMembership>> {
  return socket.timeout(2000).emitWithAck('room:join', { requestId: randomUUID(), code, nickname })
}

function sync(socket: Client): Promise<Result<RoomMembership | null>> {
  return socket.timeout(2000).emitWithAck('room:sync', { requestId: randomUUID() })
}

function update(socket: Client) {
  return new Promise<RoomSnapshot>((resolve) => socket.once('room:update', resolve))
}

function closed(socket: Client) {
  return new Promise<RoomClosed>((resolve) => socket.once('room:closed', resolve))
}

test('create and join broadcast the same roster without exposing connection ids', { timeout: 10_000 }, async (t) => {
  const connect = await setup(t)
  const host = await connect()
  const guest = await connect()
  const created = value(await create(host, '  Émilie  '))
  assert.match(created.room.code, /^[A-HJ-NP-Z2-9]{6}$/)
  assert.equal(created.room.players[0]?.nickname, 'Émilie')
  assert.equal(created.room.hostPlayerId, created.playerId)
  assert.notEqual(created.playerId, host.id)

  const hostUpdate = update(host)
  const guestUpdate = update(guest)
  const joined = value(await join(guest, created.room.code.toLowerCase()))
  assert.deepEqual(await hostUpdate, joined.room)
  assert.deepEqual(await guestUpdate, joined.room)
  assert.equal(joined.room.players.length, 2)
  assert.equal(joined.room.revision, 2)
  for (const player of joined.room.players) assert.deepEqual(Object.keys(player).sort(), ['id', 'nickname'])
  assert.equal(value(await sync(guest))?.playerId, joined.playerId)
})

test('separate rooms are isolated and one connection cannot join twice', { timeout: 10_000 }, async (t) => {
  const connect = await setup(t)
  const first = await connect()
  const second = await connect()
  const guest = await connect()
  const a = value(await create(first))
  const b = value(await create(second))
  assert.notEqual(a.room.code, b.room.code)
  const leaked: RoomSnapshot[] = []
  second.on('room:update', (room) => leaked.push(room))
  value(await join(guest, a.room.code))
  failure(await join(guest, b.room.code), 'ALREADY_IN_ROOM')
  failure(await create(guest), 'ALREADY_IN_ROOM')
  // Ordered ack is a barrier for any earlier broadcasts to this connection.
  assert.equal(value(await sync(second))?.room.players.length, 1)
  assert.deepEqual(leaked, [])
})

test('unknown rooms, duplicate nicknames, malformed and spoofed commands are rejected', { timeout: 10_000 }, async (t) => {
  const connect = await setup(t)
  const host = await connect()
  const guest = await connect()
  failure(await join(guest, 'AAAAAA'), 'ROOM_NOT_FOUND')
  failure(await join(guest, '123'), 'INVALID_PAYLOAD')
  failure(await create(guest, ' '), 'INVALID_PAYLOAD')
  failure(await create(guest, '<script>'), 'INVALID_PAYLOAD')
  failure(await create(guest, 'a'.repeat(25)), 'INVALID_PAYLOAD')
  const room = value(await create(host, 'Émilie'))
  failure(await join(guest, room.room.code, '  e\u0301MILIE  '), 'NICKNAME_TAKEN')
  const spoofed = { requestId: randomUUID(), code: room.room.code, nickname: 'Alex', playerId: room.playerId }
  failure(await guest.timeout(2000).emitWithAck('room:join', spoofed), 'INVALID_PAYLOAD')
  failure(await guest.timeout(2000).emitWithAck('room:leave', {
    requestId: randomUUID(), roomId: room.room.id,
  }), 'NOT_A_MEMBER')
  // @ts-expect-error An untyped client may omit the required callback.
  guest.emit('room:create', { requestId: randomUUID(), nickname: 'Ignored' })
  assert.equal(value(await sync(guest)), null)
  assert.equal(value(await sync(host))?.room.players.length, 1)
})

test('replayed requests cannot duplicate members, change payload or resurrect a closed room', { timeout: 10_000 }, async (t) => {
  const connect = await setup(t)
  const host = await connect()
  const command = { requestId: randomUUID(), nickname: 'Camille' }
  const a = value<RoomMembership>(await host.timeout(2000).emitWithAck('room:create', command))
  const b = value<RoomMembership>(await host.timeout(2000).emitWithAck('room:create', command))
  assert.deepEqual(a, b)
  failure(await host.timeout(2000).emitWithAck('room:create', { ...command, nickname: 'Changed' }), 'REQUEST_CONFLICT')
  const leave = { requestId: randomUUID(), roomId: a.room.id }
  value(await host.timeout(2000).emitWithAck('room:leave', leave))
  value(await host.timeout(2000).emitWithAck('room:leave', leave))
  failure(await host.timeout(2000).emitWithAck('room:create', command), 'STALE_REQUEST')
  assert.equal(value(await sync(host)), null)
})

test('guest departure updates the roster and unsubscribes the old connection', { timeout: 10_000 }, async (t) => {
  const connect = await setup(t)
  const host = await connect()
  const guest = await connect()
  const next = await connect()
  const room = value(await create(host))
  value(await join(guest, room.room.code))
  const left = update(host)
  value(await guest.timeout(2000).emitWithAck('room:leave', { requestId: randomUUID(), roomId: room.room.id }))
  assert.equal((await left).players.length, 1)
  assert.equal(value(await sync(guest)), null)
  const leaked: RoomSnapshot[] = []
  guest.on('room:update', (snapshot) => leaked.push(snapshot))
  value(await join(next, room.room.code, 'Nouveau'))
  await sync(guest)
  assert.deepEqual(leaked, [])
  value(await join(guest, room.room.code))
})

test('host departure closes the room, clears all memberships and allows new rooms', { timeout: 10_000 }, async (t) => {
  const connect = await setup(t)
  const host = await connect()
  const guest = await connect()
  const room = value(await create(host))
  value(await join(guest, room.room.code))
  const notification = closed(guest)
  value(await host.timeout(2000).emitWithAck('room:leave', { requestId: randomUUID(), roomId: room.room.id }))
  assert.deepEqual(await notification, { roomId: room.room.id, reason: 'HOST_LEFT' })
  assert.equal(value(await sync(guest)), null)
  failure(await join(guest, room.room.code), 'ROOM_NOT_FOUND')
  value(await create(guest))
})

test('guest disconnection removes the member and host disconnection closes the room', { timeout: 10_000 }, async (t) => {
  const connect = await setup(t)
  const host = await connect()
  const guest = await connect()
  const room = value(await create(host))
  value(await join(guest, room.room.code))
  const departed = update(host)
  guest.disconnect()
  assert.equal((await departed).players.length, 1)
  const other = await connect()
  value(await join(other, room.room.code))
  const notification = closed(other)
  host.disconnect()
  assert.equal((await notification).reason, 'HOST_DISCONNECTED')
  assert.equal(value(await sync(other)), null)
})

test('capacity remains twelve under simultaneous joins', { timeout: 10_000 }, async (t) => {
  const connect = await setup(t)
  const host = await connect()
  const room = value(await create(host))
  const guests = await Promise.all(Array.from({ length: 12 }, () => connect()))
  const results = await Promise.all(guests.map((guest, index) => join(guest, room.room.code, `Joueur ${index}`)))
  assert.equal(results.filter((result) => result.ok).length, 11)
  const rejected = results.find((result) => !result.ok)
  assert.ok(rejected)
  failure(rejected, 'ROOM_FULL')
  assert.equal(value(await sync(host))?.room.players.length, 12)
})

test('rate limiting bounds repeated room commands', { timeout: 10_000 }, async (t) => {
  const connect = await setup(t)
  const client = await connect()
  for (let index = 0; index < 40; index++) assert.equal(value(await sync(client)), null)
  failure(await sync(client), 'RATE_LIMITED')
})

test('code collisions are retried, room capacity is bounded and public snapshots are copies', () => {
  const candidates = ['AAAAAA', 'AAAAAA', 'BBBBBB']
  const rooms = new RoomService({ generateCode: () => candidates.shift() ?? 'CCCCCC', maxRooms: 2 })
  const first = rooms.create('first', 'Camille')
  const second = rooms.create('second', 'Alex')
  assert.equal(second.room.code, 'BBBBBB')
  assert.throws(() => rooms.create('third', 'Sam'), (error) => error instanceof RoomError && error.code === 'SERVER_CAPACITY')
  first.room.players[0]!.nickname = 'Changed client copy'
  assert.equal(rooms.current('first')?.room.players[0]?.nickname, 'Camille')
  assert.throws(() => rooms.leave('first', second.room.id), (error) => error instanceof RoomError && error.code === 'NOT_A_MEMBER')
  rooms.leave('first', first.room.id)
  assert.equal(rooms.create('third', 'Sam').room.code, 'CCCCCC')
  for (let index = 0; index < 100; index++) assert.match(generateRoomCode(), /^[A-HJ-NP-Z2-9]{6}$/)
})

test('code generation terminates even if every candidate collides', () => {
  const rooms = new RoomService({ generateCode: () => 'AAAAAA' })
  rooms.create('first', 'Camille')
  assert.throws(() => rooms.create('second', 'Alex'), (error) => error instanceof RoomError && error.code === 'SERVER_CAPACITY')
})
