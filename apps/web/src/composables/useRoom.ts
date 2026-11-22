import {
  ClientEvents,
  ERROR_MESSAGES,
  type ErrorCode,
  type JoinRoomPayload,
  ackSchema,
  simpleAckSchema,
} from '@codetogether/shared'
import { storeToRefs } from 'pinia'
import { clearSession, writeSession } from '@/lib/session'
import { emitRoomEvent } from '@/lib/roomBus'
import { ensureConnected, getSocket } from '@/lib/socket'
import { useRoomStore } from '@/stores/room'

function messageFor(code: string): string {
  return code in ERROR_MESSAGES ? ERROR_MESSAGES[code as ErrorCode] : 'Something went wrong. Try again.'
}

function request<T>(event: string, payload: unknown, parse: (value: unknown) => T | null): Promise<T> {
  const socket = getSocket()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('The server did not respond.')), 8000)
    socket.emit(event, payload, (response: unknown) => {
      window.clearTimeout(timer)
      const parsed = parse(response)
      if (!parsed) {
        reject(new Error('The server sent an unexpected response.'))
        return
      }
      resolve(parsed)
    })
  })
}

export function useRoom() {
  const rooms = useRoomStore()
  const { room, self, others, ticket, iceServers } = storeToRefs(rooms)

  async function createRoom(displayName: string, lock?: string) {
    await ensureConnected()
    const response = await request(ClientEvents.RoomCreate, { displayName, ...(lock ? { lock } : {}) }, (value) => {
      const parsed = ackSchema.safeParse(value)
      return parsed.success ? parsed.data : null
    })
    if (!response.ok) return { ok: false as const, message: messageFor(response.code) }
    rooms.resume = {
      roomId: response.data.room.id,
      displayName,
      resumeParticipantId: response.data.participant.id,
      ...(lock ? { lock } : {}),
    }
    rooms.applyJoin(response.data)
    writeSession({
      roomId: response.data.room.id,
      displayName,
      participantId: response.data.participant.id,
      lock,
      enteredWorkspace: false,
    })
    return { ok: true as const, roomId: response.data.room.id }
  }

  async function joinRoom(payload: JoinRoomPayload, enteredWorkspace: boolean) {
    await ensureConnected()
    if (rooms.room && rooms.room.id !== payload.roomId) await leaveRoom()
    rooms.resume = payload
    const response = await request(ClientEvents.RoomJoin, payload, (value) => {
      const parsed = ackSchema.safeParse(value)
      return parsed.success ? parsed.data : null
    })
    if (!response.ok) {
      rooms.resume = null
      return { ok: false as const, message: messageFor(response.code) }
    }
    rooms.applyJoin(response.data)
    writeSession({
      roomId: response.data.room.id,
      displayName: response.data.participant.displayName,
      participantId: response.data.participant.id,
      lock: payload.lock,
      enteredWorkspace,
    })
    if (response.data.resumed) emitRoomEvent({ type: 'self-resumed' })
    return { ok: true as const, data: response.data }
  }

  async function updatePresence(camera: boolean, microphone: boolean) {
    const response = await request(ClientEvents.PresenceUpdate, { camera, microphone }, (value) => {
      const parsed = simpleAckSchema.safeParse(value)
      return parsed.success ? parsed.data : null
    })
    if (!response.ok) return { ok: false as const, message: messageFor(response.code) }
    if (rooms.self) rooms.patchPresence({ participantId: rooms.self.id, camera, microphone, connection: rooms.self.connection })
    return { ok: true as const }
  }

  async function leaveRoom() {
    const socket = getSocket()
    rooms.resume = null
    if (socket.connected && rooms.self) {
      await request(ClientEvents.RoomLeave, {}, (value) => {
        const parsed = simpleAckSchema.safeParse(value)
        return parsed.success ? parsed.data : null
      }).catch(() => undefined)
    }
    rooms.clear()
    clearSession()
  }

  return { room, self, others, ticket, iceServers, createRoom, joinRoom, updatePresence, leaveRoom }
}
