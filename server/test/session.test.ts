import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { RoomService, RoomError, type Departure, type SubmissionClock } from '../src/services/roomService.ts'
import type { RoomSnapshot } from '@hear-me-out/shared'

class Clock implements SubmissionClock {
  time = 1000
  tasks: { at: number; cancelled: boolean; run: () => void }[] = []
  now() { return this.time }
  schedule(run: () => void, delay: number) {
    const task = { at: this.time + delay, cancelled: false, run }
    this.tasks.push(task)
    return () => { task.cancelled = true }
  }
  advance(ms: number) {
    this.time += ms
    for (const task of [...this.tasks]) if (!task.cancelled && task.at <= this.time) {
      task.cancelled = true
      task.run()
    }
  }
}

function setup(t: TestContext) {
  const clock = new Clock()
  const departures: Departure[] = []
  const updates: RoomSnapshot[] = []
  const rooms = new RoomService({ clock, onSessionExpired: (departure) => departures.push(departure),
    onRoomUpdate: (room) => updates.push(room) })
  t.after(() => rooms.dispose())
  const host = rooms.create('host', 'Camille')
  const guest = rooms.join('guest', host.room.code, 'Alex')
  return { rooms, clock, departures, updates, host, guest }
}

const expired = (error: unknown) => error instanceof RoomError && error.code === 'SESSION_EXPIRED'

test('resuming restores player, host, readiness, deadline and locked submission without exposing tokens', (t) => {
  const { rooms, clock, host, guest } = setup(t)
  rooms.setReady('host', host.room.id, 1, true)
  rooms.setReady('guest', host.room.id, 1, true)
  const state = rooms.startGame('host', host.room.id, 1).room.state
  assert.ok(state.phase === 'SUBMISSION')
  const scope = { roomId: host.room.id, gameId: state.id, roundId: state.roundId }
  const saved = rooms.submit('host', scope, {
    id: 'image', objectKey: 'secret.webp', previewUrl: 'https://storage.example/image', width: 1, height: 1,
  })
  rooms.disconnect('host')
  assert.equal(rooms.current('host'), null)
  assert.equal(rooms.current('guest')?.room.players.length, 2)
  clock.advance(10000)
  const restored = rooms.resume('new-host', host.sessionToken).membership
  assert.equal(restored.playerId, host.playerId)
  assert.equal(restored.room.hostPlayerId, host.playerId)
  assert.deepEqual(restored.room.state, state)
  assert.deepEqual(restored.ownSubmission, saved.ownSubmission)
  assert.equal(restored.room.players.find((player) => player.id === host.playerId)?.isReady, true)
  const guestView = rooms.current('guest')!
  assert.equal(JSON.stringify(guestView).includes(host.sessionToken), false)
  assert.equal(JSON.stringify(guestView.room).includes(guest.sessionToken), false)
  assert.equal(JSON.stringify(guestView.room).includes('secret.webp'), false)
  clock.advance(50000)
  assert.equal(rooms.current('new-host')?.playerId, host.playerId)
})

test('guests expire after 60 seconds and their token cannot recover the removed seat', (t) => {
  const { rooms, clock, departures, host, guest } = setup(t)
  rooms.disconnect('guest')
  clock.advance(59999)
  assert.equal(rooms.current('host')?.room.players.length, 2)
  clock.advance(1)
  assert.equal(departures.length, 1)
  assert.equal(departures[0]?.snapshot?.players.length, 1)
  assert.throws(() => rooms.resume('new-guest', guest.sessionToken), expired)
  assert.equal(rooms.current('host')?.room.id, host.room.id)
})

test('host expiry closes the room and revokes every player token even if callback was delayed', (t) => {
  const { rooms, clock, departures, host, guest } = setup(t)
  rooms.disconnect('host')
  clock.time += 60000 // Resume arrives before the scheduled callback.
  assert.throws(() => rooms.resume('new-host', host.sessionToken), expired)
  assert.equal(departures[0]?.snapshot, null)
  assert.equal(rooms.current('guest'), null)
  assert.throws(() => rooms.resume('new-guest', guest.sessionToken), expired)
  clock.advance(1)
  assert.equal(departures.length, 1)
})

test('host timeout callback closes the room without a resume attempt', (t) => {
  const { rooms, clock, departures } = setup(t)
  rooms.disconnect('host')
  clock.advance(60000)
  assert.equal(departures.length, 1)
  assert.equal(departures[0]?.snapshot, null)
  assert.equal(rooms.current('guest'), null)
})

test('live session handoff detaches the previous connection and old callbacks cannot expire its replacement', (t) => {
  const { rooms, clock, host, departures } = setup(t)
  rooms.disconnect('host')
  const staleCallback = clock.tasks[0]!.run
  rooms.resume('new-host', host.sessionToken)
  const takeover = rooms.resume('third-host', host.sessionToken)
  assert.equal(takeover.previousConnectionId, 'new-host')
  assert.equal(rooms.current('new-host'), null)
  rooms.disconnect('new-host')
  clock.advance(60000)
  staleCallback()
  assert.deepEqual(departures, [])
  assert.equal(rooms.current('third-host')?.room.players.length, 2)
})

test('disconnected players cannot act or let the host start until restored', (t) => {
  const { rooms, host, guest } = setup(t)
  rooms.setReady('host', host.room.id, 1, true)
  rooms.setReady('guest', host.room.id, 1, true)
  rooms.disconnect('guest')
  assert.throws(() => rooms.setReady('guest', host.room.id, 1, false), (error) => error instanceof RoomError && error.code === 'NOT_A_MEMBER')
  assert.throws(() => rooms.startGame('host', host.room.id, 1), (error) => error instanceof RoomError && error.code === 'PLAYERS_NOT_READY')
  rooms.resume('new-guest', guest.sessionToken)
  assert.equal(rooms.startGame('host', host.room.id, 1).room.state.phase, 'SUBMISSION')
})

test('explicit leaving and shutdown cancel resumption immediately', (t) => {
  const { rooms, clock, departures, host, guest } = setup(t)
  rooms.leave('guest')
  assert.throws(() => rooms.resume('guest2', guest.sessionToken), expired)
  rooms.disconnect('host')
  rooms.dispose()
  assert.throws(() => rooms.resume('host2', host.sessionToken), expired)
  clock.advance(60000)
  assert.deepEqual(departures, [])
})
