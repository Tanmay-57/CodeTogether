<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import VideoDock from '@/components/call/VideoDock.vue'
import CollaborativeEditor from '@/components/editor/CollaborativeEditor.vue'
import { useCodeRun } from '@/composables/useCodeRun'
import EditorToolbar from './EditorToolbar.vue'
import TerminalPanel from './TerminalPanel.vue'
import TopBar from './TopBar.vue'

const props = defineProps<{
  roomId: string
  ticket: string
  participant: { id: string; displayName: string; color: string }
}>()
const emit = defineEmits<{ leave: [] }>()

const PANEL_WIDTH_KEY = 'codetogether.panelWidth'
const PANEL_MIN = 280

const editorRef = ref<InstanceType<typeof CollaborativeEditor> | null>(null)
const { run } = useCodeRun()
const participant = computed(() => props.participant)
const panelWidth = ref(readStored(PANEL_WIDTH_KEY, 320))
let stopDrag: (() => void) | null = null

function readStored(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  const stored = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(stored) ? stored : fallback
}

function clampPanelWidth(width: number): number {
  const max = Math.max(PANEL_MIN, Math.floor(window.innerWidth / 2))
  return Math.min(max, Math.max(PANEL_MIN, width))
}

function remember(key: string, value: number) {
  localStorage.setItem(key, String(value))
}

function startResize(event: PointerEvent) {
  if (window.innerWidth < 1024) return
  event.preventDefault()
  const move = (pointer: PointerEvent) => {
    panelWidth.value = clampPanelWidth(window.innerWidth - pointer.clientX)
  }
  const stop = () => {
    remember(PANEL_WIDTH_KEY, panelWidth.value)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    stopDrag = null
  }
  stopDrag = stop
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

function getText() {
  return editorRef.value?.getText() ?? ''
}

function getFileName() {
  return editorRef.value?.getFileName() ?? 'main.js'
}

function formatDocument() {
  return editorRef.value?.formatDocument() ?? Promise.resolve({ ok: false, message: 'The editor is still loading.' })
}

function setLanguage(languageId: string) {
  editorRef.value?.setLanguage(languageId)
}

function runFileId() {
  return editorRef.value?.runFileId()
}

function onEditorRun() {
  void run(runFileId())
}

function jumpTo(participantId: string) {
  editorRef.value?.revealParticipant(participantId)
}

onBeforeUnmount(() => stopDrag?.())
</script>

<template>
  <div
    class="workspace-grid grid h-dvh grid-rows-[auto_auto_auto_auto_minmax(0,1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)]"
    :style="{ '--panel-width': `${clampPanelWidth(panelWidth)}px` }"
  >
    <TopBar class="lg:col-span-2" :room-id="roomId" @leave="emit('leave')" />
    <aside class="relative border-b border-border lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:flex lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-l">
      <div
        class="absolute top-0 left-0 z-10 hidden h-full w-2 -translate-x-1/2 cursor-col-resize touch-none lg:block"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize call panel"
        @pointerdown="startResize"
      />
      <div class="h-[240px] min-h-0 overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1" data-testid="call-section">
        <VideoDock @jump="jumpTo" />
      </div>
    </aside>
    <EditorToolbar
      class="lg:col-start-1 lg:row-start-2"
      :room-id="roomId"
      :get-text="getText"
      :get-file-name="getFileName"
      :format-document="formatDocument"
      :set-language="setLanguage"
      :get-file-id="runFileId"
    />
    <p class="border-b border-border px-3 py-1.5 text-xs text-muted-foreground lg:hidden">
      Extended code editing is meant for a larger screen. Copy, download, and call controls stay available here.
    </p>
    <div class="flex min-h-0 flex-col lg:col-start-1 lg:row-start-3">
      <CollaborativeEditor
        ref="editorRef"
        class="min-h-0 flex-1"
        :room-id="roomId"
        :ticket="ticket"
        :participant="participant"
        @run="onEditorRun"
      />
      <TerminalPanel />
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 1024px) {
  .workspace-grid {
    grid-template-columns: minmax(0, 1fr) var(--panel-width);
  }
}
</style>
