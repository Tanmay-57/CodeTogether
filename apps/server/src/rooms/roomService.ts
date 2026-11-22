import {
  ERROR_CODES,
  PARTICIPANT_COLORS,
  type ErrorCode,
  type Limits,
  type PublicParticipant,
  type PublicRoom,
} from '@codetogether/shared'
import { createParticipantId, createRoomId, createTicket } from './ids'
import type { TimerScheduler } from './scheduler'

export interface Clock {
  now(): number
}

interface ParticipantRecord {
  id: string
  displayName: string
  color: string
  socketId: string | null
  joinedAt: number
  camera: boolean
  microphone: boolean
  connection: 'connected' | 'reconnecting'
  ticket: string
}

interface RoomRecord {
  id: string
  createdAt: number
  expiresAt: number
  lastActivityAt: number
  hardCapAt: number
  lock: string | null
  participants: Map<string, ParticipantRecord>
}

export interface Membership {
  room: PublicRoom
  participant: PublicParticipant
  ticket: string
  resumed: boolean
  replacedSocketId: string | null
}

export type RoomResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode }

export interface RoomServiceOptions {
  clock: Clock
  scheduler: TimerScheduler
  limits: Limits
  createId?: () => string
  onRoomEnded?: (roomId: string, reason: 'expired' | 'empty') => void
  onParticipantLeft?: (roomId: string, participantId: string) => void
  onParticipantUpdated?: (roomId: string, participant: PublicParticipant) => void
}

function toPublicParticipant(participant: ParticipantRecord): PublicParticipant {
  return {
    id: participant.id,
    displayName: participant.displayName,
    color: participant.color,
    joinedAt: participant.joinedAt,
    camera: participant.camera,
    microphone: participant.microphone,
    connection: participant.connection,
  }
}

export class RoomService {
  private readonly rooms = new Map<string, RoomRecord>()
  private readonly socketIndex = new Map<string, { roomId: string; participantId: string }>()

  constructor(private readonly options: RoomServiceOptions) {}

  create(displayName: string, socketId: string, lock?: string): RoomResult<Membership> {
    const id = this.allocateRoomId()
    if (!id) return { ok: false, code: ERROR_CODES.RATE_LIMITED }
    const now = this.options.clock.now()
    const room: RoomRecord = {
      id,
      createdAt: now,
      lastActivityAt: now,
      hardCapAt: now + this.options.limits.roomHardCapMs,
      expiresAt: Math.min(now + this.options.limits.roomHardCapMs, now + this.options.limits.roomTtlMs),
      lock: lock ?? null,
      participants: new Map(),
    }
    this.rooms.set(id, room)
    this.scheduleExpiry(room)
    return this.addParticipant(room, displayName, socketId, false)
  }

  join(roomId: string, displayName: string, socketId: string, resumeParticipantId?: string, lock?: string): RoomResult<Membership> {
    const room = this.rooms.get(roomId)
    if (!room) return { ok: false, code: ERROR_CODES.ROOM_NOT_FOUND }
    if (this.isExpired(room)) {
      this.endRoom(room, 'expired')
      return { ok: false, code: ERROR_CODES.ROOM_EXPIRED }
    }
    if (room.lock && room.lock !== lock) return { ok: false, code: ERROR_CODES.ROOM_LOCKED }

    if (resumeParticipantId) {
      const existing = room.participants.get(resumeParticipantId)
      if (existing) return this.resume(room, existing, displayName, socketId)
    }

    if (room.participants.size >= this.options.limits.maxParticipants) {
      return { ok: false, code: ERROR_CODES.ROOM_FULL }
    }
    return this.addParticipant(room, displayName, socketId, false)
  }

  leave(socketId: string): { roomId: string; participantId: string } | null {
    const located = this.socketIndex.get(socketId)
    if (!located) return null
    this.removeParticipant(located.roomId, located.participantId)
    return located
  }

