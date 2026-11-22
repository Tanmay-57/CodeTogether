<script setup lang="ts">
import { CODE_TEXT_KEY, DEFAULT_LIMITS, FILES_MAP_KEY, findLanguage, isParticipantColor, LANGUAGE_META_KEY, LANGUAGES, MAIN_FILE_ID, NOTES_KEY } from '@codetogether/shared'
import { Download, FolderOpen, Plus, X } from 'lucide-vue-next'
import * as monaco from 'monaco-editor'
import { MonacoBinding } from 'y-monaco'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import * as Y from 'yjs'
import Button from '@/components/ui/button.vue'
import { useCollaborativeEditor } from '@/composables/useCollaborativeEditor'
import { clearOpenFiles, openFiles, replaceOpenFiles } from '@/lib/filePresence'
import { zipStored } from '@/lib/zip'
import { clearTyping, markTyping } from '@/lib/typing'
import { setupMonacoEnvironment } from '@/monaco/environment'
import 'monaco-editor/min/vs/editor/editor.main.css'
import { useEditorStore } from '@/stores/editor'

interface SharedFile {
  id: string
  name: string
  language: string
  textKey: string
}

interface NoteRecord {
  id: string
  fileId: string
  line: number
  body: string
  author: string
}

const props = defineProps<{
  roomId: string
  ticket: string
  participant: { id: string; displayName: string; color: string }
}>()
const emit = defineEmits<{ run: [] }>()

const host = ref<HTMLDivElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const documentText = ref('')
const sharedFiles = ref<SharedFile[]>([])
const activeFileId = ref(MAIN_FILE_ID)
const noteLine = ref<number | null>(null)
const noteDraft = ref('')
const notes = ref<NoteRecord[]>([])
const editorStore = useEditorStore()
const { fontSize, theme, language, syncStatus } = storeToRefs(editorStore)
const session = useCollaborativeEditor(props.roomId, props.ticket, props.participant)
const empty = computed(() => session.synced.value && documentText.value.length === 0)
const activeFile = computed(() => sharedFiles.value.find((file) => file.id === activeFileId.value) ?? null)

let editor: monaco.editor.IStandaloneCodeEditor | null = null
const models = new Map<string, monaco.editor.ITextModel>()
const bindings = new Map<string, MonacoBinding>()
let style: HTMLStyleElement | null = null
let decorations: monaco.editor.IEditorDecorationsCollection | null = null
let observed: Y.Text | null = null

function cursorColor(value: string | undefined): string {
  return value && isParticipantColor(value) ? value : '#e8a54b'
}

function translucent(color: string): string {
  const hex = color.slice(1)
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  return `rgb(${red} ${green} ${blue} / 28%)`
}

function cssName(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ')
}

function activeText(): Y.Text {
  const record = activeFile.value
  if (!record) return session.text
  return session.doc.getText(record.textKey)
}

function paintCursors() {
  if (!style) return
  const localId = session.doc.clientID
  const rules: string[] = []
  session.awareness.getStates().forEach((state, clientId) => {
    if (clientId === localId) return
    const user = state.user as { name?: string; color?: string } | undefined
    const color = cursorColor(user?.color)
    const name = typeof user?.name === 'string' ? user.name.trim() : ''
    rules.push(`.yRemoteSelection-${clientId}{background-color:${translucent(color)}}`)
    rules.push(`.yRemoteSelectionHead-${clientId}{border-left-color:${color};color:${color}}`)
    if (!name) return
    rules.push(
      `.yRemoteSelectionHead-${clientId}::after{content:"${cssName(name)}";position:absolute;top:-1.25em;left:0;padding:1px 5px;border-radius:3px;background:${color};color:#1c1408;font:500 11px/1.4 "IBM Plex Sans",sans-serif;white-space:nowrap;pointer-events:none}`,
    )
  })
  style.textContent = rules.join('\n')
  readPresence()
}

function onAwareness(change: { added: number[]; updated: number[] }) {
  paintCursors()
  const localId = session.doc.clientID
  for (const clientId of [...change.added, ...change.updated]) {
    if (clientId === localId) continue
    const state = session.awareness.getStates().get(clientId) as { user?: { participantId?: string }; selection?: unknown } | undefined
    if (!state?.selection || !state.user?.participantId) continue
    markTyping(state.user.participantId)
  }
}

function readText() {
  documentText.value = activeText().toString()
}

function watchText() {
  if (observed) observed.unobserve(readText)
  observed = activeText()
  observed.observe(readText)
  readText()
}

