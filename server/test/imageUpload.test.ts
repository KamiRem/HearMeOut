import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test, type TestContext } from 'node:test'
import sharp from 'sharp'
import { io, type Socket } from 'socket.io-client'
import { IMAGE_LIMITS } from '@hear-me-out/shared'
import type { ClientToServerEvents, ServerToClientEvents, Result, RoomMembership, ImageUploadTicket, RoomSnapshot } from '@hear-me-out/shared'
import { buildApp } from '../src/app.ts'
import { RoomError, RoomService } from '../src/services/roomService.ts'
import { ImageUploadService } from '../src/services/imageUploadService.ts'
import { validateImage } from '../src/services/validateImage.ts'
import { SupabaseImageStorage, type ImageStorage } from '../src/storage/imageStorage.ts'
import { readConfig } from '../src/config.ts'

class MemoryStorage implements ImageStorage {
  objects = new Map<string, Buffer>()
  removed: string[] = []
  async put(key: string, data: Buffer) {
    this.objects.set(key, data)
    return `https://storage.example/private/${key}?token=test`
  }
  async remove(key: string) { this.removed.push(key); this.objects.delete(key) }
}

const origin = 'http://localhost:5173'
type Client = Socket<ServerToClientEvents, ClientToServerEvents>
const png = () => sharp({ create: { width: 12, height: 8, channels: 3, background: '#efac46' } }).png().toBuffer()

function value<T>(result: Result<T>): T {
  assert.ok(result.ok, result.ok ? '' : result.error.message)
  return result.data
}

function failure(result: Result<unknown>, code: string) {
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, code)
}

async function setup(t: TestContext, storage: ImageStorage | undefined = new MemoryStorage(), disabled = false) {
  const app = buildApp({ clientOrigin: origin, imageStorage: disabled ? undefined : storage })
  const address = await app.listen({ host: '127.0.0.1', port: 0 })
  const clients: Client[] = []
  t.after(async () => { for (const client of clients) client.disconnect(); await app.close() })
  async function connect() {
    const client: Client = io(address, { autoConnect: false, reconnection: false, transports: ['websocket'] })
    clients.push(client)
    const ready = new Promise<void>((resolve, reject) => {
      client.once('connection:welcome', () => resolve())
      client.once('connect_error', reject)
    })
    client.connect()
    await ready
    return client
  }
  const host = await connect()
  const guest = await connect()
  const created = value<RoomMembership>(await host.timeout(2000).emitWithAck('room:create', { requestId: randomUUID(), nickname: 'Camille' }))
  value(await guest.timeout(2000).emitWithAck('room:join', { requestId: randomUUID(), code: created.room.code, nickname: 'Alex' }))
  for (const client of [host, guest]) value(await client.timeout(2000).emitWithAck('player:ready', {
    requestId: randomUUID(), roomId: created.room.id, settingsRevision: 1, isReady: true,
  }))
  const started = value<RoomMembership>(await host.timeout(2000).emitWithAck('game:start', {
    requestId: randomUUID(), roomId: created.room.id, settingsRevision: 1,
  }))
  const state = started.room.state
  assert.ok(state.phase === 'SUBMISSION')
  const scope = { roomId: created.room.id, gameId: state.id, roundId: state.roundId }
  const prepare = (client = host) => client.timeout(2000).emitWithAck('image:prepare', { ...scope, requestId: randomUUID() })
  const upload = (ticket: ImageUploadTicket, payload: Buffer, type = 'image/png') => app.inject({
    method: 'POST', url: '/api/images', payload,
    headers: { authorization: `Bearer ${ticket.token}`, 'content-type': type, origin },
  })
  const sync = (client = host) => client.timeout(2000).emitWithAck('room:sync', { requestId: randomUUID() })
  return { app, host, guest, connect, scope, prepare, upload, sync }
}

test('real image uploads lock privately, recover through sync and close the phase for everyone', { timeout: 10000 }, async (t) => {
  const storage = new MemoryStorage()
  const { host, guest, prepare, upload, sync, app } = await setup(t, storage)
  const ticket = value<ImageUploadTicket>(await prepare())
  const broadcast = new Promise<RoomSnapshot>((resolve) => guest.once('room:update', resolve))
  const response = await upload(ticket, await png())
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['cache-control'], 'no-store')
  const own = value<RoomMembership>(response.json())
  assert.equal(own.ownSubmission.image?.width, 12)
  assert.equal(own.ownSubmission.image?.height, 8)
  assert.match(own.ownSubmission.image!.previewUrl, /^https:\/\/storage.example\/private\//)
  assert.equal('objectKey' in own.ownSubmission.image!, false)
  const publicRoom = await broadcast
  assert.equal(publicRoom.submissionProgress?.submitted, 1)
  assert.equal(JSON.stringify(publicRoom).includes('previewUrl'), false)
  assert.equal(value<RoomMembership | null>(await sync(guest))?.ownSubmission.image, null)
  assert.deepEqual(value<RoomMembership | null>(await sync(host))?.ownSubmission.image, own.ownSubmission.image)
  failure((await upload(ticket, await png())).json(), 'INVALID_UPLOAD_TOKEN')
  failure(await prepare(), 'ALREADY_SUBMITTED')
  const bothDone = new Promise<RoomSnapshot>((resolve) => host.once('room:update', resolve))
  const second = value<RoomMembership>((await upload(value<ImageUploadTicket>(await prepare(guest)), await png())).json())
  assert.equal(second.room.state.phase, 'WAITING')
  assert.deepEqual(await bothDone, second.room)
  assert.equal(storage.objects.size, 2)
  for (const [key, data] of storage.objects) {
    assert.match(key, /^[\da-f-]+\/[\da-f-]+\/[\da-f-]+\.webp$/)
    assert.equal((await sharp(data).metadata()).format, 'webp')
  }
  await app.close()
  assert.equal(storage.objects.size, 0)
})

