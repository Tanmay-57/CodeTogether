<script setup lang="ts">
import { Link2, LogOut, MessageCircle, Users } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import AppWordmark from '@/components/AppWordmark.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import Button from '@/components/ui/button.vue'
import { useCodeExport } from '@/composables/useCodeExport'
import { useChatStore } from '@/stores/chat'
import { useConnectionStore } from '@/stores/connection'
import { useEditorStore } from '@/stores/editor'
import { useRoomStore } from '@/stores/room'
import ChatPanel from './ChatPanel.vue'

const props = defineProps<{ roomId: string }>()
const emit = defineEmits<{ leave: [] }>()

const connection = useConnectionStore()
const editor = useEditorStore()
const rooms = useRoomStore()
const chat = useChatStore()
const { status } = storeToRefs(connection)
const { syncStatus } = storeToRefs(editor)
const { room } = storeToRefs(rooms)
const { messages } = storeToRefs(chat)
const { copyLink } = useCodeExport(() => '', () => editor.language, () => props.roomId)
const chatOpen = ref(false)
const seen = ref(0)

const unread = computed(() => !chatOpen.value && messages.value.length > seen.value)

watch(messages, () => {
  if (chatOpen.value) seen.value = messages.value.length
})

function toggleChat() {
  chatOpen.value = !chatOpen.value
  if (chatOpen.value) seen.value = messages.value.length
}

const connectionLabel = computed(() => {
  if (status.value === 'connecting') return 'Connecting'
  if (status.value !== 'connected') return 'Reconnecting'
  if (syncStatus.value === 'synced') return 'Connected'
  if (syncStatus.value === 'disconnected') return 'Reconnecting'
  return 'Syncing document'
})
</script>

<template>
  <header class="relative z-30 flex h-12 items-center gap-2 border-b border-border px-3">
    <RouterLink to="/" class="mr-1 hidden sm:inline-flex" aria-label="CodeTogether home">
      <AppWordmark />
    </RouterLink>
    <p class="min-w-0 font-mono text-xs text-muted-foreground">
      <span class="sr-only">Room code</span>
      <span data-testid="room-code-label">{{ roomId }}</span>
    </p>
    <Button variant="secondary" size="sm" data-testid="copy-link" @click="copyLink">
      <Link2 class="size-3.5" />
      <span class="hidden sm:inline">Copy link</span>
    </Button>
    <p class="ml-auto flex items-center gap-2 text-xs text-muted-foreground" data-testid="connection-status" aria-live="polite">
      <span class="size-1.5 rounded-full" :class="connectionLabel === 'Connected' ? 'bg-primary' : 'bg-muted-foreground'" aria-hidden="true" />
      {{ connectionLabel }}
      <Users class="size-3.5" aria-hidden="true" />
      <span>{{ room?.participants.length ?? 0 }}</span>
    </p>
    <div class="relative">
      <Button variant="ghost" size="icon" class="relative" aria-label="Chat" :aria-pressed="chatOpen" data-testid="open-chat" @click="toggleChat">
        <MessageCircle class="size-4" />
        <span v-if="unread" class="absolute top-1 right-1 size-2 rounded-full bg-primary" data-testid="chat-unread" />
      </Button>
      <div v-if="chatOpen" class="absolute top-10 right-0 z-40 flex h-80 w-80 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-md border border-border bg-background shadow-lg">
        <ChatPanel class="min-h-0 flex-1" />
      </div>
    </div>
    <ThemeToggle />
    <Button variant="ghost" size="sm" data-testid="leave-room" @click="emit('leave')">
      <LogOut class="size-3.5" />
      <span class="hidden sm:inline">Leave</span>
    </Button>
  </header>
</template>