  markDisconnected(socketId: string): PublicParticipant | null {
    const located = this.socketIndex.get(socketId)
    if (!located) return null
    const room = this.rooms.get(located.roomId)
    const participant = room?.participants.get(located.participantId)
    if (!room || !participant || participant.socketId !== socketId) return null

    participant.socketId = null
    participant.connection = 'reconnecting'
    this.socketIndex.delete(socketId)
    const publicParticipant = toPublicParticipant(participant)
    this.options.onParticipantUpdated?.(room.id, publicParticipant)
    this.options.scheduler.schedule(this.disconnectKey(participant.id), this.options.limits.reconnectGraceMs, () => {
      const current = this.rooms.get(room.id)?.participants.get(participant.id)
      if (current && current.socketId === null) this.removeParticipant(room.id, participant.id)
    })
    return publicParticipant
  }

  updatePresence(socketId: string, camera: boolean, microphone: boolean): RoomResult<PublicParticipant> {
    const membership = this.membershipForSocket(socketId)
    if (!membership) return { ok: false, code: ERROR_CODES.NOT_A_MEMBER }
    membership.participant.camera = camera
    membership.participant.microphone = microphone
    const publicParticipant = toPublicParticipant(membership.participant)
    this.options.onParticipantUpdated?.(membership.room.id, publicParticipant)
    return { ok: true, value: publicParticipant }
  }

  touchActivity(roomId: string): void {
    const room = this.rooms.get(roomId)
    if (!room || this.isExpired(room)) return
    const now = this.options.clock.now()
    room.lastActivityAt = now
    room.expiresAt = Math.min(room.hardCapAt, now + this.options.limits.roomTtlMs)
    this.scheduleExpiry(room)
  }

  currentMember(socketId: string): RoomResult<{ roomId: string; participantId: string; displayName: string }> {
    const membership = this.membershipForSocket(socketId)
    if (!membership) return { ok: false, code: ERROR_CODES.NOT_A_MEMBER }
    return {
      ok: true,
      value: {
        roomId: membership.room.id,
        participantId: membership.participant.id,
        displayName: membership.participant.displayName,
      },
    }
  }

  assertMember(socketId: string, targetParticipantId: string): RoomResult<{ roomId: string; participantId: string; targetSocketId: string | null }> {
    const membership = this.membershipForSocket(socketId)
    if (!membership) return { ok: false, code: ERROR_CODES.NOT_A_MEMBER }
    if (targetParticipantId === membership.participant.id) return { ok: false, code: ERROR_CODES.NOT_A_MEMBER }
    const target = membership.room.participants.get(targetParticipantId)
    if (!target) return { ok: false, code: ERROR_CODES.NOT_A_MEMBER }
    return {
      ok: true,
      value: {
        roomId: membership.room.id,
        participantId: membership.participant.id,
        targetSocketId: target.socketId,
      },
    }
  }

