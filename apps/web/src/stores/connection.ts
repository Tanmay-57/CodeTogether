import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export const useConnectionStore = defineStore('connection', () => {
  const status = ref<ConnectionStatus>('idle')

  function setStatus(next: ConnectionStatus) {
    status.value = next
  }

  return { status, setStatus }
})
