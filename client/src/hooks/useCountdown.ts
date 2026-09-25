import { useEffect, useState } from 'react'

export interface ServerClockSample {
  serverNow: number
  receivedAt: number
}

// The browser displays time only. Expiration and phase changes belong to the server.
export function useCountdown(deadlineAt: number, sample: ServerClockSample | null) {
  const [tick, setTick] = useState(() => performance.now())
  useEffect(() => {
    const timer = window.setInterval(() => setTick(performance.now()), 250)
    return () => window.clearInterval(timer)
  }, [])
  if (!sample) return null
  const elapsed = Math.max(0, tick - sample.receivedAt)
  return Math.max(0, Math.ceil((deadlineAt - sample.serverNow - elapsed) / 1000))
}
