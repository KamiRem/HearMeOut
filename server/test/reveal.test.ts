import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test, type TestContext } from 'node:test'
import type { ErrorCode, RevealCommand } from '@hear-me-out/shared'
import { RoomError, RoomService } from '../src/services/roomService.ts'

function setup(t: TestContext, signImage = async (key: string) => `https://storage.example/${key}?fresh=1`, count = 2) {
  const rooms = new RoomService({ signImage })
  t.after(() => rooms.dispose())
  const { room } = rooms.create('host', 'Camille')
  const connections = ['host', ...Array.from({ length: count - 1 }, (_, i) => `guest${i}`)]
  for (const connection of connections.slice(1)) rooms.join(connection, room.code, connection)
  for (const connection of connections) rooms.setReady(connection, room.id, 1, true)
  const started = rooms.startGame('host', room.id, 1)
  const state = started.room.state
  assert.ok(state.phase === 'SUBMISSION')
  const scope = { roomId: room.id, gameId: state.id, roundId: state.roundId }
  const command = (): RevealCommand => ({ ...scope, requestId: randomUUID(), expectedVersion: rooms.current('host')!.room.state.version })
  const submit = (connection: string) => rooms.submit(connection, scope, {
    id: randomUUID(), objectKey: `random-${connections.indexOf(connection)}.webp`,
    previewUrl: `https://expired.example/${connections.indexOf(connection)}`, width: 400, height: 300,
  })
  const submitAll = () => connections.forEach(submit)
  return { rooms, scope, command, submit, submitAll, connections }
}

const error = (code: ErrorCode) => (failure: unknown) => failure instanceof RoomError && failure.code === code

test('reveals publish only revealed images, renew URLs and retain the cake through results and resume', async (t) => {
  const signed: string[] = []
  const { rooms, command, submitAll } = setup(t, async (key) => {
    signed.push(key)
    return `https://storage.example/${key}?fresh=1`
  })
  submitAll()
  const waiting = rooms.current('host')!
  assert.deepEqual(waiting.room.revealedSubmissions, [])
  assert.equal(JSON.stringify(waiting.room).includes('https://'), false)
  const first = await rooms.reveal('host', command(), 'start')
  assert.equal(first.room.state.phase, 'REVEAL')
  assert.equal(first.room.revealedSubmissions.length, 1)
  assert.equal(signed.length, 1)
  const visible = first.room.revealedSubmissions[0]!
  assert.deepEqual(Object.keys(visible).sort(), ['height', 'previewUrl', 'submissionId', 'width'])
  assert.match(visible.previewUrl, /fresh=1$/)
  assert.equal(JSON.stringify(first.room).includes('expired.example'), false)
  const second = await rooms.reveal('host', command(), 'next')
  assert.equal(second.room.revealedSubmissions.length, 2)
  assert.equal(new Set(second.room.revealedSubmissions.map((image) => image.submissionId)).size, 2)
  assert.deepEqual(second.room.revealedSubmissions[0], visible)
  assert.deepEqual(rooms.current('guest0')!.room, second.room)
  rooms.disconnect('host')
  const resumed = rooms.resume('new-host', first.sessionToken).membership
  assert.deepEqual(resumed.room.revealedSubmissions, second.room.revealedSubmissions)
  const finished = await rooms.reveal('new-host', { ...commandFor(resumed.room.state), roomId: resumed.room.id }, 'next')
  assert.equal(finished.room.state.phase, 'ROUND_RESULTS')
  assert.deepEqual(finished.room.revealedSubmissions, second.room.revealedSubmissions)
  assert.equal(signed.length, 2)
})

function commandFor(state: ReturnType<RoomService['create']>['room']['state']) {
  assert.ok('roundId' in state)
  return { requestId: randomUUID(), expectedVersion: state.version, gameId: state.id, roundId: state.roundId }
}

