const key = 'hear-me-out:session'

export function readRoomSession(): string | null {
  try {
    const token = sessionStorage.getItem(key)
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null
  } catch { return null }
}

export function saveRoomSession(token: string | null) {
  try {
    if (token) sessionStorage.setItem(key, token)
    else sessionStorage.removeItem(key)
    return true
  } catch { return false }
}
