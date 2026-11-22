import { DEFAULT_LIMITS, ERROR_CODES, type Limits } from '@codetogether/shared'
import { describe, expect, it } from 'vitest'
import { RoomService } from '../src/rooms/roomService'
import { ManualScheduler } from '../src/rooms/scheduler'

function setup(limits: Partial<Limits> = {}) {
  let now = 0
  const clock = {
    now: () => now,
    set(value: number) {
      now = value
    },
  }
  const scheduler = new ManualScheduler(clock)
  const ended: Array<{ id: string; reason: string }> = []
  const left: string[] = []
  const service = new RoomService({
    clock,
    scheduler,
    limits: {
      ...DEFAULT_LIMITS,
      maxParticipants: 2,
      roomTtlMs: 1_000,
      roomHardCapMs: 5_000,
      emptyRoomGraceMs: 100,
      reconnectGraceMs: 50,
      ...limits,
    },
    onRoomEnded(id, reason) {
      ended.push({ id, reason })
    },
    onParticipantLeft(_roomId, participantId) {
      left.push(participantId)
    },
  })
  return { clock, scheduler, service, ended, left }
}

describe('room lifecycle', () => {
  it('gives each person in a room a different color', () => {
    const { service } = setup({ maxParticipants: 4 })
    const created = service.create('Ada', 'socket-a')
    if (!created.ok) throw new Error('create failed')
    const lin = service.join(created.value.room.id, 'Lin', 'socket-b')
    const noa = service.join(created.value.room.id, 'Noa', 'socket-c')
    if (!lin.ok || !noa.ok) throw new Error('join failed')
    const colors = [created.value.participant.color, lin.value.participant.color, noa.value.participant.color]
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('creates a room and rejects a full room', () => {
    const { service } = setup()
    const created = service.create('Ada', 'socket-a')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const joined = service.join(created.value.room.id, 'Lin', 'socket-b')
    expect(joined.ok).toBe(true)
    const blocked = service.join(created.value.room.id, 'Noa', 'socket-c')
    expect(blocked).toEqual({ ok: false, code: ERROR_CODES.ROOM_FULL })
  })

  it('resumes inside the grace period and drops the participant after it', () => {
    const { service, clock, scheduler, left } = setup()
    const created = service.create('Ada', 'socket-a')
    if (!created.ok) throw new Error('create failed')
    const participantId = created.value.participant.id
    service.markDisconnected('socket-a')
    clock.set(49)
    scheduler.flush()
    const resumed = service.join(created.value.room.id, 'Ada', 'socket-b', participantId)
    expect(resumed.ok && resumed.value.resumed).toBe(true)
    expect(resumed.ok && resumed.value.participant.id).toBe(participantId)

    service.markDisconnected('socket-b')
    clock.set(100)
    scheduler.flush()
    expect(left).toContain(participantId)
    const replaced = service.join(created.value.room.id, 'Ada', 'socket-c', participantId)
    expect(replaced.ok && replaced.value.resumed).toBe(false)
  })

  it('expires a room and cleans it up after the empty grace period', () => {
    const { service, clock, scheduler, ended } = setup()
    const created = service.create('Ada', 'socket-a')
    if (!created.ok) throw new Error('create failed')
    clock.set(1_000)
    const expired = service.join(created.value.room.id, 'Lin', 'socket-b')
    expect(expired).toEqual({ ok: false, code: ERROR_CODES.ROOM_EXPIRED })
    expect(ended).toEqual([{ id: created.value.room.id, reason: 'expired' }])
    expect(service.getPublicRoom(created.value.room.id)).toBeNull()

    const second = service.create('Bea', 'socket-c')
    if (!second.ok) throw new Error('create failed')
    service.leave('socket-c')
    clock.set(second.value.room.createdAt + 100)
    scheduler.flush()
    expect(ended.some((event) => event.id === second.value.room.id && event.reason === 'empty')).toBe(true)
    expect(service.join(second.value.room.id, 'Bea', 'socket-d')).toEqual({ ok: false, code: ERROR_CODES.ROOM_NOT_FOUND })
  })

  it('extends activity without passing the hard cap', () => {
    const { service, clock } = setup()
    const created = service.create('Ada', 'socket-a')
    if (!created.ok) throw new Error('create failed')
    clock.set(500)
    service.touchActivity(created.value.room.id)
    expect(service.getPublicRoom(created.value.room.id)?.expiresAt).toBe(1_500)
    clock.set(1_400)
    service.touchActivity(created.value.room.id)
    expect(service.getPublicRoom(created.value.room.id)?.expiresAt).toBe(2_400)
    clock.set(2_300)
    service.touchActivity(created.value.room.id)
    expect(service.getPublicRoom(created.value.room.id)?.expiresAt).toBe(3_300)
    clock.set(3_200)
    service.touchActivity(created.value.room.id)
    expect(service.getPublicRoom(created.value.room.id)?.expiresAt).toBe(4_200)
    clock.set(4_100)
    service.touchActivity(created.value.room.id)
    expect(service.getPublicRoom(created.value.room.id)?.expiresAt).toBe(5_000)
  })

  it('rejects presence and signaling for sockets that are not members', () => {
    const { service } = setup()
    const created = service.create('Ada', 'socket-a')
    if (!created.ok) throw new Error('create failed')
    expect(service.updatePresence('socket-x', true, true)).toEqual({ ok: false, code: ERROR_CODES.NOT_A_MEMBER })
    expect(service.assertMember('socket-x', created.value.participant.id)).toEqual({ ok: false, code: ERROR_CODES.NOT_A_MEMBER })
    expect(service.assertMember('socket-a', created.value.participant.id)).toEqual({ ok: false, code: ERROR_CODES.NOT_A_MEMBER })
  })

  it('retries room id collisions', () => {
    const ids = ['abcdefghijkl', 'abcdefghijkl', 'mnopqrstuvwx']
    let index = 0
    let now = 0
    const clock = { now: () => now }
    const service = new RoomService({
      clock,
      scheduler: new ManualScheduler(clock),
      limits: { ...DEFAULT_LIMITS, maxParticipants: 4 },
      createId: () => ids[Math.min(index++, ids.length - 1)] ?? 'zzzzzzzzzzzz',
    })
    const first = service.create('Ada', 'socket-a')
    const second = service.create('Lin', 'socket-b')
    expect(first.ok && first.value.room.id).toBe('abcdefghijkl')
    expect(second.ok && second.value.room.id).toBe('mnopqrstuvwx')
    now += 1
  })

  it('keeps a room closed until the lock word matches', () => {
    const { service } = setup()
    const created = service.create('Ada', 'socket-a', 'quiet')
    if (!created.ok) throw new Error('create failed')
    expect(created.value.room.locked).toBe(true)
    expect(service.join(created.value.room.id, 'Lin', 'socket-b')).toEqual({ ok: false, code: ERROR_CODES.ROOM_LOCKED })
    const joined = service.join(created.value.room.id, 'Lin', 'socket-b', undefined, 'quiet')
    expect(joined.ok).toBe(true)
  })
})
