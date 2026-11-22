import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMediaStore = defineStore('media', () => {
  const inCall = ref(false)
  const cameraEnabled = ref(false)
  const microphoneEnabled = ref(false)
  const permissionError = ref<string | null>(null)
  const connectionError = ref<string | null>(null)

  function reset() {
    inCall.value = false
    cameraEnabled.value = false
    microphoneEnabled.value = false
    permissionError.value = null
    connectionError.value = null
  }

  return { inCall, cameraEnabled, microphoneEnabled, permissionError, connectionError, reset }
})
