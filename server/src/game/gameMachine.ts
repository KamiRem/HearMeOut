import { GAME_SETTINGS_LIMITS, MIN_PLAYERS } from '@hear-me-out/shared'
import type { GameState } from '@hear-me-out/shared'

export interface GameMachine {
  readonly state: GameState
  readonly revealOrder: readonly string[]
  readonly revealIndex: number
}

interface RoundCommand {
  expectedVersion: number
  gameId: string
  roundId: string
}

// Internal server events only. No client socket accepts these events.
export type RoundEvent = RoundCommand & (
  | { type: 'END_SUBMISSION'; submissionIds: readonly string[] }
  | { type: 'START_REVEALS' }
  | { type: 'START_VOTE' }
  | { type: 'END_VOTE' }
  | { type: 'NEXT_REVEAL' }
  | { type: 'NEXT_ROUND'; nextRoundId: string }
  | { type: 'END_GAME' }
)

export type GameEvent = RoundEvent | {
  type: 'START_GAME'
  expectedVersion: number
  gameId: string
  roundId: string
  startedAt: number
  totalRounds: number
  participantIds: readonly string[]
}

export class GameTransitionError extends Error {
  readonly code: 'INVALID_TRANSITION' | 'STALE_TRANSITION' | 'INVALID_GAME_DATA'

  constructor(code: GameTransitionError['code'], message: string) {
    super(message)
    this.code = code
  }
}

export function createGameMachine(): GameMachine {
  return { state: { phase: 'LOBBY', version: 0 }, revealOrder: [], revealIndex: -1 }
}

function requireData(condition: boolean) {
  if (!condition) throw new GameTransitionError('INVALID_GAME_DATA', 'Données de transition invalides.')
}

function validId(id: string) {
  return typeof id === 'string' && id.trim().length > 0
}

// Pure transition: no clock, random generation, network, scoring or timers here.
export function transitionGame(machine: GameMachine, event: GameEvent): GameMachine {
  const state = machine.state
  if (event.expectedVersion !== state.version) {
    throw new GameTransitionError('STALE_TRANSITION', 'Cette transition appartient à un ancien état.')
  }
  const version = state.version + 1

  if (event.type === 'START_GAME' && state.phase === 'LOBBY') {
    requireData(validId(event.gameId) && validId(event.roundId)
      && Number.isSafeInteger(event.startedAt) && event.startedAt >= 0
      && Number.isInteger(event.totalRounds)
      && event.totalRounds >= GAME_SETTINGS_LIMITS.rounds.min && event.totalRounds <= GAME_SETTINGS_LIMITS.rounds.max
      && event.participantIds.length >= MIN_PLAYERS && event.participantIds.every(validId)
      && new Set(event.participantIds).size === event.participantIds.length)
    return {
      state: {
        phase: 'SUBMISSION', version, id: event.gameId, startedAt: event.startedAt,
        participantIds: [...event.participantIds], totalRounds: event.totalRounds,
        roundId: event.roundId, roundNumber: 1,
      },
      revealOrder: [], revealIndex: -1,
    }
  }

  if (state.phase !== 'LOBBY' && (event.gameId !== state.id
    || ('roundId' in state && event.roundId !== state.roundId))) {
    throw new GameTransitionError('STALE_TRANSITION', 'Cette transition appartient à une autre partie ou à un autre round.')
  }

  if (state.phase !== 'LOBBY' && state.phase !== 'GAME_RESULTS') {
    // Select context explicitly: old submission fields cannot leak into the next phase.
    const context = {
      id: state.id, startedAt: state.startedAt, participantIds: [...state.participantIds],
      totalRounds: state.totalRounds, roundId: state.roundId, roundNumber: state.roundNumber, version,
    }
    switch (event.type) {
      case 'END_SUBMISSION':
        if (state.phase === 'SUBMISSION') {
          requireData(event.submissionIds.length <= state.participantIds.length
            && event.submissionIds.every(validId)
            && new Set(event.submissionIds).size === event.submissionIds.length)
          return {
            state: { ...context, phase: event.submissionIds.length ? 'WAITING' : 'ROUND_RESULTS' },
            revealOrder: [...event.submissionIds], revealIndex: -1,
          }
        }
        break
      case 'START_REVEALS':
        if (state.phase === 'WAITING') {
          const submissionId = machine.revealOrder[0]
          requireData(submissionId !== undefined)
          return { ...machine, state: { ...context, phase: 'REVEAL', submissionId: submissionId! }, revealIndex: 0 }
        }
        break
      case 'START_VOTE':
        if (state.phase === 'REVEAL') {
          return { ...machine, state: { ...context, phase: 'VOTING', submissionId: state.submissionId } }
        }
        break
      case 'END_VOTE':
        if (state.phase === 'VOTING') {
          return { ...machine, state: { ...context, phase: 'SUBMISSION_RESULTS', submissionId: state.submissionId } }
        }
        break
      case 'NEXT_REVEAL':
        if (state.phase === 'SUBMISSION_RESULTS') {
          const revealIndex = machine.revealIndex + 1
          const submissionId = machine.revealOrder[revealIndex]
          return submissionId === undefined
            ? { state: { ...context, phase: 'ROUND_RESULTS' }, revealOrder: [], revealIndex: -1 }
            : { ...machine, state: { ...context, phase: 'REVEAL', submissionId }, revealIndex }
        }
        break
      case 'NEXT_ROUND':
        if (state.phase === 'ROUND_RESULTS' && state.roundNumber < state.totalRounds) {
          requireData(validId(event.nextRoundId) && event.nextRoundId !== state.roundId)
          return {
            state: { ...context, phase: 'SUBMISSION', roundId: event.nextRoundId, roundNumber: state.roundNumber + 1 },
            revealOrder: [], revealIndex: -1,
          }
        }
        break
      case 'END_GAME':
        if (state.phase === 'ROUND_RESULTS' && state.roundNumber === state.totalRounds) {
          return {
            state: {
              phase: 'GAME_RESULTS', version, id: state.id, startedAt: state.startedAt,
              participantIds: [...state.participantIds], totalRounds: state.totalRounds,
            },
            revealOrder: [], revealIndex: -1,
          }
        }
        break
    }
  }
  throw new GameTransitionError('INVALID_TRANSITION', `Transition ${event.type} interdite depuis ${state.phase}.`)
}

// This is the only projection used by RoomService; the private queue is never sent.
export function projectGameState({ state }: GameMachine): GameState {
  if (state.phase === 'LOBBY') return { phase: 'LOBBY', version: state.version }
  const context = {
    id: state.id, startedAt: state.startedAt, participantIds: [...state.participantIds],
    totalRounds: state.totalRounds, version: state.version,
  }
  if (state.phase === 'GAME_RESULTS') return { ...context, phase: 'GAME_RESULTS' }
  const round = { ...context, roundId: state.roundId, roundNumber: state.roundNumber }
  switch (state.phase) {
    case 'SUBMISSION': case 'WAITING': case 'ROUND_RESULTS':
      return { ...round, phase: state.phase }
    case 'REVEAL': case 'VOTING': case 'SUBMISSION_RESULTS':
      return { ...round, phase: state.phase, submissionId: state.submissionId }
  }
}