test('upload authorization rejects strangers, spoofing, stale rounds and duplicate tickets', { timeout: 10000 }, async (t) => {
  const { host, connect, scope, app, upload, sync } = await setup(t)
  const stranger = await connect()
  const command = { ...scope, requestId: randomUUID() }
  failure(await stranger.timeout(2000).emitWithAck('image:prepare', command), 'NOT_A_MEMBER')
  const spoofed = { ...command, playerId: randomUUID() }
  failure(await host.timeout(2000).emitWithAck('image:prepare', spoofed), 'INVALID_PAYLOAD')
  failure(await host.timeout(2000).emitWithAck('image:prepare', { ...command, roundId: randomUUID() }), 'STALE_ROUND')
  const valid = { ...scope, requestId: randomUUID() }
  const ticket = value<ImageUploadTicket>(await host.timeout(2000).emitWithAck('image:prepare', valid))
  assert.deepEqual(value(await host.timeout(2000).emitWithAck('image:prepare', valid)), ticket)
  failure(await host.timeout(2000).emitWithAck('image:prepare', { ...valid, roomId: randomUUID() }), 'REQUEST_CONFLICT')
  const missing = await app.inject({ method: 'POST', url: '/api/images', payload: await png(), headers: { 'content-type': 'image/png' } })
  assert.equal(missing.statusCode, 401)
  const foreign = await app.inject({ method: 'POST', url: '/api/images', payload: await png(), headers: {
    'content-type': 'image/png', authorization: `Bearer ${ticket.token}`, origin: 'https://other.example',
  } })
  assert.equal(foreign.statusCode, 401)
  value<RoomMembership>((await upload(ticket, await png())).json())
  assert.equal(value<RoomMembership | null>(await sync())?.room.submissionProgress?.submitted, 1)
})

test('HTTP body limits, invalid MIME and corrupt content reject uploads without locking the player', { timeout: 10000 }, async (t) => {
  const storage = new MemoryStorage()
  const { prepare, upload, sync } = await setup(t, storage)
  const validPng = await png()
  const animationChunk = Buffer.alloc(20)
  animationChunk.writeUInt32BE(8, 0)
  animationChunk.write('acTL', 4, 'ascii')
  const animatedPng = Buffer.concat([validPng.subarray(0, 33), animationChunk, validPng.subarray(33)])
  for (const [body, mime, code] of [
    [Buffer.alloc(IMAGE_LIMITS.maxBytes + 1), 'image/png', 'IMAGE_TOO_LARGE'],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png', 'INVALID_IMAGE'],
    [validPng, 'image/jpeg', 'INVALID_IMAGE'],
    [validPng.subarray(0, 35), 'image/png', 'INVALID_IMAGE'],
    [animatedPng, 'image/png', 'INVALID_IMAGE'],
    [validPng, 'image/gif', 'INVALID_IMAGE'],
    [Buffer.alloc(0), 'image/png', 'INVALID_IMAGE'],
  ] as const) {
    const result = await upload(value<ImageUploadTicket>(await prepare()), body, mime)
    failure(result.json(), code)
  }
  assert.equal(storage.objects.size, 0)
  assert.equal(value<RoomMembership | null>(await sync())?.ownSubmission.image, null)
  value<RoomMembership>((await upload(value<ImageUploadTicket>(await prepare()), validPng)).json())
})

test('storage is explicitly unavailable without configuration and failures can be retried', { timeout: 10000 }, async (t) => {
  const disabled = await setup(t, undefined, true)
  failure(await disabled.prepare(), 'UPLOAD_UNAVAILABLE')
  const storage = new MemoryStorage()
  let fail = true
  const put = storage.put.bind(storage)
  storage.put = async (key, data) => { if (fail) throw new Error('secret upstream details'); return put(key, data) }
  const enabled = await setup(t, storage)
  const result = await enabled.upload(value<ImageUploadTicket>(await enabled.prepare()), await png())
  failure(result.json(), 'STORAGE_ERROR')
  assert.equal(result.body.includes('secret upstream details'), false)
  assert.equal(value<RoomMembership | null>(await enabled.sync())?.ownSubmission.image, null)
  fail = false
  value<RoomMembership>((await enabled.upload(value<ImageUploadTicket>(await enabled.prepare()), await png())).json())
})