  authorizeTicket(roomId: string, participantId: string, ticket: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room || this.isExpired(room)) return false
    const participant = room.participants.get(participantId)
    return participant?.ticket === ticket
  }

  getPublicRoom(roomId: string): PublicRoom | null {
    const room = this.rooms.get(roomId)
    if (!room) return null
    return this.toPublicRoom(room)
  }

  size(): number {
    return this.rooms.size
  }

  private resume(room: RoomRecord, participant: ParticipantRecord, displayName: string, socketId: string): RoomResult<Membership> {
    this.options.scheduler.cancel(this.disconnectKey(participant.id))
    this.options.scheduler.cancel(this.emptyKey(room.id))
    const replacedSocketId = participant.socketId !== socketId ? participant.socketId : null
    if (replacedSocketId) this.socketIndex.delete(replacedSocketId)
    participant.socketId = socketId
    participant.connection = 'connected'
    participant.displayName = displayName
    participant.camera = false
    participant.microphone = false
    this.socketIndex.set(socketId, { roomId: room.id, participantId: participant.id })
    return {
      ok: true,
      value: {
        room: this.toPublicRoom(room),
        participant: toPublicParticipant(participant),
        ticket: participant.ticket,
        resumed: true,
        replacedSocketId,
      },
    }
  }

  private colorForRoom(room: RoomRecord): string {
    const used = new Set([...room.participants.values()].map((person) => person.color))
    return PARTICIPANT_COLORS.find((color) => !used.has(color)) ?? PARTICIPANT_COLORS[0]
  }

  private addParticipant(room: RoomRecord, displayName: string, socketId: string, resumed: boolean): RoomResult<Membership> {
    const participant: ParticipantRecord = {
      id: createParticipantId(),
      displayName,
      color: '#e8a54b',
      socketId,
      joinedAt: this.options.clock.now(),
      camera: false,
      microphone: false,
      connection: 'connected',
      ticket: createTicket(),
    }
    participant.color = this.colorForRoom(room)
    room.participants.set(participant.id, participant)
    this.socketIndex.set(socketId, { roomId: room.id, participantId: participant.id })
    this.options.scheduler.cancel(this.emptyKey(room.id))
    return {
      ok: true,
      value: {
        room: this.toPublicRoom(room),
        participant: toPublicParticipant(participant),
        ticket: participant.ticket,
        resumed,
        replacedSocketId: null,
      },
    }
  }

  private removeParticipant(roomId: string, participantId: string): void {
    const room = this.rooms.get(roomId)
    const participant = room?.participants.get(participantId)
    if (!room || !participant) return
    this.options.scheduler.cancel(this.disconnectKey(participant.id))
    if (participant.socketId) this.socketIndex.delete(participant.socketId)
    room.participants.delete(participantId)
    this.options.onParticipantLeft?.(roomId, participantId)
    if (room.participants.size === 0) {
      this.options.scheduler.schedule(this.emptyKey(room.id), this.options.limits.emptyRoomGraceMs, () => {
        const current = this.rooms.get(room.id)
        if (current && current.participants.size === 0) this.endRoom(current, 'empty')
      })
    }
  }

  private endRoom(room: RoomRecord, reason: 'expired' | 'empty'): void {
    this.options.scheduler.cancel(this.emptyKey(room.id))
    this.options.scheduler.cancel(this.expiryKey(room.id))
    for (const participant of room.participants.values()) {
      this.options.scheduler.cancel(this.disconnectKey(participant.id))
      if (participant.socketId) this.socketIndex.delete(participant.socketId)
    }
    room.participants.clear()
    this.rooms.delete(room.id)
    this.options.onRoomEnded?.(room.id, reason)
  }

  private scheduleExpiry(room: RoomRecord): void {
    const delay = Math.max(0, room.expiresAt - this.options.clock.now())
    this.options.scheduler.schedule(this.expiryKey(room.id), delay, () => {
      const current = this.rooms.get(room.id)
      if (!current) return
      if (!this.isExpired(current)) {
        this.scheduleExpiry(current)
        return
      }
      this.endRoom(current, 'expired')
    })
  }

  private isExpired(room: RoomRecord): boolean {
    return this.options.clock.now() >= room.expiresAt
  }

  private allocateRoomId(): string | null {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = this.options.createId ? this.options.createId() : createRoomId()
      if (!this.rooms.has(id)) return id
    }
    return null
  }

  private membershipForSocket(socketId: string): { room: RoomRecord; participant: ParticipantRecord } | null {
    const located = this.socketIndex.get(socketId)
    if (!located) return null
    const room = this.rooms.get(located.roomId)
    const participant = room?.participants.get(located.participantId)
    if (!room || !participant || participant.socketId !== socketId) return null
    return { room, participant }
  }

  private toPublicRoom(room: RoomRecord): PublicRoom {
    return {
      id: room.id,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      lastActivityAt: room.lastActivityAt,
      locked: Boolean(room.lock),
      participants: [...room.participants.values()].map(toPublicParticipant),
    }
  }

  private disconnectKey(participantId: string): string {
    return `disconnect:${participantId}`
  }

  private emptyKey(roomId: string): string {
    return `empty:${roomId}`
  }

  private expiryKey(roomId: string): string {
    return `expiry:${roomId}`
  }
}