function readLanguage() {
  const record = activeFile.value
  if (record && record.textKey !== CODE_TEXT_KEY) {
    if (LANGUAGES.some((item) => item.id === record.language)) editorStore.setLanguage(record.language)
    return
  }
  const next = session.meta.get(LANGUAGE_META_KEY)
  if (typeof next === 'string' && LANGUAGES.some((item) => item.id === next)) editorStore.setLanguage(next)
}

function readFiles() {
  const files = session.doc.getMap(FILES_MAP_KEY)
  const next: SharedFile[] = []
  files.forEach((value, key) => {
    if (!value || typeof value !== 'object') return
    const record = value as { name?: unknown; language?: unknown; textKey?: unknown }
    if (typeof record.name !== 'string' || typeof record.language !== 'string' || typeof record.textKey !== 'string') return
    next.push({ id: String(key), name: record.name, language: record.language, textKey: record.textKey })
  })
  next.sort((left, right) => left.name.localeCompare(right.name))
  sharedFiles.value = next
  if (next.length > 0 && !next.some((file) => file.id === activeFileId.value)) activeFileId.value = next[0]?.id ?? MAIN_FILE_ID
  showFile()
  readLanguage()
}

function readNotes() {
  const list = session.doc.getArray(NOTES_KEY)
  const next: NoteRecord[] = []
  list.forEach((value) => {
    if (!value || typeof value !== 'object') return
    const note = value as Partial<NoteRecord>
    if (typeof note.id !== 'string' || typeof note.fileId !== 'string' || typeof note.line !== 'number' || typeof note.body !== 'string') return
    next.push({ id: note.id, fileId: note.fileId, line: note.line, body: note.body, author: typeof note.author === 'string' ? note.author : '' })
  })
  notes.value = next
  paintNotes()
}

function ensureFiles() {
  const files = session.doc.getMap(FILES_MAP_KEY)
  if (files.size > 0) {
    readFiles()
    return
  }
  const current = session.meta.get(LANGUAGE_META_KEY)
  const languageId = typeof current === 'string' && LANGUAGES.some((item) => item.id === current) ? current : 'javascript'
  const extension = findLanguage(languageId)?.extension ?? 'txt'
  session.doc.transact(() => {
    if (files.size > 0) return
    files.set(MAIN_FILE_ID, { name: `main.${extension}`, language: languageId, textKey: CODE_TEXT_KEY })
  })
  readFiles()
}

function fallbackFile(): SharedFile {
  return activeFile.value ?? {
    id: MAIN_FILE_ID,
    name: 'main.js',
    language: language.value,
    textKey: CODE_TEXT_KEY,
  }
}

function languageForName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGES.find((item) => item.extension === extension)?.id ?? 'plaintext'
}

function othersOn(fileId: string) {
  return Object.entries(openFiles)
    .filter(([id, info]) => id !== props.participant.id && info.fileId === fileId)
    .map(([id, info]) => ({ id, color: info.color }))
}

function readPresence() {
  const next: Record<string, { fileId: string; fileName: string; color: string }> = {}
  const apply = (state: { user?: { participantId?: string; color?: string }; fileId?: unknown }) => {
    const id = state.user?.participantId
    if (!id || typeof state.fileId !== 'string') return
    const file = sharedFiles.value.find((item) => item.id === state.fileId)
    next[id] = {
      fileId: state.fileId,
      fileName: file?.name ?? '',
      color: typeof state.user?.color === 'string' ? state.user.color : '#e8a54b',
    }
  }
  session.awareness.getStates().forEach((state) => apply(state as { user?: { participantId?: string; color?: string }; fileId?: unknown }))
  replaceOpenFiles(next)
}

function ensureBinding(file: SharedFile) {
  if (!editor) return
  const current = models.get(file.id)
  if (current && !current.isDisposed()) {
    if (current.getLanguageId() !== file.language && LANGUAGES.some((item) => item.id === file.language)) {
      monaco.editor.setModelLanguage(current, file.language)
    }
    return
  }
  const ytext = session.doc.getText(file.textKey)
  const model = monaco.editor.createModel(ytext.toString(), file.language)
  models.set(file.id, model)
  bindings.set(file.id, new MonacoBinding(ytext, model, new Set([editor]), session.awareness))
}

function releaseFile(fileId: string) {
  bindings.get(fileId)?.destroy()
  bindings.delete(fileId)
  const model = models.get(fileId)
  models.delete(fileId)
  if (model && editor?.getModel() === model) editor.setModel(null)
  model?.dispose()
}

