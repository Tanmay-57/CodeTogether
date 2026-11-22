import { describe, expect, it } from 'vitest'
import { ROOM_ID_PATTERN } from '@codetogether/shared'
import { createRoomId, createTicket } from '../src/rooms/ids'

describe('room ids', () => {
  it('creates collision-resistant base64url ids of the expected length', () => {
    const ids = new Set(Array.from({ length: 30 }, () => createRoomId()))
    expect(ids.size).toBe(30)
    for (const id of ids) expect(id).toMatch(ROOM_ID_PATTERN)
  })

  it('creates tickets that are not room ids or short secrets', () => {
    const ticket = createTicket()
    expect(ticket.length).toBeGreaterThan(20)
    expect(ticket).not.toMatch(ROOM_ID_PATTERN)
  })
})
