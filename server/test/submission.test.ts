import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test, type TestContext } from 'node:test'
import type { ChoiceId, ErrorCode, RoomSnapshot, SubmissionCommand } from '@hear-me-out/shared'
import { RoomError, RoomService, type SubmissionClock } from '../src/services/roomService.ts'

class FakeClock implements SubmissionClock {
  time = 1000
  tasks: { at: number; callback: () => void; cancelled: boolean }[] = []
  now() { return this.time }
  schedule(callback: () => void, delay: number) {
    const task = { at: this.time + delay, callback, cancelled: false }
    this.tasks.push(task)
    return () => { task.cancelled = true }
  }
  advance(milliseconds: number) {
    this.time += milliseconds
    for (const task of [...this.tasks]) {
      if (!task.cancelled && task.at <= this.time) {
        task.cancelled = true
        task.callback()
      }
    }
  }
  get pending() { return this.tasks.filter((task) => !task.cancelled).length }
}

function setup(t: TestContext, guests = 1) {
  const clock = new FakeClock()
  const published: RoomSnapshot[] = []
  const rooms = new RoomService({ clock, onRoomUpdate: (room) => published.push(room) })
  t.after(() => rooms.dispose())
  const { room } = rooms.create('host', 'Camille')
  for (let index = 0; index < guests; index++) rooms.join(`guest${index}`, room.code, `Alex${index}`)
  rooms.updateSettings('host', room.id, 1, { ...room.settings, submissionDuration: 15 })
  rooms.setReady('host', room.id, 2, true)
  for (let index = 0; index < guests; index++) rooms.setReady(`guest${index}`, room.id, 2, true)
  const started = rooms.startGame('host', room.id, 2)
  const state = started.room.state
  assert.ok(state.phase === 'SUBMISSION')
  const command = (choiceId: ChoiceId = 'robot'): SubmissionCommand => ({
    requestId: randomUUID(), roomId: room.id, gameId: state.id, roundId: state.roundId, choiceId,
  })
  return { rooms, clock, published, started, command }
}

function error(code: ErrorCode) {
  return (failure: unknown) => failure instanceof RoomError && failure.code === code
}

test('submission locks privately, exposes only counts and ends early for every participant', (t) => {
  const { rooms, clock, published, started, command } = setup(t)
  assert.equal(started.serverNow, 1000)
  assert.ok(started.room.state.phase === 'SUBMISSION')
  assert.equal(started.room.state.deadlineAt, 16000)
  const first = rooms.submit('host', command())
  assert.equal(first.ownSubmission.choiceId, 'robot')
  assert.equal(first.room.state.phase, 'SUBMISSION')
  assert.equal(first.room.submissionProgress?.submitted, 1)
  const guest = rooms.current('guest0')!
  assert.equal(guest.ownSubmission.choiceId, null)
  assert.equal(JSON.stringify(guest).includes('robot'), false)
  assert.equal('submissions' in first.room, false)
  assert.throws(() => rooms.submit('host', command('ghost')), error('ALREADY_SUBMITTED'))
  assert.deepEqual(rooms.current('host'), first)
  const ended = rooms.submit('guest0', command('dragon'))
  assert.equal(ended.room.state.phase, 'WAITING')
  assert.equal(ended.room.submissionProgress?.submitted, 2)
  assert.equal('deadlineAt' in ended.room.state, false)
  assert.equal(JSON.stringify(ended.room).includes('dragon'), false)
  assert.equal(clock.pending, 0)
  clock.advance(15000)
  assert.deepEqual(published, [])
  assert.throws(() => rooms.submit('guest0', command()), error('INVALID_PHASE'))
})

test('server expiration closes a partially filled round and broadcasts exactly once', (t) => {
  const { rooms, clock, published, command } = setup(t)
  rooms.submit('host', command())
  clock.advance(14999)
  assert.equal(rooms.current('host')?.room.state.phase, 'SUBMISSION')
  clock.advance(1)
  assert.equal(rooms.current('host')?.room.state.phase, 'WAITING')
  assert.equal(published.length, 1)
  assert.equal(published[0]?.submissionProgress?.submitted, 1)
  clock.advance(15000)
  assert.equal(published.length, 1)
})

test('late commands cannot beat a delayed timer, including at the exact deadline', (t) => {
  const { rooms, clock, published, command } = setup(t)
  clock.time = 16000 // Simulate a busy event loop: the timer callback has not run.
  assert.throws(() => rooms.submit('host', command()), error('DEADLINE_EXPIRED'))
  assert.equal(rooms.current('host')?.room.state.phase, 'ROUND_RESULTS')
  assert.equal(rooms.current('host')?.ownSubmission.choiceId, null)
  assert.equal(published.length, 1)
  clock.tasks[0]!.callback()
  assert.equal(published.length, 1)
  assert.equal(clock.pending, 0)
})

