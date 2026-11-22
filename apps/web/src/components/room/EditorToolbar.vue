<script setup lang="ts">
import { findLanguage, LANGUAGES } from '@codetogether/shared'
import { Copy, Download, Minus, Plus } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/button.vue'
import { useCodeExport } from '@/composables/useCodeExport'
import { useCodeRun } from '@/composables/useCodeRun'
import { useEditorStore } from '@/stores/editor'
import { useRunStore } from '@/stores/run'

const props = defineProps<{
  roomId: string
  getText: () => string
  formatDocument: () => Promise<{ ok: boolean; message?: string }>
  setLanguage: (languageId: string) => void
  getFileId?: () => string | undefined
  getFileName: () => string
}>()

const editor = useEditorStore()
const { language, fontSize, syncStatus } = storeToRefs(editor)
const { copyCode, downloadCode } = useCodeExport(props.getText, () => editor.language, () => props.roomId, props.getFileName)
const { run, stop } = useCodeRun()

function onRun() {
  void run(props.getFileId?.())
}
const runs = useRunStore()
const { running } = storeToRefs(runs)
const formattable = () => findLanguage(language.value)?.formattable ?? false

function changeLanguage(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  props.setLanguage(value)
}

async function format() {
  const result = await props.formatDocument()
  if (!result.ok) toast.message(result.message ?? 'Formatting is not available for this language.')
  else toast.success('Document formatted.')
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
    <label class="sr-only" for="language">Language</label>
    <select
      id="language"
      data-testid="language-select"
      class="h-8 rounded-md border border-border bg-card px-2 text-xs"
      :value="language"
      :disabled="syncStatus !== 'synced'"
      @change="changeLanguage"
    >
      <option v-for="item in LANGUAGES" :key="item.id" :value="item.id">{{ item.label }}</option>
    </select>
    <div class="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Decrease font size" @click="editor.setFontSize(fontSize - 1)">
        <Minus class="size-3.5" />
      </Button>
      <span class="w-8 text-center font-mono text-xs text-muted-foreground">{{ fontSize }}</span>
      <Button variant="ghost" size="icon" aria-label="Increase font size" @click="editor.setFontSize(fontSize + 1)">
        <Plus class="size-3.5" />
      </Button>
    </div>
    <Button variant="secondary" size="sm" :aria-disabled="!formattable()" @click="format">Format</Button>
    <Button
      variant="secondary"
      size="sm"
      data-testid="run-code"
      :disabled="!running && syncStatus !== 'synced'"
      @click="running ? stop() : onRun()"
    >
      {{ running ? 'Stop' : 'Run' }}
    </Button>
    <div class="ml-auto flex items-center gap-1">
      <span class="hidden text-xs text-muted-foreground sm:inline" data-testid="sync-label">
        {{ syncStatus === 'synced' ? 'Synced' : syncStatus === 'disconnected' ? 'Offline' : 'Syncing' }}
      </span>
      <Button variant="ghost" size="sm" data-testid="copy-code" @click="copyCode">
        <Copy class="size-3.5" />
        Copy
      </Button>
      <Button variant="ghost" size="sm" data-testid="download-code" @click="downloadCode">
        <Download class="size-3.5" />
        Download
      </Button>
    </div>
  </div>
</template>