test('host, membership, phase, game, round and version are checked before any storage access', async (t) => {
  let calls = 0
  const { rooms, command, submitAll } = setup(t, async () => { calls++; return 'https://storage.example/fresh' })
  await assert.rejects(rooms.reveal('host', command(), 'start'), error('INVALID_PHASE'))
  submitAll()
  await assert.rejects(rooms.reveal('stranger', command(), 'start'), error('NOT_A_MEMBER'))
  await assert.rejects(rooms.reveal('guest0', command(), 'start'), error('HOST_ONLY'))
  await assert.rejects(rooms.reveal('host', { ...command(), roomId: randomUUID() }, 'start'), error('NOT_A_MEMBER'))
  for (const field of ['gameId', 'roundId'] as const) {
    await assert.rejects(rooms.reveal('host', { ...command(), [field]: randomUUID() }, 'start'), error('STALE_ROUND'))
  }
  await assert.rejects(rooms.reveal('host', { ...command(), expectedVersion: 0 }, 'start'), error('STALE_REQUEST'))
  await assert.rejects(rooms.reveal('host', command(), 'next'), error('INVALID_PHASE'))
  rooms.disconnect('host')
  await assert.rejects(rooms.reveal('host', { ...commandFor(rooms.current('guest0')!.room.state), roomId: rooms.current('guest0')!.room.id }, 'start'), error('NOT_A_MEMBER'))
  assert.equal(calls, 0)
})

test('storage failures leave the same image pending and allow retry', async (t) => {
  let fail = true
  const keys: string[] = []
  const { rooms, command, submitAll } = setup(t, async (key) => {
    keys.push(key)
    if (fail) throw new Error('Storage unavailable')
    return `https://storage.example/${key}`
  })
  submitAll()
  const before = rooms.current('host')!.room
  await assert.rejects(rooms.reveal('host', command(), 'start'), error('STORAGE_ERROR'))
  assert.deepEqual(rooms.current('host')!.room, before)
  fail = false
  await rooms.reveal('host', command(), 'start')
  assert.equal(keys[0], keys[1])
})

test('concurrent commands with different IDs cannot reveal two images from one version', async (t) => {
  const { rooms, command, submitAll } = setup(t)
  submitAll()
  const results = await Promise.allSettled([rooms.reveal('host', command(), 'start'), rooms.reveal('host', command(), 'start')])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  const rejected = results.find((result) => result.status === 'rejected')!
  assert.ok(rejected.status === 'rejected' && error('STALE_REQUEST')(rejected.reason))
  assert.equal(rooms.current('host')!.room.revealedSubmissions.length, 1)
})

test('signing cannot commit after host departure, disconnection, takeover or disposal', async (t) => {
  for (const action of ['leave', 'disconnect', 'resume', 'dispose'] as const) {
    let finish!: (url: string) => void
    const { rooms, command, submitAll } = setup(t, () => new Promise((resolve) => { finish = resolve }))
    submitAll()
    const token = rooms.current('host')!.sessionToken
    const pending = rooms.reveal('host', command(), 'start')
    if (action === 'leave') rooms.leave('host')
    if (action === 'disconnect') rooms.disconnect('host')
    if (action === 'resume') rooms.resume('new-host', token)
    if (action === 'dispose') rooms.dispose()
    finish('https://storage.example/fresh')
    await assert.rejects(pending, error('NOT_A_MEMBER'))
    const remaining = rooms.current(action === 'resume' ? 'new-host' : 'guest0')
    if (remaining) assert.deepEqual(remaining.room.revealedSubmissions, [])
  }
})

test('twelve submissions are shown exactly once and the next round starts with an empty cake', async (t) => {
  const { rooms, command, submitAll } = setup(t, undefined, 12)
  submitAll()
  for (let index = 0; index < 12; index++) {
    const revealed = await rooms.reveal('host', command(), index ? 'next' : 'start')
    assert.equal(revealed.room.revealedSubmissions.length, index + 1)
  }
  const finished = await rooms.reveal('host', command(), 'next')
  assert.equal(new Set(finished.room.revealedSubmissions.map((item) => item.submissionId)).size, 12)
  await assert.rejects(rooms.reveal('host', command(), 'next'), error('INVALID_PHASE'))
  const next = rooms.advanceGame(finished.room.id, {
    ...command(), type: 'NEXT_ROUND', nextRoundId: randomUUID(), deadlineAt: Date.now() + 90000,
  })
  assert.deepEqual(next.revealedSubmissions, [])
})

test('a player leaving after submission keeps their anonymous image in the reveal queue', async (t) => {
  const { rooms, command, submitAll } = setup(t)
  submitAll()
  rooms.leave('guest0')
  await rooms.reveal('host', command(), 'start')
  const second = await rooms.reveal('host', command(), 'next')
  assert.equal(second.room.revealedSubmissions.length, 2)
})
