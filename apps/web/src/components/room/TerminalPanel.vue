<script setup lang="ts">
import { Copy, Eraser } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/button.vue'
import { useCodeRun } from '@/composables/useCodeRun'
import { useRunStore } from '@/stores/run'

const HEIGHT_KEY = 'codetogether.terminalHeight'
const HEIGHT_MIN = 96
const HEIGHT_DEFAULT = 144

const runs = useRunStore()
const { lines, running, startedBy } = storeToRefs(runs)
const { sendInput, stop, clearOutput } = useCodeRun()
const log = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const draft = ref('')
const history = ref<string[]>([])
const historyCursor = ref(-1)
const historyDraft = ref('')
const height = ref(readHeight())
let stopDrag: (() => void) | null = null

function readHeight(): number {
  const raw = localStorage.getItem(HEIGHT_KEY)
  const stored = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(stored) ? stored : HEIGHT_DEFAULT
}

function clampHeight(next: number, columnHeight: number): number {
  const max = Math.min(Math.floor(window.innerHeight * 0.7), Math.max(HEIGHT_MIN, columnHeight - 120))
  return Math.min(max, Math.max(HEIGHT_MIN, next))
}

function startResize(event: PointerEvent) {
  const section = panel.value
  const column = section?.parentElement
  if (!section || !column) return
  event.preventDefault()
  const bottom = section.getBoundingClientRect().bottom
  const columnHeight = column.getBoundingClientRect().height
  const move = (pointer: PointerEvent) => {
    height.value = clampHeight(bottom - pointer.clientY, columnHeight)
  }
  const stop = () => {
    localStorage.setItem(HEIGHT_KEY, String(height.value))
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    stopDrag = null
  }
  stopDrag = stop
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

function onKeydown(event: KeyboardEvent) {
  if (!running.value) return
  if (event.key === 'c' && event.ctrlKey && !event.metaKey && !event.altKey) {
    if ((window.getSelection()?.toString() ?? '').length > 0) return
    event.preventDefault()
    void stop()
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (history.value.length === 0) return
    if (historyCursor.value === -1) {
      historyDraft.value = draft.value
      historyCursor.value = history.value.length - 1
    } else if (historyCursor.value > 0) historyCursor.value -= 1
    draft.value = history.value[historyCursor.value] ?? ''
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (historyCursor.value === -1) return
    if (historyCursor.value >= history.value.length - 1) {
      historyCursor.value = -1
      draft.value = historyDraft.value
      return
    }
    historyCursor.value += 1
    draft.value = history.value[historyCursor.value] ?? ''
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const text = draft.value
    if (text) history.value = [...history.value, text].slice(-50)
    historyCursor.value = -1
    draft.value = ''
    void sendInput(text)
    return
  }
  if (event.key === 'Backspace') {
    event.preventDefault()
    draft.value = draft.value.slice(0, -1)
    return
  }
  if (event.key.length === 1 && draft.value.length < 4096) {
    event.preventDefault()
    draft.value += event.key
  }
}

function onPaste(event: ClipboardEvent) {
  if (!running.value) return
  event.preventDefault()
  const pasted = event.clipboardData?.getData('text') ?? ''
  const line = pasted.replace(/\r/g, '').split('\n')[0] ?? ''
  draft.value = (draft.value + line).slice(0, 4096)
}

watch([lines, draft], async () => {
  await nextTick()
  if (log.value) log.value.scrollTop = log.value.scrollHeight
}, { deep: true })

onBeforeUnmount(() => stopDrag?.())

async function copyOutput() {
  const text = lines.value.map((line) => line.text).join('')
  if (!navigator.clipboard?.writeText) {
    toast.error('Clipboard is unavailable in this browser.')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Output copied.')
  } catch {
    toast.error('Clipboard is unavailable in this browser.')
  }
}

function lineClass(stream: 'stdout' | 'stderr' | 'system' | 'stdin'): string {
  if (stream === 'stderr') return 'text-danger'
  if (stream === 'system') return 'text-muted-foreground'
  return ''
}
</script>

<template>
  <section
    ref="panel"
    class="relative flex shrink-0 flex-col border-t border-border bg-background"
    :style="{ height: `${clampHeight(height, panel?.parentElement?.getBoundingClientRect().height || height + 120)}px` }"
    aria-label="Terminal"
  >
    <div
      class="absolute top-0 left-0 z-10 h-2 w-full -translate-y-1/2 cursor-row-resize touch-none"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize terminal"
      @pointerdown="startResize"
    />
    <header class="flex items-center justify-between gap-2 px-3 py-1 text-xs text-muted-foreground">
      <h2 class="font-medium text-foreground">Terminal</h2>
      <div class="flex items-center gap-1">
        <span>{{ running ? 'Running' : startedBy ? `${startedBy} ran this` : 'Idle' }}</span>
        <Button variant="ghost" size="icon" aria-label="Copy output" data-testid="copy-output" @click="copyOutput">
          <Copy class="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Clear output" data-testid="clear-output" @click="clearOutput">
          <Eraser class="size-3.5" />
        </Button>
      </div>
    </header>
    <pre
      ref="log"
      data-testid="terminal-output"
      tabindex="0"
      class="min-h-0 flex-1 cursor-text overflow-auto px-3 pb-2 font-mono text-xs leading-5 whitespace-pre-wrap outline-none"
      @keydown="onKeydown"
      @paste="onPaste"
    ><template v-if="lines.length === 0 && !running">Run the document to see output here.</template><span v-for="line in lines" :key="line.id" :class="lineClass(line.stream)">{{ line.text }}</span><span v-if="running">{{ draft }}<span class="terminal-cursor" aria-hidden="true"></span></span></pre>
  </section>
</template>

<style scoped>
.terminal-cursor {
  display: inline-block;
  width: 0.55em;
  height: 1em;
  margin-left: 1px;
  background: currentColor;
  vertical-align: text-bottom;
}
</style>
