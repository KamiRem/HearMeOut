export const IMAGE_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxPixels: 20_000_000,
  maxDimension: 2048,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
} as const

export interface SubmissionScope {
  roomId: string
  gameId: string
  roundId: string
}

export interface PrepareImageCommand extends SubmissionScope {
  requestId: string
}

export interface ImageUploadTicket {
  token: string
  expiresAt: number
}

export interface SubmissionImage {
  id: string
  previewUrl: string
  width: number
  height: number
}

export interface OwnSubmission {
  roundId: string | null
  image: SubmissionImage | null
}

export interface SubmissionProgress {
  roundId: string
  submitted: number
  expected: number
}
