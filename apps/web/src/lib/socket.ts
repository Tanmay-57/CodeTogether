import {
  ClientEvents,
  ServerEvents,
  ackSchema,
  chatMessageSchema,
  chatStateSchema,
  chatTypingNoticeSchema,
  codeClearedSchema,
  codeFinishedSchema,
  codeOutputSchema,
  codeStartedSchema,
  codeStateSchema,
  participantJoinedSchema,
  participantLeftSchema,
  presenceUpdatedSchema,
  roomExpiredSchema,
} from '@codetogether/shared'
import { pushSignal, type SignalCandidate, type SignalDescription } from './signalQueue'

type SignalShape = SignalDescription
import { io, type Socket } from 'socket.io-client'
import { playChatTone, playJoinChime } from './chime'
import { clearChatTyping, markChatTyping } from './chatTyping'
import { serverUrl } from './env'
import { emitRoomEvent } from './roomBus'
import { clearSession } from './session'
import { useChatStore } from '@/stores/chat'
import { useConnectionStore } from '@/stores/connection'
import { useRoomStore } from '@/stores/room'
import { useRunStore } from '@/stores/run'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(serverUrl, { autoConnect: false, transports: ['websocket', 'polling'] })
    bindSocket(socket)
  }
  return socket
}

function bindSocket(active: Socket) {
  const connection = useConnectionStore()
  const rooms = useRoomStore()
  const runs = useRunStore()
  const chat = useChatStore()

  active.on('connect', () => connection.setStatus('connected'))
  active.on('disconnect', (reason) => {
    connection.setStatus(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting')
  })
  active.io.on('reconnect_attempt', () => connection.setStatus('reconnecting'))
  active.io.on('reconnect', () => {
    const payload = rooms.resume
    if (!payload) return
    active.emit(ClientEvents.RoomJoin, payload, (response: unknown) => {
      const parsed = ackSchema.safeParse(response)
      if (!parsed.success || !parsed.data.ok) {
        rooms.clear()
        clearSession()
        emitRoomEvent({ type: 'expired' })
        return
      }
      rooms.applyJoin(parsed.data.data)
      if (parsed.data.data.resumed) emitRoomEvent({ type: 'self-resumed' })
    })
  })

  active.on(ServerEvents.ParticipantJoined, (payload: unknown) => {
    const parsed = participantJoinedSchema.safeParse(payload)
    if (!parsed.success) return
    rooms.upsert(parsed.data.participant)
    if (!parsed.data.resumed && parsed.data.participant.id !== rooms.selfId) playJoinChime()
    emitRoomEvent({ type: 'peer-joined', participantId: parsed.data.participant.id, resumed: parsed.data.resumed })
  })

  active.on(ServerEvents.ParticipantLeft, (payload: unknown) => {
    const parsed = participantLeftSchema.safeParse(payload)
    if (!parsed.success) return
    rooms.remove(parsed.data.participantId)
    emitRoomEvent({ type: 'peer-left', participantId: parsed.data.participantId })
  })

  active.on(ServerEvents.PresenceUpdated, (payload: unknown) => {
    const parsed = presenceUpdatedSchema.safeParse(payload)
    if (!parsed.success) return
    rooms.patchPresence(parsed.data)
  })

  active.on(ClientEvents.WebRtcOffer, (payload: { from?: string; description?: SignalShape }) => {
    if (!payload?.from || !payload.description) return
    pushSignal({ type: 'offer', from: payload.from, description: payload.description })
  })
  active.on(ClientEvents.WebRtcAnswer, (payload: { from?: string; description?: SignalShape }) => {
    if (!payload?.from || !payload.description) return
    pushSignal({ type: 'answer', from: payload.from, description: payload.description })
  })
  active.on(ClientEvents.WebRtcIceCandidate, (payload: { from?: string; candidate?: SignalCandidate }) => {
    if (!payload?.from || !payload.candidate) return
    pushSignal({ type: 'ice', from: payload.from, candidate: payload.candidate })
  })

  active.on(ServerEvents.RoomExpired, (payload: unknown) => {
    const parsed = roomExpiredSchema.safeParse(payload)
    if (!parsed.success) return
    rooms.clear()
    runs.reset()
    chat.reset()
    clearChatTyping()
    clearSession()
    emitRoomEvent({ type: 'expired' })
  })

  active.on(ServerEvents.CodeStarted, (payload: unknown) => {
    const parsed = codeStartedSchema.safeParse(payload)
    if (!parsed.success) return
    runs.start(parsed.data)
  })

  active.on(ServerEvents.CodeOutput, (payload: unknown) => {
    const parsed = codeOutputSchema.safeParse(payload)
    if (!parsed.success) return
    runs.append(parsed.data)
  })

  active.on(ServerEvents.CodeFinished, (payload: unknown) => {
    const parsed = codeFinishedSchema.safeParse(payload)
    if (!parsed.success) return
    runs.finish(parsed.data)
  })

  active.on(ServerEvents.CodeState, (payload: unknown) => {
    const parsed = codeStateSchema.safeParse(payload)
    if (!parsed.success) return
    runs.applyState(parsed.data)
  })

  active.on(ServerEvents.CodeCleared, (payload: unknown) => {
    if (!codeClearedSchema.safeParse(payload).success) return
    runs.clearLines()
  })

  active.on(ServerEvents.ChatState, (payload: unknown) => {
    const parsed = chatStateSchema.safeParse(payload)
    if (!parsed.success) return
    chat.replace(parsed.data.messages)
  })

  active.on(ServerEvents.ChatMessage, (payload: unknown) => {
    const parsed = chatMessageSchema.safeParse(payload)
    if (!parsed.success) return
    chat.add(parsed.data)
    if (parsed.data.participantId !== rooms.selfId) playChatTone()
  })

  active.on(ServerEvents.ChatTyping, (payload: unknown) => {
    const parsed = chatTypingNoticeSchema.safeParse(payload)
    if (!parsed.success || parsed.data.participantId === rooms.selfId) return
    markChatTyping(parsed.data.participantId, parsed.data.displayName)
  })
}

export function ensureConnected(): Promise<void> {
  const active = getSocket()
  if (active.connected) return Promise.resolve()
  useConnectionStore().setStatus('connecting')
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Could not connect to the server.')), 8000)
    active.once('connect', () => {
      window.clearTimeout(timer)
      resolve()
    })
    active.once('connect_error', () => {
      window.clearTimeout(timer)
      useConnectionStore().setStatus('disconnected')
      reject(new Error('Could not connect to the server.'))
    })
    active.connect()
  })
}
