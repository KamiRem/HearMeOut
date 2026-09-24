import { z } from 'zod'
import { GAME_SETTINGS_LIMITS } from '@hear-me-out/shared'

const nickname = z.string().max(100)
  .transform((value) => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
  .pipe(z.string().min(2).max(24).regex(/^[\p{L}\p{M}\p{N} ._'’-]+$/u))
const requestId = z.uuid()

export const createRoomSchema = z.strictObject({ requestId, nickname })
export const joinRoomSchema = z.strictObject({
  requestId,
  nickname,
  code: z.string().max(20).transform((value) => value.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/)),
})
export const leaveRoomSchema = z.strictObject({ requestId, roomId: z.uuid() })
export const syncRoomSchema = z.strictObject({ requestId })

const lobbyFields = { requestId, roomId: z.uuid(), settingsRevision: z.number().int().positive() }
const limits = GAME_SETTINGS_LIMITS
export const readySchema = z.strictObject({ ...lobbyFields, isReady: z.boolean() })
export const updateSettingsSchema = z.strictObject({
  ...lobbyFields,
  settings: z.strictObject({
    rounds: z.number().int().min(limits.rounds.min).max(limits.rounds.max),
    submissionDuration: z.number().int().min(limits.submissionDuration.min).max(limits.submissionDuration.max),
    voteDuration: z.number().int().min(limits.voteDuration.min).max(limits.voteDuration.max),
  }),
})
export const startGameSchema = z.strictObject(lobbyFields)
