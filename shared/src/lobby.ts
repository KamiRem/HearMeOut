export interface GameSettings {
  rounds: number
  submissionDuration: number
  voteDuration: number
}

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = {
  rounds: 3,
  submissionDuration: 90,
  voteDuration: 10,
}

export const GAME_SETTINGS_LIMITS = {
  rounds: { min: 1, max: 10 },
  submissionDuration: { min: 15, max: 180 },
  voteDuration: { min: 5, max: 30 },
} as const

export const MIN_PLAYERS = 2

export interface LobbyCommand {
  requestId: string
  roomId: string
  settingsRevision: number
}

export interface ReadyCommand extends LobbyCommand {
  isReady: boolean
}

export interface UpdateSettingsCommand extends LobbyCommand {
  settings: GameSettings
}
