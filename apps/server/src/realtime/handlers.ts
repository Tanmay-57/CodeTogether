import {
  ClientEvents,
  ERROR_CODES,
  ServerEvents,
  chatSendSchema,
  chatTypingSchema,
  codeInputSchema,
  codeRunSchema,
  createRoomSchema,
  joinRoomSchema,
  presenceUpdateSchema,
  webRtcAnswerSchema,
  webRtcIceSchema,
  webRtcOfferSchema,
} from '@codetogether/shared'
import type { Server, Socket } from 'socket.io'
import { iceServersFor, type AppConfig } from '../config'
import { logger } from '../logger'
import type { RoomChat } from '../chat/roomChat'
import type { DocumentServer } from '../collab/documentServer'
import type { CodeRunner } from '../run/codeRunner'
import type { Membership, RoomService } from '../rooms/roomService'
import type { RateLimiter } from '../security/rateLimit'
import { isAck, type AckFn } from './ack'

interface RealtimeDeps {
  io: Server
  rooms: RoomService
  documents: DocumentServer
  runner: CodeRunner
  chat: RoomChat
  config: AppConfig
  createLimiter: RateLimiter
  signalLimiter: RateLimiter
  runLimiter: RateLimiter
  chatLimiter: RateLimiter
}

function clientAddress(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0]?.trim() || socket.handshake.address
  return socket.handshake.address
}

function accept(socket: Socket, deps: RealtimeDeps, membership: Membership, ack: AckFn): void {
  if (membership.replacedSocketId) {
    deps.io.sockets.sockets.get(membership.replacedSocketId)?.disconnect(true)
  }
  socket.data.roomId = membership.room.id
  socket.data.participantId = membership.participant.id
  socket.join(membership.room.id)
  ack({
    ok: true,
    data: {
      room: membership.room,
      participant: membership.participant,
      ticket: membership.ticket,
      iceServers: iceServersFor(deps.config),
      resumed: membership.resumed,
    },
  })
  socket.to(membership.room.id).emit(ServerEvents.ParticipantJoined, {
    participant: membership.participant,
    resumed: membership.resumed,
  })
  deps.runner.replay(socket, membership.room.id)
  deps.chat.replay(socket, membership.room.id)
  logger.info({ roomId: membership.room.id, participantId: membership.participant.id, resumed: membership.resumed }, 'participant joined')
}

function relay(deps: RealtimeDeps, targetSocketId: string | null, event: string, payload: unknown): void {
  if (!targetSocketId) return
  deps.io.sockets.sockets.get(targetSocketId)?.emit(event, payload)
}

