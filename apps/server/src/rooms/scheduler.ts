export interface TimerScheduler {
  schedule(key: string, delayMs: number, fn: () => void): void
  cancel(key: string): void
  clearAll(): void
}

export function createTimeoutScheduler(): TimerScheduler {
  const timers = new Map<string, NodeJS.Timeout>()
  return {
    schedule(key, delayMs, fn) {
      this.cancel(key)
      const timer = setTimeout(() => {
        timers.delete(key)
        fn()
      }, delayMs)
      timer.unref?.()
      timers.set(key, timer)
    },
    cancel(key) {
      const timer = timers.get(key)
      if (timer) clearTimeout(timer)
      timers.delete(key)
    },
    clearAll() {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }
}

export class ManualScheduler implements TimerScheduler {
  readonly tasks = new Map<string, { due: number; fn: () => void }>()

  constructor(private readonly clock: { now(): number }) {}

  schedule(key: string, delayMs: number, fn: () => void): void {
    this.tasks.set(key, { due: this.clock.now() + delayMs, fn })
  }

  cancel(key: string): void {
    this.tasks.delete(key)
  }

  clearAll(): void {
    this.tasks.clear()
  }

  flush(): void {
    const due = [...this.tasks.entries()].filter(([, task]) => task.due <= this.clock.now())
    for (const [key] of due) this.tasks.delete(key)
    for (const [, task] of due) task.fn()
  }
}