test('an empty round expires without inventing submissions', (t) => {
  const { rooms, clock, published } = setup(t)
  clock.advance(15000)
  assert.equal(published[0]?.state.phase, 'ROUND_RESULTS')
  assert.equal(rooms.current('host')?.room.submissionProgress?.submitted, 0)
  assert.equal(clock.pending, 0)
})

test('nonmembers, wrong room/game/round and unknown choices cannot submit', (t) => {
  const { rooms, command, started } = setup(t)
  assert.throws(() => rooms.submit('intruder', command()), error('NOT_A_MEMBER'))
  assert.throws(() => rooms.submit('host', { ...command(), roomId: randomUUID() }), error('NOT_A_MEMBER'))
  assert.throws(() => rooms.submit('host', { ...command(), gameId: randomUUID() }), error('STALE_ROUND'))
  assert.throws(() => rooms.submit('host', { ...command(), roundId: randomUUID() }), error('STALE_ROUND'))
  // @ts-expect-error Simulate an invalid caller beyond the typed boundary.
  assert.throws(() => rooms.submit('host', { ...command(), choiceId: 'unknown' }), error('INVALID_PAYLOAD'))
  assert.deepEqual(rooms.current('host'), started)
})

test('departing players without a choice stop blocking completion', (t) => {
  const { rooms, clock, command } = setup(t)
  rooms.submit('host', command())
  const departure = rooms.leave('guest0')!
  assert.equal(departure.snapshot?.state.phase, 'WAITING')
  assert.equal(departure.snapshot?.submissionProgress?.expected, 1)
  assert.equal(clock.pending, 0)
})

test('a validated choice survives its author leaving, while remaining players may submit', (t) => {
  const { rooms, command } = setup(t, 2)
  rooms.submit('guest0', command('ghost'))
  const departure = rooms.leave('guest0')!
  assert.equal(departure.snapshot?.state.phase, 'SUBMISSION')
  assert.equal(departure.snapshot?.submissionProgress?.expected, 3)
  assert.equal(departure.snapshot?.submissionProgress?.submitted, 1)
  rooms.submit('host', command())
  assert.equal(rooms.submit('guest1', command('dragon')).room.state.phase, 'WAITING')
})

test('new rounds reset private choices and old timer callbacks cannot close them', (t) => {
  const { rooms, clock, command, started, published } = setup(t)
  const oldCallback = clock.tasks[0]!.callback
  rooms.submit('host', command())
  const state = started.room.state
  assert.ok(state.phase === 'SUBMISSION')
  const results = rooms.advanceGame(started.room.id, {
    type: 'END_SUBMISSION', gameId: state.id, roundId: state.roundId, expectedVersion: state.version, submissionIds: [],
  })
  const nextRoundId = randomUUID()
  const next = rooms.advanceGame(started.room.id, {
    type: 'NEXT_ROUND', gameId: state.id, roundId: state.roundId, expectedVersion: results.state.version,
    nextRoundId, deadlineAt: 31000,
  })
  assert.equal(next.submissionProgress?.submitted, 0)
  assert.deepEqual(rooms.current('host')?.ownSubmission, { roundId: nextRoundId, choiceId: null })
  oldCallback()
  assert.deepEqual(rooms.current('host')?.room, next)
  assert.throws(() => rooms.submit('host', command()), error('STALE_ROUND'))
  assert.equal(clock.pending, 1)
  clock.advance(30000)
  assert.equal(published.length, 1)
  assert.equal(published[0]?.state.phase, 'ROUND_RESULTS')
})

test('an early timer callback rearms without prematurely advancing the phase', (t) => {
  const { rooms, clock, published } = setup(t)
  clock.tasks[0]!.cancelled = true
  clock.tasks[0]!.callback()
  assert.equal(clock.pending, 1)
  assert.equal(rooms.current('host')?.room.state.phase, 'SUBMISSION')
  clock.advance(15000)
  assert.equal(published.length, 1)
})

test('closing the host room and disposing the service cancel every timer', (t) => {
  for (const close of ['host', 'dispose']) {
    const { rooms, clock, published } = setup(t)
    if (close === 'host') rooms.leave('host')
    else rooms.dispose()
    assert.equal(clock.pending, 0)
    clock.tasks[0]!.callback()
    assert.deepEqual(published, [])
    assert.equal(rooms.current('guest0'), null)
  }
})
