import { randomBytes, randomUUID } from 'node:crypto'
import type { ImageUploadTicket, SubmissionScope } from '@hear-me-out/shared'
import { RoomError, RoomService } from './roomService.ts'
import { validateImage } from './validateImage.ts'
import type { ImageStorage } from '../storage/imageStorage.ts'

interface Ticket extends ImageUploadTicket {
  connectionId: string
  scope: SubmissionScope
}

export class ImageUploadService {
  private readonly rooms: RoomService
  private readonly storage: ImageStorage | undefined
  private readonly tickets = new Map<string, Ticket>()
  private readonly busy = new Set<string>()
  private readonly cleanups = new Set<Promise<void>>()
  private readonly warn: (message: string) => void
  private readonly sweep: ReturnType<typeof setInterval>

  constructor(rooms: RoomService, storage: ImageStorage | undefined, warn: (message: string) => void) {
    this.rooms = rooms
    this.storage = storage
    this.warn = warn
    this.sweep = setInterval(() => this.prune(), 10_000)
    this.sweep.unref()
  }

  private prune() {
    for (const [token, ticket] of this.tickets) {
      if (ticket.expiresAt <= this.rooms.serverTime() || !this.rooms.current(ticket.connectionId)) this.tickets.delete(token)
    }
  }

  prepare(connectionId: string, scope: SubmissionScope): ImageUploadTicket {
    const { deadlineAt } = this.rooms.assertSubmissionOpen(connectionId, scope)
    if (!this.storage) throw new RoomError('UPLOAD_UNAVAILABLE', 'Le stockage d’images n’est pas encore configuré sur ce serveur.')
    if (this.busy.has(connectionId)) throw new RoomError('UPLOAD_BUSY', 'Un envoi est déjà en cours.')
    this.prune()
    for (const [token, ticket] of this.tickets) if (ticket.connectionId === connectionId) this.tickets.delete(token)
    const ticket = { token: randomBytes(32).toString('hex'), expiresAt: Math.min(deadlineAt, this.rooms.serverTime() + 60_000) }
    this.tickets.set(ticket.token, { ...ticket, connectionId, scope: { ...scope } })
    return ticket
  }

  reserve(token: string): Ticket {
    const ticket = this.tickets.get(token)
    if (!ticket || ticket.expiresAt <= this.rooms.serverTime()) {
      this.tickets.delete(token)
      throw new RoomError('INVALID_UPLOAD_TOKEN', 'Autorisation d’envoi expirée. Réessaie avant la fin du délai.')
    }
    this.rooms.assertSubmissionOpen(ticket.connectionId, ticket.scope)
    if (this.busy.size >= 4 || this.busy.has(ticket.connectionId)) throw new RoomError('UPLOAD_BUSY', 'Des images sont en cours de traitement. Réessaie dans quelques secondes.')
    this.tickets.delete(token)
    this.busy.add(ticket.connectionId)
    return ticket
  }

  release(ticket: Ticket) { this.busy.delete(ticket.connectionId) }

  async upload(ticket: Ticket, data: Buffer, mime: string) {
    this.rooms.assertSubmissionOpen(ticket.connectionId, ticket.scope)
    const image = await validateImage(data, mime)
    this.rooms.assertSubmissionOpen(ticket.connectionId, ticket.scope)
    const id = randomUUID()
    const objectKey = `${ticket.scope.roomId}/${ticket.scope.roundId}/${id}.webp`
    try {
      const previewUrl = await this.storage!.put(objectKey, image.data)
      // The timer or a departure may have happened during decoding or storage.
      return this.rooms.submit(ticket.connectionId, ticket.scope, {
        id, objectKey, previewUrl, width: image.width, height: image.height,
      })
    } catch (error) {
      this.discard(objectKey)
      if (error instanceof RoomError) throw error
      throw new RoomError('STORAGE_ERROR', 'L’envoi a échoué. Ton choix n’est pas validé ; tu peux réessayer.')
    }
  }

  discard(objectKey: string) {
    if (!this.storage) return
    const task = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await this.storage!.remove(objectKey); return } catch { /* Retry transient storage failures. */ }
      }
      this.warn(`Image cleanup failed: ${objectKey}`)
    })()
    this.cleanups.add(task)
    void task.finally(() => this.cleanups.delete(task))
  }

  stop() {
    clearInterval(this.sweep)
    this.tickets.clear()
  }

  async drain() { await Promise.all(this.cleanups) }
}
