import { useEffect, useRef, useState } from 'react'
import type { ServerHello } from '@hear-me-out/shared'
import { createSocket } from '../services/socket'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
type Probe = { status: 'idle' | 'pending' } | { status: 'success'; latency: number } | { status: 'error' }

export function useConnection() {
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null)
  const [socket] = useState(createSocket)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [hello, setHello] = useState<ServerHello | null>(null)
  const [probe, setProbe] = useState<Probe>({ status: 'idle' })

  useEffect(() => {
    socketRef.current = socket

    socket.on('connection:welcome', (payload) => {
      setHello(payload)
      setStatus('connected')
    })
    socket.on('disconnect', () => {
      setHello(null)
      setStatus('disconnected')
      setProbe({ status: 'idle' })
    })
    socket.on('connect_error', () => {
      setHello(null)
      setStatus('error')
    })
    socket.io.on('reconnect_attempt', () => setStatus('connecting'))
    socket.connect()

    return () => {
      socketRef.current = null
      socket.removeAllListeners()
      socket.io.removeAllListeners()
      socket.disconnect()
    }
  }, [socket])

  async function ping() {
    const socket = socketRef.current
    if (!socket?.connected || probe.status === 'pending') return

    const connectionId = socket.id
    const requestId = crypto.randomUUID()
    const startedAt = performance.now()
    setProbe({ status: 'pending' })
    try {
      const result = await socket.timeout(5000).emitWithAck('connection:ping', { requestId })
      if (socketRef.current !== socket || !socket.connected || socket.id !== connectionId) return
      if (!result.ok || result.data.requestId !== requestId) {
        setProbe({ status: 'error' })
        return
      }
      setProbe({ status: 'success', latency: Math.round(performance.now() - startedAt) })
    } catch {
      if (socketRef.current === socket && socket.connected && socket.id === connectionId) {
        setProbe({ status: 'error' })
      }
    }
  }

  return { socket, status, hello, probe, ping }
}
