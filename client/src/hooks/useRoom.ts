import { useEffect, useRef, useState } from 'react'
import type { GameSettings, Result, RoomMembership, RoomSnapshot } from '@hear-me-out/shared'
import type { ServerClockSample } from './useCountdown'
import type { createSocket } from '../services/socket'
import { readRoomSession, saveRoomSession } from '../services/roomSession'

type ClientSocket = ReturnType<typeof createSocket>
type Action = 'create' | 'join' | 'leave' | 'ready' | 'settings' | 'start' | 'submit' | 'reveal'

function sampleClock(current: ServerClockSample | null, serverNow: number): ServerClockSample {
  return current && current.serverNow >= serverNow ? current : { serverNow, receivedAt: performance.now() }
}

export function useRoom(socket: ClientSocket | null) {
  const [membership, setMembership] = useState<RoomMembership | null>(null)
  const [pending, setPending] = useState<Action | null>(null)
  const [message, setMessageText] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<'info' | 'success' | 'error'>('info')
  function setMessage(text: string | null, tone: typeof messageTone = 'error') {
    setMessageText(text)
    setMessageTone(tone)
  }
  const [clockSample, setClockSample] = useState<ServerClockSample | null>(null)
  const latestRoom = useRef<RoomSnapshot | null>(null)
  const lastClosedRoomId = useRef<string | null>(null)
  const activeSocket = useRef(socket)
  const operation = useRef<{ action: Action; connectionId: string } | null>(null)
  const uploadController = useRef<AbortController | null>(null)
  const sessionToken = useRef(readRoomSession())
  const [restoring, setRestoring] = useState(() => readRoomSession() !== null)
  const [resumeFailed, setResumeFailed] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)

  function forgetSession() {
    sessionToken.current = null
    saveRoomSession(null)
    setRestoring(false)
    setResumeFailed(false)
    setSessionEnded(true)
  }

  function acceptMembership(next: RoomMembership | null) {
    if (!next) {
      forgetSession()
      latestRoom.current = null
      setMembership(null)
      return
    }
    if (lastClosedRoomId.current === next.room.id) return
    sessionToken.current = next.sessionToken
    if (!saveRoomSession(next.sessionToken)) setMessage('La session ne peut pas être conservée dans cet onglet. Un rechargement risque de te déconnecter.')
    setSessionEnded(false)
    const latest = latestRoom.current
    const room = latest?.id === next.room.id && latest.revision > next.room.revision ? latest : next.room
    latestRoom.current = room
    setClockSample((current) => sampleClock(current, next.serverNow))
    setMembership({ ...next, room })
  }

  useEffect(() => {
    activeSocket.current = socket
    if (!socket) return
    let cancelled = false

    async function restore() {
      const token = sessionToken.current
      const connectionId = socket?.id
      if (!token || !socket?.connected || !connectionId) return
      setRestoring(true)
      setResumeFailed(false)
      try {
        const result = await socket.timeout(5000).emitWithAck('room:resume', { requestId: crypto.randomUUID(), sessionToken: token })
        if (cancelled || socket.id !== connectionId || !socket.connected || sessionToken.current !== token) return
        if (result.ok) {
          acceptMembership(result.data)
          setMessage(null)
          setRestoring(false)
        } else if (result.error.code === 'SESSION_EXPIRED' || result.error.code === 'INVALID_PAYLOAD') {
          acceptMembership(null)
          setMessage(result.error.message)
        } else {
          setResumeFailed(true)
          setMessage(result.error.message)
        }
      } catch {
        if (!cancelled && socket.id === connectionId && socket.connected) setResumeFailed(true)
      }
    }

    function onUpdate(room: RoomSnapshot, serverNow: number) {
      if (lastClosedRoomId.current === room.id) return
      const latest = latestRoom.current
      if (latest?.id === room.id && latest.revision > room.revision) return
      latestRoom.current = room
      setClockSample((current) => sampleClock(current, serverNow))
      setMembership((current) => current?.room.id === room.id ? { ...current, room } : current)
    }

    function onClosed({ roomId }: { roomId: string }) {
      uploadController.current?.abort()
      forgetSession()
      lastClosedRoomId.current = roomId
      latestRoom.current = null
      setMembership(null)
      if (operation.current?.action !== 'leave') {
        setMessage('Le créateur a quitté le salon. Tu peux en créer ou en rejoindre un autre.', 'info')
      }
      operation.current = null
      setPending(null)
    }

    function onDisconnect() {
      uploadController.current?.abort()
      if (sessionToken.current) setMessage('Connexion interrompue. Reprise automatique de ta session pendant une minute…', 'info')
      latestRoom.current = null
      lastClosedRoomId.current = null
      operation.current = null
      setClockSample(null)
      setMembership(null)
      setPending(null)
      setRestoring(sessionToken.current !== null)
    }

    function onReplaced() {
      acceptMembership(null)
      setMessage('Cette session a été reprise dans un autre onglet.', 'info')
    }

    socket.on('connect', restore)
    socket.on('session:replaced', onReplaced)
    socket.on('room:update', onUpdate)
    socket.on('room:closed', onClosed)
    socket.on('disconnect', onDisconnect)
    if (socket.connected) void restore()
    return () => {
      cancelled = true
      uploadController.current?.abort()
      activeSocket.current = null
      socket.off('room:update', onUpdate)
      socket.off('room:closed', onClosed)
      socket.off('disconnect', onDisconnect)
      socket.off('connect', restore)
      socket.off('session:replaced', onReplaced)
    }
  }, [socket])

  async function request(
    action: Action,
    execute: (client: ClientSocket) => Promise<Result<RoomMembership | { roomId: string }>>,
  ) {
    if (!socket?.connected || !socket.id || operation.current || restoring) return
    const current = { action, connectionId: socket.id }
    operation.current = current
    setPending(action)
    setMessage(null)
    const isCurrent = () => activeSocket.current === socket && socket.connected
      && socket.id === current.connectionId && operation.current === current

    try {
      const result = await execute(socket)
      if (!isCurrent()) return
      if (!result.ok) {
        setMessage(result.error.message)
        // Also reconcile if a previous action succeeded but its ack was lost.
        const synced = await socket.timeout(5000).emitWithAck('room:sync', { requestId: crypto.randomUUID() })
        if (isCurrent() && synced.ok) acceptMembership(synced.data)
      } else if ('room' in result.data) {
        acceptMembership(result.data)
      } else {
        acceptMembership(null)
      }
    } catch {
      if (!isCurrent()) return
      setMessage('La réponse tarde à arriver. Vérification du salon…', 'info')
      try {
        const synced = await socket.timeout(5000).emitWithAck('room:sync', { requestId: crypto.randomUUID() })
        if (!isCurrent()) return
        if (!synced.ok) throw new Error('Synchronization failed')
        acceptMembership(synced.data)
        setMessage('État du salon vérifié. Tu peux continuer.', 'success')
      } catch {
        if (!isCurrent()) return
        // A new connection cannot accidentally control an uncertain old membership.
        socket.disconnect()
        socket.connect()
        setMessage('Connexion réinitialisée. Rejoins ton salon dès que le serveur répond.', 'info')
      }
    } finally {
      if (operation.current === current) {
        operation.current = null
        setPending(null)
      }
    }
  }

  function createRoom(nickname: string) {
    return request('create', (client) => client.timeout(5000).emitWithAck('room:create', {
      requestId: crypto.randomUUID(), nickname,
    }))
  }

  function joinRoom(nickname: string, code: string) {
    return request('join', (client) => client.timeout(5000).emitWithAck('room:join', {
      requestId: crypto.randomUUID(), nickname, code,
    }))
  }

  function leaveRoom() {
    if (!membership) return
    return request('leave', (client) => client.timeout(5000).emitWithAck('room:leave', {
      requestId: crypto.randomUUID(), roomId: membership.room.id,
    }))
  }

  function setReady(isReady: boolean) {
    if (!membership) return
    return request('ready', (client) => client.timeout(5000).emitWithAck('player:ready', {
      requestId: crypto.randomUUID(), roomId: membership.room.id,
      settingsRevision: membership.room.settingsRevision, isReady,
    }))
  }

  function updateSettings(settings: GameSettings) {
    if (!membership) return
    return request('settings', (client) => client.timeout(5000).emitWithAck('room:settings:update', {
      requestId: crypto.randomUUID(), roomId: membership.room.id,
      settingsRevision: membership.room.settingsRevision, settings,
    }))
  }

  function startGame() {
    if (!membership) return
    return request('start', (client) => client.timeout(5000).emitWithAck('game:start', {
      requestId: crypto.randomUUID(), roomId: membership.room.id,
      settingsRevision: membership.room.settingsRevision,
    }))
  }

  function submitImage(file: File) {
    if (!membership || membership.room.state.phase !== 'SUBMISSION') return
    const { room } = membership
    const state = membership.room.state
    return request('submit', async (client) => {
      const controller = new AbortController()
      uploadController.current = controller
      try {
        const ticket = await client.timeout(5000).emitWithAck('image:prepare', {
          requestId: crypto.randomUUID(), roomId: room.id, gameId: state.id, roundId: state.roundId,
        })
        if (!ticket.ok) return ticket
        controller.signal.throwIfAborted()
        const response = await fetch('/api/images', {
          method: 'POST', body: file,
          headers: { 'Content-Type': file.type, Authorization: `Bearer ${ticket.data.token}` },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        })
        return await response.json() as Result<RoomMembership>
      } finally {
        if (uploadController.current === controller) uploadController.current = null
      }
    })
  }

  function reveal(action: 'start' | 'next') {
    if (!membership || !('roundId' in membership.room.state)) return
    const { room } = membership
    const state = membership.room.state
    return request('reveal', (client) => client.timeout(15_000).emitWithAck(`reveal:${action}`, {
      requestId: crypto.randomUUID(), roomId: room.id, gameId: state.id,
      roundId: state.roundId, expectedVersion: state.version,
    }))
  }

  function retryResume() {
    if (!socket || !restoring) return
    setResumeFailed(false)
    socket.disconnect()
    socket.connect()
  }

  return { membership, pending, message, messageTone, clockSample, restoring, resumeFailed, sessionEnded, retryResume,
    createRoom, joinRoom, leaveRoom, setReady, updateSettings, startGame, submitImage, reveal }
}
