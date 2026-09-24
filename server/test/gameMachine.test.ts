import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createGameMachine, GameTransitionError, projectGameState, transitionGame,
  type GameEvent, type GameMachine, type RoundEvent,
} from '../src/game/gameMachine.ts'
import { RoomError, RoomService } from '../src/services/roomService.ts'

const start: Extract<GameEvent, { type: 'START_GAME' }> = {
  type: 'START_GAME', expectedVersion: 0, gameId: 'game-1', roundId: 'round-1',
  startedAt: 1000, totalRounds: 2, participantIds: ['alice', 'bob'],
}

type RoundAction = RoundEvent extends infer E
  ? E extends RoundEvent ? Omit<E, 'expectedVersion' | 'gameId' | 'roundId'> : never : never

function scoped(machine: GameMachine, action: RoundAction): RoundEvent {
  const state = machine.state
  return {
    ...action, expectedVersion: state.version,
    gameId: 'id' in state ? state.id : 'game-1',
    roundId: 'roundId' in state ? state.roundId : 'round-1',
  }
}

function step(machine: GameMachine, action: RoundAction) {
  return transitionGame(machine, scoped(machine, action))
}

function errorCode(code: GameTransitionError['code']) {
  return (error: unknown) => error instanceof GameTransitionError && error.code === code
}

function playSubmission(machine: GameMachine) {
  const voting = step(machine, { type: 'START_VOTE' })
  assert.equal(voting.state.phase, 'VOTING')
  const results = step(voting, { type: 'END_VOTE' })
  assert.equal(results.state.phase, 'SUBMISSION_RESULTS')
  return step(results, { type: 'NEXT_REVEAL' })
}

test('full path includes waiting, every reveal, intermediate results and final results', () => {
  let game = createGameMachine()
  assert.deepEqual(game.state, { phase: 'LOBBY', version: 0 })
  game = transitionGame(game, start)
  assert.equal(game.state.phase, 'SUBMISSION')
  game = step(game, { type: 'END_SUBMISSION', submissionIds: ['first', 'second'] })
  assert.equal(game.state.phase, 'WAITING')
  game = step(game, { type: 'START_REVEALS' })
  assert.ok(game.state.phase === 'REVEAL')
  assert.equal(game.state.submissionId, 'first')
  game = playSubmission(game)
  assert.ok(game.state.phase === 'REVEAL')
  assert.equal(game.state.submissionId, 'second')
  game = playSubmission(game)
  assert.equal(game.state.phase, 'ROUND_RESULTS')
  assert.equal('submissionId' in game.state, false)
  assert.deepEqual(game.revealOrder, [])
  assert.throws(() => step(game, { type: 'END_GAME' }), errorCode('INVALID_TRANSITION'))
  game = step(game, { type: 'NEXT_ROUND', nextRoundId: 'round-2' })
  assert.ok(game.state.phase === 'SUBMISSION')
  assert.equal(game.state.roundNumber, 2)
  assert.equal(game.state.roundId, 'round-2')
  game = step(game, { type: 'END_SUBMISSION', submissionIds: ['third'] })
  game = step(game, { type: 'START_REVEALS' })
  game = playSubmission(game)
  assert.throws(() => step(game, { type: 'NEXT_ROUND', nextRoundId: 'round-3' }), errorCode('INVALID_TRANSITION'))
  game = step(game, { type: 'END_GAME' })
  assert.equal(game.state.phase, 'GAME_RESULTS')
  assert.equal('roundId' in game.state, false)
  assert.equal('submissionId' in game.state, false)
  assert.deepEqual(game.revealOrder, [])
})

test('an empty submission phase skips waiting and cannot block the final round', () => {
  let game = transitionGame(createGameMachine(), { ...start, totalRounds: 1 })
  game = step(game, { type: 'END_SUBMISSION', submissionIds: [] })
  assert.equal(game.state.phase, 'ROUND_RESULTS')
  assert.throws(() => step(game, { type: 'START_REVEALS' }), errorCode('INVALID_TRANSITION'))
  game = step(game, { type: 'END_GAME' })
  assert.equal(game.state.phase, 'GAME_RESULTS')
})

test('all events outside their permitted phases are rejected without mutation', () => {
  const lobby = createGameMachine()
  const submission = transitionGame(lobby, start)
  const waiting = step(submission, { type: 'END_SUBMISSION', submissionIds: ['first'] })
  const reveal = step(waiting, { type: 'START_REVEALS' })
  const voting = step(reveal, { type: 'START_VOTE' })
  const results = step(voting, { type: 'END_VOTE' })
  const roundResults = step(results, { type: 'NEXT_REVEAL' })
  const lastSubmission = step(roundResults, { type: 'NEXT_ROUND', nextRoundId: 'round-2' })
  const lastResults = step(lastSubmission, { type: 'END_SUBMISSION', submissionIds: [] })
  const final = step(lastResults, { type: 'END_GAME' })
  const cases: [GameMachine, readonly GameEvent['type'][]][] = [
    [lobby, ['START_GAME']], [submission, ['END_SUBMISSION']], [waiting, ['START_REVEALS']],
    [reveal, ['START_VOTE']], [voting, ['END_VOTE']], [results, ['NEXT_REVEAL']],
    [roundResults, ['NEXT_ROUND']], [lastResults, ['END_GAME']], [final, []],
  ]
  const actions: RoundAction[] = [
    { type: 'END_SUBMISSION', submissionIds: [] }, { type: 'START_REVEALS' },
    { type: 'START_VOTE' }, { type: 'END_VOTE' }, { type: 'NEXT_REVEAL' },
    { type: 'NEXT_ROUND', nextRoundId: 'next-round' }, { type: 'END_GAME' },
  ]
  for (const [machine, allowed] of cases) {
    const before = structuredClone(machine)
    const events: GameEvent[] = actions.map((action) => scoped(machine, action))
    events.push({ ...start, ...scoped(machine, { type: 'START_VOTE' }), type: 'START_GAME' })
    for (const event of events) {
      if (!allowed.includes(event.type)) {
        assert.throws(() => transitionGame(machine, event), errorCode('INVALID_TRANSITION'), `${machine.state.phase}: ${event.type}`)
      }
    }
    assert.deepEqual(machine, before)
  }
})