function syncBindings() {
  if (!editor) return
  const files = sharedFiles.value.length > 0 ? sharedFiles.value : [fallbackFile()]
  for (const file of files) ensureBinding(file)
  const live = new Set(files.map((file) => file.id))
  for (const id of [...bindings.keys()]) {
    if (!live.has(id)) releaseFile(id)
  }
}

function publishCursor(file: SharedFile) {
  session.awareness.setLocalStateField('fileId', file.id)
  const model = editor?.getModel()
  const selection = editor?.getSelection()
  if (!model || !selection) return
  let anchor = model.getOffsetAt(selection.getStartPosition())
  let head = model.getOffsetAt(selection.getEndPosition())
  if (selection.getDirection() === monaco.SelectionDirection.RTL) {
    const swap = anchor
    anchor = head
    head = swap
  }
  const ytext = session.doc.getText(file.textKey)
  session.awareness.setLocalStateField('selection', {
    anchor: Y.createRelativePositionFromTypeIndex(ytext, anchor),
    head: Y.createRelativePositionFromTypeIndex(ytext, head),
  })
}

function showFile() {
  if (!editor) return
  syncBindings()
  const file = activeFile.value ?? fallbackFile()
  ensureBinding(file)
  const model = models.get(file.id)
  if (model && editor.getModel() !== model) editor.setModel(model)
  publishCursor(file)
  watchText()
  paintNotes()
  readPresence()
}

function paintNotes() {
  if (!editor) return
  decorations ??= editor.createDecorationsCollection()
  const fileId = activeFileId.value
  decorations.set(notes.value.filter((note) => note.fileId === fileId).map((note) => ({
    range: new monaco.Range(note.line, 1, note.line, 1),
    options: {
      isWholeLine: true,
      glyphMarginClassName: 'codetogether-note-glyph',
      glyphMarginHoverMessage: { value: note.author ? `${note.author}: ${note.body}` : note.body },
    },
  })))
}

function openNote(line: number) {
  noteLine.value = line
  noteDraft.value = notes.value.find((note) => note.fileId === activeFileId.value && note.line === line)?.body ?? ''
}

function saveNote() {
  const line = noteLine.value
  if (!line || !session.synced.value) return
  const body = noteDraft.value.trim().slice(0, 280)
  const fileId = activeFileId.value
  const list = session.doc.getArray(NOTES_KEY)
  session.doc.transact(() => {
    let index = -1
    list.forEach((value, position) => {
      const note = value as Partial<NoteRecord>
      if (note.fileId === fileId && note.line === line) index = position
    })
    if (!body) {
      if (index >= 0) list.delete(index, 1)
      return
    }
    if (index >= 0) {
      const current = list.get(index) as NoteRecord
      list.delete(index, 1)
      list.insert(index, [{ ...current, body }])
      return
    }
    if (list.length >= 100) return
    list.insert(list.length, [{
      id: crypto.randomUUID(),
      fileId,
      line,
      body,
      author: props.participant.displayName,
    }])
  })
  noteLine.value = null
}

function selectFile(fileId: string) {
  if (!sharedFiles.value.some((file) => file.id === fileId)) return
  activeFileId.value = fileId
}

function addFile() {
  if (!session.synced.value) return
  ensureFiles()
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const chosen = findLanguage(language.value)
  const languageId = chosen?.id ?? 'javascript'
  const extension = chosen?.extension ?? 'js'
  const files = session.doc.getMap(FILES_MAP_KEY)
  session.doc.transact(() => {
    files.set(id, { name: `file-${files.size + 1}.${extension}`, language: languageId, textKey: `file:${id}` })
  })
  activeFileId.value = id
}

function closeFile(fileId: string) {
  if (fileId === MAIN_FILE_ID || !session.synced.value) return
  const files = session.doc.getMap(FILES_MAP_KEY)
  const record = files.get(fileId) as { textKey?: unknown } | undefined
  const textKey = record && typeof record.textKey === 'string' ? record.textKey : ''
  session.doc.transact(() => {
    files.delete(fileId)
    if (textKey && textKey !== CODE_TEXT_KEY) {
      const ytext = session.doc.getText(textKey)
      if (ytext.length > 0) ytext.delete(0, ytext.length)
    }
    const list = session.doc.getArray(NOTES_KEY)
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const note = list.get(index) as Partial<NoteRecord> | undefined
      if (note?.fileId === fileId) list.delete(index, 1)
    }
  })
}

