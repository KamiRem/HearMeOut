// Temporary choices to exercise submission before image upload (step 6).
export const DEMO_CHOICES = [
  { id: 'robot', label: 'Le robot', symbol: '🤖' },
  { id: 'dragon', label: 'Le dragon', symbol: '🐉' },
  { id: 'ghost', label: 'Le fantôme', symbol: '👻' },
] as const

export type ChoiceId = typeof DEMO_CHOICES[number]['id']

export interface SubmissionCommand {
  requestId: string
  roomId: string
  gameId: string
  roundId: string
  choiceId: ChoiceId
}

export interface OwnSubmission {
  roundId: string | null
  choiceId: ChoiceId | null
}

export interface SubmissionProgress {
  roundId: string
  submitted: number
  expected: number
}
