import { useEffect, useRef, useState } from 'react'
import type { Result, RoomMembership, RoomSnapshot } from '@hear-me-out/shared'
import type { createSocket } from '../services/socket'

type ClientSocket = ReturnType<typeof createSocket>
type Action = 'create' | 'join' | 'leave'

export function useRoom(socket: ClientSocket | null) {
  const [membership, setMembership] = useState<RoomMembership | null>(null)
  const [pending, setPending] = useState<Action | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const latestRoom = useRef<RoomSnapshot | null>(null)
  const lastClosedRoomId = useRef<string | null>(null)
  const activeSocket = useRef(socket)
  const operation = useRef<{ action: Action; connectionId: string } | null>(null)

  function acceptMembership(next: RoomMembership | null) {
    if (!next) {
      latestRoom.current = null
      setMembership(null)
      return
    }
    if (lastClosedRoomId.current === next.room.id) return
    const latest = latestRoom.current
    const room = latest?.id === next.room.id && latest.revision > next.room.revision ? latest : next.room
    latestRoom.current = room
    setMembership({ ...next, room })
  }

  useEffect(() => {
    activeSocket.current = socket
    if (!socket) return

    function onUpdate(room: RoomSnapshot) {
      if (lastClosedRoomId.current === room.id) return
      const latest = latestRoom.current
      if (latest?.id === room.id && latest.revision > room.revision) return
      latestRoom.current = room
      setMembership((current) => current?.room.id === room.id ? { ...current, room } : current)
    }

    function onClosed({ roomId }: { roomId: string }) {
      lastClosedRoomId.current = roomId
      latestRoom.current = null
      setMembership(null)
      if (operation.current?.action !== 'leave') {
        setMessage('Le créateur a quitté le salon. Tu peux en créer ou en rejoindre un autre.')
      }
    }

    function onDisconnect() {
      if (latestRoom.current) setMessage('Connexion interrompue. Rejoins le salon une fois reconnecté.')
      latestRoom.current = null
      lastClosedRoomId.current = null
      operation.current = null
      setMembership(null)
      setPending(null)
    }

    socket.on('room:update', onUpdate)
    socket.on('room:closed', onClosed)
    socket.on('disconnect', onDisconnect)
    return () => {
      activeSocket.current = null
      socket.off('room:update', onUpdate)
      socket.off('room:closed', onClosed)
      socket.off('disconnect', onDisconnect)
    }
  }, [socket])

  async function request(
    action: Action,
    execute: (client: ClientSocket) => Promise<Result<RoomMembership | { roomId: string }>>,
  ) {
    if (!socket?.connected || !socket.id || operation.current) return
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
      setMessage('La réponse tarde à arriver. Vérification du salon…')
      try {
        const synced = await socket.timeout(5000).emitWithAck('room:sync', { requestId: crypto.randomUUID() })
        if (!isCurrent()) return
        if (!synced.ok) throw new Error('Synchronization failed')
        acceptMembership(synced.data)
        setMessage('État du salon vérifié. Tu peux continuer.')
      } catch {
        if (!isCurrent()) return
        // A new connection cannot accidentally control an uncertain old membership.
        socket.disconnect()
        socket.connect()
        setMessage('Connexion réinitialisée. Rejoins ton salon dès que le serveur répond.')
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

  return { membership, pending, message, createRoom, joinRoom, leaveRoom }
}