async function importFile(file: File) {
  if (!session.synced.value) return
  if (file.size > DEFAULT_LIMITS.maxDocBytes) {
    toast.error('That file is too large for a room.')
    return
  }
  const text = await file.text()
  if (text.length > DEFAULT_LIMITS.maxDocBytes) {
    toast.error('That file is too large for a room.')
    return
  }
  if (text.includes('\u0000')) {
    toast.error('That file is not text.')
    return
  }
  ensureFiles()
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const languageId = languageForName(file.name)
  const name = file.name.replace(/[\\/]/g, '').replace(/^\.+/, '').slice(0, 80) || 'file.txt'
  session.doc.transact(() => {
    const ytext = session.doc.getText(`file:${id}`)
    if (text) ytext.insert(0, text)
    session.doc.getMap(FILES_MAP_KEY).set(id, { name, language: languageId, textKey: `file:${id}` })
  })
  activeFileId.value = id
  editorStore.setLanguage(languageId)
}

async function onDrop(event: DragEvent) {
  const dropped = [...(event.dataTransfer?.files ?? [])]
  for (const file of dropped) await importFile(file)
}

function onOpenPick(event: Event) {
  const picked = (event.target as HTMLInputElement).files
  const file = picked?.[0]
  if (file) void importFile(file)
  if (fileInput.value) fileInput.value.value = ''
}

