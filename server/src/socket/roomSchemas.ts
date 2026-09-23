import { z } from 'zod'

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
