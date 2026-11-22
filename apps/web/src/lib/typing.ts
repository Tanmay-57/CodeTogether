import { reactive } from 'vue'

export const typingIds = reactive<Record<string, true>>({})

const timers = new Map<string, number>()

export function markTyping(participantId: string): void {
  typingIds[participantId] = true
  const existing = timers.get(participantId)
  if (existing) window.clearTimeout(existing)
  timers.set(participantId, window.setTimeout(() => {
    delete typingIds[participantId]
    timers.delete(participantId)
  }, 1500))
}

export function clearTyping(): void {
  for (const timer of timers.values()) window.clearTimeout(timer)
  timers.clear()
  for (const id of Object.keys(typingIds)) delete typingIds[id]
}
