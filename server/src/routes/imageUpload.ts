import type { FastifyInstance, FastifyRequest } from 'fastify'
import { IMAGE_LIMITS } from '@hear-me-out/shared'
import type { RoomMembership } from '@hear-me-out/shared'
import { RoomError } from '../services/roomService.ts'
import type { ImageUploadService } from '../services/imageUploadService.ts'

export async function registerImageUpload(app: FastifyInstance, uploads: ImageUploadService,
  clientOrigin: string, publish: (membership: RoomMembership) => void) {
  const reservations = new WeakMap<FastifyRequest, ReturnType<ImageUploadService['reserve']>>()
  const processing = new WeakSet<FastifyRequest>()
  app.addContentTypeParser([...IMAGE_LIMITS.mimeTypes], { parseAs: 'buffer', bodyLimit: IMAGE_LIMITS.maxBytes }, (_request, body, done) => done(null, body))
  app.setErrorHandler((error, _request, reply) => {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    const tooLarge = code === 'FST_ERR_CTP_BODY_TOO_LARGE'
    const unsupported = code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE'
    const known = error instanceof RoomError ? error : new RoomError(tooLarge ? 'IMAGE_TOO_LARGE' : 'INVALID_IMAGE',
      tooLarge ? 'L’image dépasse la limite de 5 Mio.' : unsupported ? 'Choisis une image JPEG, PNG ou WebP.' : 'Impossible de lire cette image.')
    const status = known.code === 'INVALID_UPLOAD_TOKEN' ? 401
      : ['UPLOAD_BUSY', 'STORAGE_ERROR', 'UPLOAD_UNAVAILABLE'].includes(known.code) ? 503 : tooLarge ? 413 : 400
    reply.code(status).send({ ok: false, error: { code: known.code, message: known.message } })
  })
  const release = (request: FastifyRequest) => {
    const ticket = reservations.get(request)
    if (ticket) { uploads.release(ticket); reservations.delete(request) }
  }
  app.addHook('onResponse', async (request) => release(request))
  app.addHook('onError', async (request) => release(request))
  app.addHook('onRequestAbort', async (request) => { if (!processing.has(request)) release(request) })
  app.addHook('onTimeout', async (request) => { if (!processing.has(request)) release(request) })
  app.post('/api/images', {
    bodyLimit: IMAGE_LIMITS.maxBytes,
    onRequest: async (request, reply) => {
      reply.header('Cache-Control', 'no-store')
      if (request.headers.origin && request.headers.origin !== clientOrigin) throw new RoomError('INVALID_UPLOAD_TOKEN', 'Origine non autorisée.')
      const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? '')
      if (!match) throw new RoomError('INVALID_UPLOAD_TOKEN', 'Autorisation d’envoi manquante.')
      // Authorize and reserve capacity before Fastify buffers the body.
      reservations.set(request, uploads.reserve(match[1]!))
    },
  }, async (request) => {
    if (!Buffer.isBuffer(request.body)) throw new RoomError('INVALID_IMAGE', 'Contenu image invalide.')
    const ticket = reservations.get(request)!
    const mime = request.headers['content-type']?.split(';')[0]?.trim() ?? ''
    processing.add(request)
    try {
      const membership = await uploads.upload(ticket, request.body, mime)
      publish(membership)
      return { ok: true, data: membership }
    } finally {
      processing.delete(request)
      release(request)
    }
  })
}
