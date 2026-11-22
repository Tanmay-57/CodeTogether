export interface RateClock {
  now(): number
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly clock: RateClock = { now: () => Date.now() },
  ) {}

  allow(key: string): boolean {
    const now = this.clock.now()
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => now - timestamp < this.windowMs)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }
}
