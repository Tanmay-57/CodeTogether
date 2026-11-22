import { describe, expect, it } from 'vitest'
import { RateLimiter } from '../src/security/rateLimit'

describe('rate limiter', () => {
  it('blocks a key after the configured number of hits inside the window', () => {
    let now = 0
    const limiter = new RateLimiter(2, 1_000, { now: () => now })
    expect(limiter.allow('ip')).toBe(true)
    expect(limiter.allow('ip')).toBe(true)
    expect(limiter.allow('ip')).toBe(false)
    now = 1_000
    expect(limiter.allow('ip')).toBe(true)
  })
})