function downloadAll() {
  ensureFiles()
  const used = sharedFiles.value.length > 0
    ? sharedFiles.value.map((file) => ({
      name: file.name,
      bytes: new TextEncoder().encode(session.doc.getText(file.textKey).toString()),
    }))
    : [{ name: 'main.js', bytes: new TextEncoder().encode(session.text.toString()) }]
  const zipped = zipStored(used)
  const blob = new Blob([zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `codetogether-${props.roomId}.zip`
  anchor.click()
  URL.revokeObjectURL(url)
  toast.success('Downloaded the room files.')
}

onMounted(() => {
  setupMonacoEnvironment()
  style = document.createElement('style')
  document.head.append(style)
  session.awareness.on('update', paintCursors)
  session.awareness.on('change', onAwareness)
  session.meta.observe(readLanguage)
  session.doc.getMap(FILES_MAP_KEY).observe(readFiles)
  session.doc.getArray(NOTES_KEY).observe(readNotes)
  paintCursors()
  readLanguage()
  readFiles()
  readNotes()
  editor = monaco.editor.create(host.value!, {
    value: '',
    language: language.value,
    theme: theme.value === 'dark' ? 'vs-dark' : 'vs',
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    fontSize: fontSize.value,
    minimap: { enabled: false },
    glyphMargin: true,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    readOnly: !session.synced.value,
    padding: { top: 16 },
    tabSize: 2,
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => emit('run'))
  editor.onMouseDown((event) => {
    const type = event.target.type
    if (type !== monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS && type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return
    const line = event.target.position?.lineNumber
    if (line) openNote(line)
  })
  const orphan = editor.getModel()
  showFile()
  if (orphan && orphan !== editor.getModel()) orphan.dispose()
})

watch(session.synced, (isSynced) => {
  editor?.updateOptions({ readOnly: !isSynced })
  if (isSynced) ensureFiles()
})
watch(fontSize, (size) => editor?.updateOptions({ fontSize: size }))
watch(theme, (value) => monaco.editor.setTheme(value === 'dark' ? 'vs-dark' : 'vs'))
watch(language, (value) => {
  const model = editor?.getModel()
  if (model && model.getLanguageId() !== value) monaco.editor.setModelLanguage(model, value)
})
watch(activeFileId, () => {
  showFile()
  readLanguage()
})

onBeforeUnmount(() => {
  clearTyping()
  session.awareness.off('update', paintCursors)
  session.awareness.off('change', onAwareness)
  session.meta.unobserve(readLanguage)
  session.doc.getMap(FILES_MAP_KEY).unobserve(readFiles)
  session.doc.getArray(NOTES_KEY).unobserve(readNotes)
  if (observed) observed.unobserve(readText)
  for (const id of [...bindings.keys()]) releaseFile(id)
  clearOpenFiles()
  editor?.dispose()
  style?.remove()
  editor = null
  observed = null
})

async function formatDocument() {
  const current = findLanguage(language.value)
  if (!current?.formattable) return { ok: false as const, message: 'Formatting is not available for this language.' }
  const action = editor?.getAction('editor.action.formatDocument')
  if (!action) return { ok: false as const, message: 'Formatting is not available for this language.' }
  await action.run()
  return { ok: true as const }
}

function getText() {
  return activeText().toString()
}

function getFileName() {
  const name = activeFile.value?.name ?? 'main.js'
  return name.replace(/[\\/]/g, '').replace(/^\.+/, '').slice(0, 80) || 'main.js'
}

function setLanguage(next: string) {
  if (!session.synced.value) return
  const record = activeFile.value
  session.doc.transact(() => {
    if (record) session.doc.getMap(FILES_MAP_KEY).set(record.id, { ...record, language: next })
    if (!record || record.textKey === CODE_TEXT_KEY) session.meta.set(LANGUAGE_META_KEY, next)
  })
  editorStore.setLanguage(next)
  readFiles()
}

function runFileId(): string | undefined {
  const record = activeFile.value
  if (!record || record.textKey === CODE_TEXT_KEY) return undefined
  return record.id
}

function revealParticipant(participantId: string) {
  if (!editor) return
  let index = -1
  let textType: Y.AbstractType<unknown> | null = null
  session.awareness.getStates().forEach((state) => {
    const user = state.user as { participantId?: string } | undefined
    if (user?.participantId !== participantId) return
    const selection = (state as { selection?: { anchor?: Y.RelativePosition } }).selection
    if (!selection?.anchor) return
    const absolute = Y.createAbsolutePositionFromRelativePosition(selection.anchor, session.doc)
    if (!absolute) return
    index = absolute.index
    textType = absolute.type
  })
  if (index < 0) return
  const match = sharedFiles.value.find((file) => session.doc.getText(file.textKey) === textType)
  if (match) activeFileId.value = match.id
  void nextTick(() => {
    const model = editor?.getModel()
    if (!model || !editor) return
    const position = model.getPositionAt(Math.min(index, model.getValueLength()))
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
  })
}

defineExpose({ formatDocument, getText, getFileName, setLanguage, revealParticipant, runFileId })
</script>

<template>
  <div class="relative flex h-full min-h-0 flex-col bg-card" @dragover.prevent @drop.prevent="onDrop">
    <div class="flex items-center gap-1 overflow-auto border-b border-border px-2 py-1" aria-label="Files">
      <div v-for="file in sharedFiles" :key="file.id" class="flex shrink-0 items-center">
        <button
          type="button"
          class="flex h-7 items-center gap-1 rounded-md px-2 text-xs"
          :class="file.id === activeFileId ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
          @click="selectFile(file.id)"
        >
          <span
            v-for="person in othersOn(file.id)"
            :key="person.id"
            class="size-1.5 rounded-full"
            :style="{ backgroundColor: person.color }"
          />
          {{ file.name }}
        </button>
        <button
          v-if="file.id !== MAIN_FILE_ID"
          type="button"
          class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          :aria-label="`Close ${file.name}`"
          @click="closeFile(file.id)"
        >
          <X class="size-3" />
        </button>
      </div>
      <Button variant="ghost" size="icon" aria-label="Add file" data-testid="add-file" @click="addFile">
        <Plus class="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Open a file" data-testid="open-file" @click="fileInput?.click()">
        <FolderOpen class="size-3.5" />
      </Button>
      <input ref="fileInput" class="hidden" type="file" data-testid="open-file-input" @change="onOpenPick" />
      <Button variant="ghost" size="icon" class="ml-auto" title="Download all files as a zip" aria-label="Download all files as a zip" data-testid="download-all" @click="downloadAll">
        <Download class="size-3.5" />
      </Button>
    </div>
    <div class="relative min-h-0 flex-1">
      <div ref="host" class="h-full min-h-40" data-testid="monaco-host" />
      <p v-if="empty" class="pointer-events-none absolute top-5 left-16 text-sm text-muted-foreground">
        The document is empty. Start typing to write together.
      </p>
      <p
        v-if="syncStatus !== 'synced'"
        class="pointer-events-none absolute top-3 right-3 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
      >
        {{ syncStatus === 'disconnected' ? 'Reconnecting to the document' : 'Syncing document' }}
      </p>
    </div>
    <form v-if="noteLine" class="flex items-center gap-2 border-t border-border px-3 py-2" @submit.prevent="saveNote">
      <label class="shrink-0 text-xs text-muted-foreground" for="line-note">Line {{ noteLine }}</label>
      <input
        id="line-note"
        v-model="noteDraft"
        class="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
        maxlength="280"
        placeholder="Leave a short note"
      />
      <Button type="submit" size="sm">Save note</Button>
      <Button type="button" variant="ghost" size="sm" @click="noteLine = null">Close</Button>
    </form>
    <pre data-testid="document-text" class="sr-only">{{ documentText }}</pre>
  </div>
</template>

<style>
.codetogether-note-glyph {
  background: #e8a54b;
  border-radius: 2px;
  width: 6px !important;
  margin-left: 3px;
}
</style>
