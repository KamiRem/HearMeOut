import type { SubmissionScope } from './submission.ts'

export interface RevealCommand extends SubmissionScope {
  requestId: string
  expectedVersion: number
}

// Only images already revealed by the server. No author or future queue.
export interface RevealedSubmission {
  submissionId: string
  previewUrl: string
  width: number
  height: number
}
