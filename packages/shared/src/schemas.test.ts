import { describe, expect, it } from 'vitest'
import { createRoomSchema, joinRoomSchema, roomIdSchema, webRtcOfferSchema } from './schemas'

describe('payload schemas', () => {
  it('accepts a trimmed display name and rejects control characters', () => {
    expect(createRoomSchema.parse({ displayName: '  Ada  ' }).displayName).toBe('Ada')
    expect(createRoomSchema.safeParse({ displayName: 'Ada\u0000' }).success).toBe(false)
    expect(createRoomSchema.safeParse({ displayName: '' }).success).toBe(false)
    expect(createRoomSchema.safeParse({ displayName: 'A'.repeat(33) }).success).toBe(false)
  })

  it('accepts only generated room id shapes', () => {
    expect(roomIdSchema.safeParse('Ab3_-xY9012q').success).toBe(true)
    expect(roomIdSchema.safeParse('short').success).toBe(false)
    expect(roomIdSchema.safeParse('has spaces!!').success).toBe(false)
    expect(joinRoomSchema.safeParse({
      roomId: 'Ab3_-xY9012q',
      displayName: 'Lin',
      extra: true,
    }).success).toBe(false)
  })

  it('rejects answers labeled as offers and oversized descriptions', () => {
    expect(webRtcOfferSchema.safeParse({
      to: '2b6f4b3e-1f3a-4c2d-9a11-0d5a6e7f8091',
      description: { type: 'answer', sdp: 'v=0' },
    }).success).toBe(false)
    expect(webRtcOfferSchema.safeParse({
      to: '2b6f4b3e-1f3a-4c2d-9a11-0d5a6e7f8091',
      description: { type: 'offer', sdp: 'v=0' },
    }).success).toBe(true)
  })
})