test('old versions, other games and previous rounds cannot advance the current state', () => {
  const submission = transitionGame(createGameMachine(), start)
  const end = scoped(submission, { type: 'END_SUBMISSION', submissionIds: [] })
  const results = transitionGame(submission, end)
  assert.throws(() => transitionGame(results, end), errorCode('STALE_TRANSITION'))
  const next = step(results, { type: 'NEXT_ROUND', nextRoundId: 'round-2' })
  assert.throws(() => transitionGame(next, { ...end, expectedVersion: next.state.version }), errorCode('STALE_TRANSITION'))
  assert.throws(() => transitionGame(next, { ...scoped(next, { type: 'END_SUBMISSION', submissionIds: [] }), gameId: 'old-game' }), errorCode('STALE_TRANSITION'))
  assert.deepEqual(next, step(results, { type: 'NEXT_ROUND', nextRoundId: 'round-2' }))
})

test('invalid initial context and invalid reveal queues are rejected', () => {
  for (const patch of [
    { totalRounds: 0 }, { totalRounds: 11 }, { totalRounds: 1.5 }, { startedAt: -1 },
    { gameId: '' }, { roundId: '' }, { participantIds: ['alice'] }, { participantIds: ['alice', 'alice'] },
  ]) {
    assert.throws(() => transitionGame(createGameMachine(), { ...start, ...patch }), errorCode('INVALID_GAME_DATA'))
  }
  const game = transitionGame(createGameMachine(), start)
  for (const submissionIds of [[''], ['same', 'same'], ['one', 'two', 'three']]) {
    assert.throws(() => step(game, { type: 'END_SUBMISSION', submissionIds }), errorCode('INVALID_GAME_DATA'))
  }
  const results = step(game, { type: 'END_SUBMISSION', submissionIds: [] })
  for (const nextRoundId of ['', 'round-1']) {
    assert.throws(() => step(results, { type: 'NEXT_ROUND', nextRoundId }), errorCode('INVALID_GAME_DATA'))
  }
})

test('public states hide future submissions and detach mutable data from the engine', () => {
  const players = ['alice', 'bob']
  const initial = transitionGame(createGameMachine(), { ...start, participantIds: players })
  players.push('intruder')
  const queue = ['visible-later', 'must-stay-hidden']
  const waiting = step(initial, { type: 'END_SUBMISSION', submissionIds: queue })
  queue.reverse()
  const publicWaiting = projectGameState(waiting)
  assert.ok(publicWaiting.phase !== 'LOBBY')
  assert.deepEqual(publicWaiting.participantIds, ['alice', 'bob'])
  assert.equal(JSON.stringify(publicWaiting).includes('visible-later'), false)
  assert.equal(JSON.stringify(publicWaiting).includes('must-stay-hidden'), false)
  const reveal = step(waiting, { type: 'START_REVEALS' })
  const publicReveal = projectGameState(reveal)
  assert.ok(publicReveal.phase === 'REVEAL')
  assert.equal(publicReveal.submissionId, 'visible-later')
  assert.equal(JSON.stringify(publicReveal).includes('must-stay-hidden'), false)
  assert.equal('revealOrder' in publicReveal, false)
  const mutablePlayers = publicReveal.participantIds as string[]
  mutablePlayers.push('tamper')
  const again = projectGameState(reveal)
  assert.ok(again.phase !== 'LOBBY')
  assert.deepEqual(again.participantIds, ['alice', 'bob'])
  assert.equal(initial.state.phase, 'SUBMISSION')
})

test('room integration applies transitions atomically and discards callbacks for closed rooms', () => {
  const rooms = new RoomService()
  const { room } = rooms.create('host', 'Alice')
  rooms.join('guest', room.code, 'Bob')
  rooms.setReady('host', room.id, 1, true)
  rooms.setReady('guest', room.id, 1, true)
  const { room: started } = rooms.startGame('host', room.id, 1)
  assert.ok(started.state.phase === 'SUBMISSION')
  const end: RoundEvent = {
    type: 'END_SUBMISSION', expectedVersion: started.state.version, gameId: started.state.id,
    roundId: started.state.roundId, submissionIds: ['secret-first', 'secret-second'],
  }
  const waiting = rooms.advanceGame(room.id, end)
  assert.equal(waiting.revision, started.revision + 1)
  assert.equal(waiting.state.phase, 'WAITING')
  assert.equal(JSON.stringify(waiting).includes('secret-first'), false)
  assert.throws(() => rooms.advanceGame(room.id, end), errorCode('STALE_TRANSITION'))
  assert.deepEqual(rooms.current('host')?.room, waiting)
  rooms.leave('host', room.id)
  assert.throws(() => rooms.advanceGame(room.id, end), (error) => error instanceof RoomError && error.code === 'ROOM_NOT_FOUND')
})
