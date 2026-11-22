import { reactive } from 'vue'

export const chatTypingNames = reactive<Record<string, string>>({})

const timers = new Map<string, number>()

export function markChatTyping(participantId: string, displayName: string): void {
  chatTypingNames[participantId] = displayName
  const existing = timers.get(participantId)
  if (existing) window.clearTimeout(existing)
  timers.set(participantId, window.setTimeout(() => {
    delete chatTypingNames[participantId]
    timers.delete(participantId)
  }, 1500))
}

export function clearChatTyping(): void {
  for (const timer of timers.values()) window.clearTimeout(timer)
  timers.clear()
  for (const id of Object.keys(chatTypingNames)) delete chatTypingNames[id]
}
