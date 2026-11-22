import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ChatEntry {
  id: string
  participantId: string
  displayName: string
  text: string
  sentAt: number
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatEntry[]>([])

  function replace(next: ChatEntry[]) {
    messages.value = next
  }

  function add(message: ChatEntry) {
    if (messages.value.some((item) => item.id === message.id)) return
    messages.value = [...messages.value, message].slice(-80)
  }

  function reset() {
    messages.value = []
  }

  return { messages, replace, add, reset }
})