test('validation decodes accepted formats, strips metadata, resizes and limits pixels', async () => {
  for (const [format, mime] of [['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']] as const) {
    const input = await sharp({ create: { width: 2100, height: 20, channels: 3, background: '#ff6600' } })
      .withMetadata().toFormat(format).toBuffer()
    const result = await validateImage(input, mime)
    const metadata = await sharp(result.data).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, 2048)
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.icc, undefined)
  }
  const large = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: 'white' } }).png().toBuffer()
  await assert.rejects(validateImage(large, 'image/png'), (error) => error instanceof RoomError && error.code === 'INVALID_IMAGE')
})

test('in-flight storage cannot submit after expiry or departure and cleans the object', async (t) => {
  for (const mode of ['deadline', 'departure']) {
    let now = 1000
    const storage = new MemoryStorage()
    const rooms = new RoomService({ clock: { now: () => now, schedule: () => () => {} } })
    const uploads = new ImageUploadService(rooms, storage, () => {})
    t.after(async () => { uploads.stop(); rooms.dispose(); await uploads.drain() })
    const { room } = rooms.create('host', 'Camille')
    rooms.join('guest', room.code, 'Alex')
    rooms.setReady('host', room.id, 1, true)
    rooms.setReady('guest', room.id, 1, true)
    const state = rooms.startGame('host', room.id, 1).room.state
    assert.ok(state.phase === 'SUBMISSION')
    const scope = { roomId: room.id, gameId: state.id, roundId: state.roundId }
    const ticket = uploads.reserve(uploads.prepare('host', scope).token)
    assert.throws(() => uploads.prepare('host', scope), (error) => error instanceof RoomError && error.code === 'UPLOAD_BUSY')
    const put = storage.put.bind(storage)
    storage.put = async (key, data) => {
      const url = await put(key, data)
      if (mode === 'deadline') now = state.deadlineAt
      else rooms.leave('host')
      return url
    }
    await assert.rejects(uploads.upload(ticket, await png(), 'image/png'), (error) => error instanceof RoomError
      && error.code === (mode === 'deadline' ? 'DEADLINE_EXPIRED' : 'NOT_A_MEMBER'))
    uploads.release(ticket)
    await uploads.drain()
    assert.equal(storage.objects.size, 0)
    assert.equal(storage.removed.length, 1)
    if (mode === 'deadline') assert.equal(rooms.current('host')?.room.submissionProgress?.submitted, 0)
  }
})

test('Supabase adapter uses a private bucket, safe binary upload and a signed preview', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const request: typeof fetch = async (input, init = {}) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('/bucket/')) return Response.json({ public: false })
    if (url.includes('/object/sign/')) return Response.json({ signedURL: '/object/sign/images/test.webp?token=private' })
    return Response.json({})
  }
  const storage = new SupabaseImageStorage({ url: 'https://project.supabase.co', key: 'sb_secret_test', bucket: 'images' }, request)
  const url = await storage.put('test.webp', Buffer.from('encoded'))
  assert.equal(url, 'https://project.supabase.co/storage/v1/object/sign/images/test.webp?token=private')
  assert.equal(calls[1]?.init.method, 'POST')
  assert.equal(new Headers(calls[1]?.init.headers).get('x-upsert'), 'false')
  assert.equal(new Headers(calls[1]?.init.headers).get('apikey'), 'sb_secret_test')
  assert.equal(new Headers(calls[1]?.init.headers).get('content-type'), 'image/webp')
  assert.equal(calls[1]?.init.redirect, 'error')
  await storage.remove('test.webp')
  assert.equal(calls[3]?.init.body, JSON.stringify({ prefixes: ['test.webp'] }))
  const publicStorage = new SupabaseImageStorage({ url: 'https://project.supabase.co', key: 'key', bucket: 'images' },
    async () => Response.json({ public: true }))
  await assert.rejects(publicStorage.put('test.webp', Buffer.from('data')), /private/)
})

test('storage configuration requires a complete server-only configuration', () => {
  assert.throws(() => readConfig({ SUPABASE_URL: 'https://project.supabase.co' }), /Configurer ensemble/)
  const config = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_STORAGE_BUCKET: 'images' }
  assert.equal(readConfig(config).SUPABASE_STORAGE_BUCKET, 'images')
  assert.throws(() => readConfig({ ...config, SUPABASE_URL: 'http://external.example' }), /Configuration invalide/)
  assert.throws(() => readConfig({ ...config, SUPABASE_STORAGE_BUCKET: '../images' }), /Configuration invalide/)
})
