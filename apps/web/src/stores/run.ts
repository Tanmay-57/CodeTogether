import { defineStore } from 'pinia'
import { ref } from 'vue'

type RunStream = 'stdout' | 'stderr' | 'system' | 'stdin'
type RunLine = { id: number; stream: RunStream; text: string }
type OutputPayload = { runId: string; stream: RunStream; text: string }

export const useRunStore = defineStore('run', () => {
  const running = ref(false)
  const runId = ref<string | null>(null)
  const startedBy = ref('')
  const lines = ref<RunLine[]>([])
  let nextId = 0

  function start(payload: { runId: string; startedBy: string }) {
    runId.value = payload.runId
    startedBy.value = payload.startedBy
    lines.value = []
    running.value = true
  }

  function append(payload: OutputPayload) {
    if (payload.runId !== runId.value) return
    lines.value.push({ id: nextId, stream: payload.stream, text: payload.text })
    nextId += 1
  }

  function finish(payload: { runId: string }) {
    if (payload.runId !== runId.value) return
    running.value = false
  }

  function applyState(payload: { runId: string; running: boolean; startedBy: string; lines: Array<{ stream: RunLine['stream']; text: string }> }) {
    runId.value = payload.runId
    startedBy.value = payload.startedBy
    running.value = payload.running
    lines.value = payload.lines.map((line) => {
      const id = nextId
      nextId += 1
      return { id, stream: line.stream, text: line.text }
    })
  }

  function clearLines() {
    lines.value = []
  }

  function reset() {
    running.value = false
    runId.value = null
    startedBy.value = ''
    lines.value = []
  }

  return { running, runId, startedBy, lines, start, append, finish, applyState, clearLines, reset }
})