export function attachRealtime(deps: RealtimeDeps): void {
  deps.io.on('connection', (socket) => {
    socket.on(ClientEvents.RoomCreate, (payload: unknown, ack?: unknown) => {
      if (!isAck(ack)) return
      const parsed = createRoomSchema.safeParse(payload)
      if (!parsed.success) {
        ack({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
        return
      }
      if (!deps.createLimiter.allow(clientAddress(socket))) {
        ack({ ok: false, code: ERROR_CODES.RATE_LIMITED })
        return
      }
      const result = deps.rooms.create(parsed.data.displayName, socket.id, parsed.data.lock)
      if (!result.ok) {
        ack({ ok: false, code: result.code })
        return
      }
      accept(socket, deps, result.value, ack)
    })

    socket.on(ClientEvents.RoomJoin, (payload: unknown, ack?: unknown) => {
      if (!isAck(ack)) return
      const parsed = joinRoomSchema.safeParse(payload)
      if (!parsed.success) {
        ack({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
        return
      }
      const result = deps.rooms.join(
        parsed.data.roomId,
        parsed.data.displayName,
        socket.id,
        parsed.data.resumeParticipantId,
        parsed.data.lock,
      )
      if (!result.ok) {
        ack({ ok: false, code: result.code })
        return
      }
      accept(socket, deps, result.value, ack)
    })

    socket.on(ClientEvents.RoomLeave, (payload: unknown, ack?: unknown) => {
      if (!isAck(ack)) return
      if (payload !== undefined && payload !== null && typeof payload === 'object' && Object.keys(payload as object).length > 0) {
        ack({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
        return
      }
      const located = deps.rooms.leave(socket.id)
      if (!located) {
        ack({ ok: false, code: ERROR_CODES.NOT_A_MEMBER })
        return
      }
      socket.data.roomId = undefined
      socket.data.participantId = undefined
      socket.leave(located.roomId)
      ack({ ok: true })
      logger.info({ roomId: located.roomId, participantId: located.participantId }, 'participant left')
    })

    socket.on(ClientEvents.PresenceUpdate, (payload: unknown, ack?: unknown) => {
      if (!isAck(ack)) return
      const parsed = presenceUpdateSchema.safeParse(payload)
      if (!parsed.success) {
        ack({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
        return
      }
      const result = deps.rooms.updatePresence(socket.id, parsed.data.camera, parsed.data.microphone)
      if (!result.ok) {
        ack({ ok: false, code: result.code })
        return
      }
      ack({ ok: true })
    })

    socket.on(ClientEvents.WebRtcOffer, (payload: unknown, ack?: unknown) => {
      handleSignal(socket, deps, ack, webRtcOfferSchema, ClientEvents.WebRtcOffer, payload, (data) => ({
        from: data.from,
        description: data.description,
      }))
    })

    socket.on(ClientEvents.WebRtcAnswer, (payload: unknown, ack?: unknown) => {
      handleSignal(socket, deps, ack, webRtcAnswerSchema, ClientEvents.WebRtcAnswer, payload, (data) => ({
        from: data.from,
        description: data.description,
      }))
    })

    socket.on(ClientEvents.WebRtcIceCandidate, (payload: unknown, ack?: unknown) => {
      handleSignal(socket, deps, ack, webRtcIceSchema, ClientEvents.WebRtcIceCandidate, payload, (data) => ({
        from: data.from,
        candidate: data.candidate,
      }))
    })

    socket.on(ClientEvents.CodeRun, (payload: unknown, ack?: unknown) => {
      void handleRun(socket, deps, ack, payload)
    })

    socket.on(ClientEvents.CodeInput, (payload: unknown, ack?: unknown) => {
      if (!isAck(ack)) return
      const parsed = codeInputSchema.safeParse(payload)
      if (!parsed.success) {
        ack({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
        return
      }
      const member = deps.rooms.currentMember(socket.id)
      if (!member.ok) {
        ack({ ok: false, code: member.code })
        return
      }
      const result = deps.runner.writeInput(member.value.roomId, parsed.data.text)
      if (!result.ok) {
        ack({ ok: false, code: result.code })
        return
      }
      ack({ ok: true })
    })

    socket.on(ClientEvents.CodeClear, (payload: unknown, ack?: unknown) => {
      if (!isAck(ack)) return
      if (!isEmptyCommand(payload)) {
        ack({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
        return
      }
      const member = deps.rooms.currentMember(socket.id)
      if (!member.ok) {
        ack({ ok: false, code: member.code })
        return
      }
      deps.runner.clearOutput(member.value.roomId)
      ack({ ok: true })
    })

    socket.on(ClientEvents.ChatSend, (payload: unknown, ack?: unknown) => {
      if (!isAck(ack)) return
      const parsed = chatSendSchema.safeParse(payload)
      if (!parsed.success) {
        ack({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
        return
      }
      const member = deps.rooms.currentMember(socket.id)
      if (!member.ok) {
        ack({ ok: false, code: member.code })
        return
      }
      if (!deps.chatLimiter.allow(member.value.participantId)) {
        ack({ ok: false, code: ERROR_CODES.RATE_LIMITED })
        return
      }
      const message = deps.chat.post(member.value.roomId, member.value.participantId, member.value.displayName, parsed.data.text)
      deps.io.to(member.value.roomId).emit(ServerEvents.ChatMessage, message)
      ack({ ok: true })
    })

    socket.on(ClientEvents.ChatTyping, (payload: unknown) => {
      if (!chatTypingSchema.safeParse(payload).success) return
      const member = deps.rooms.currentMember(socket.id)
      if (!member.ok) return
      deps.io.to(member.value.roomId).emit(ServerEvents.ChatTyping, {
        participantId: member.value.participantId,
        displayName: member.value.displayName,
      })
    })

    socket.on(ClientEvents.CodeStop, (payload: unknown, ack?: unknown) => {
      if (!isAck(ack)) return
      if (!isEmptyCommand(payload)) {
        ack({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
        return
      }
      const member = deps.rooms.currentMember(socket.id)
      if (!member.ok) {
        ack({ ok: false, code: member.code })
        return
      }
      deps.runner.stop(member.value.roomId)
      ack({ ok: true })
    })

    socket.on('disconnect', () => {
      deps.rooms.markDisconnected(socket.id)
    })
  })
}

function isEmptyCommand(payload: unknown): boolean {
  if (payload === undefined || payload === null) return true
  return typeof payload === 'object' && Object.keys(payload as object).length === 0
}

async function handleRun(socket: Socket, deps: RealtimeDeps, ack: unknown, payload: unknown): Promise<void> {
  if (!isAck(ack)) return
  const parsed = codeRunSchema.safeParse(payload ?? {})
  if (!parsed.success) {
    ack({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
    return
  }
  const member = deps.rooms.currentMember(socket.id)
  if (!member.ok) {
    ack({ ok: false, code: member.code })
    return
  }
  if (deps.runner.isRunning(member.value.roomId)) {
    ack({ ok: false, code: ERROR_CODES.RUN_IN_PROGRESS })
    return
  }
  if (!deps.runLimiter.allow(member.value.roomId)) {
    ack({ ok: false, code: ERROR_CODES.RATE_LIMITED })
    return
  }
  const selected = deps.documents.source(member.value.roomId, parsed.data.fileId)
  const language = selected?.language ?? deps.documents.language(member.value.roomId) ?? 'plaintext'
  const source = selected?.text ?? deps.documents.text(member.value.roomId) ?? ''
  const result = await deps.runner.start(member.value.roomId, source, language, member.value.displayName)
  if (!result.ok) {
    ack({ ok: false, code: result.code })
    return
  }
  ack({ ok: true })
}

function handleSignal<T extends { to: string }>(
  socket: Socket,
  deps: RealtimeDeps,
  ack: unknown,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  event: string,
  payload: unknown,
  toMessage: (data: T & { from: string }) => unknown,
): void {
  if (!isAck(ack)) return
  if (!deps.signalLimiter.allow(socket.id)) {
    ack({ ok: false, code: ERROR_CODES.RATE_LIMITED })
    return
  }
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    ack({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
    return
  }
  const member = deps.rooms.assertMember(socket.id, parsed.data.to)
  if (!member.ok) {
    ack({ ok: false, code: member.code })
    return
  }
  relay(deps, member.value.targetSocketId, event, toMessage({ ...parsed.data, from: member.value.participantId }))
  ack({ ok: true })
}

