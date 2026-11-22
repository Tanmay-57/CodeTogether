<script setup lang="ts">
import { ClientEvents, ERROR_MESSAGES, type ErrorCode, simpleAckSchema } from '@codetogether/shared'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/button.vue'
import { chatTypingNames } from '@/lib/chatTyping'
import { ensureConnected, getSocket } from '@/lib/socket'
import { useChatStore } from '@/stores/chat'

const chat = useChatStore()
const { messages } = storeToRefs(chat)
const draft = ref('')
const list = ref<HTMLElement | null>(null)
const pending = ref(false)
let pulseTimer = 0

const typingLabel = computed(() => {
  const names = Object.values(chatTypingNames)
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} is typing`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)} are typing`
})

function pulseTyping() {
  if (!draft.value.trim()) return
  getSocket().emit(ClientEvents.ChatTyping, {})
  pulseTimer = window.setTimeout(pulseTyping, 1000)
}

watch(draft, (value) => {
  if (!value.trim()) {
    window.clearTimeout(pulseTimer)
    pulseTimer = 0
    return
  }
  if (pulseTimer) return
  pulseTyping()
})

onBeforeUnmount(() => window.clearTimeout(pulseTimer))

watch(messages, async () => {
  await nextTick()
  if (list.value) list.value.scrollTop = list.value.scrollHeight
}, { deep: true })

function messageFor(code: string): string {
  return code in ERROR_MESSAGES ? ERROR_MESSAGES[code as ErrorCode] : 'The message could not be sent.'
}

async function send() {
  const text = draft.value.trim()
  if (!text || pending.value) return
  pending.value = true
  try {
    await ensureConnected()
    const response = await new Promise<{ ok: true } | { ok: false; code: string }>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('The server did not respond.')), 8000)
      getSocket().emit(ClientEvents.ChatSend, { text }, (value: unknown) => {
        window.clearTimeout(timer)
        const parsed = simpleAckSchema.safeParse(value)
        if (!parsed.success) {
          reject(new Error('The server sent an unexpected response.'))
          return
        }
        resolve(parsed.data)
      })
    })
    if (!response.ok) {
      toast.error(messageFor(response.code))
      return
    }
    draft.value = ''
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'The message could not be sent.')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col" aria-label="Chat">
    <header class="px-3 py-2 text-xs">
      <h2 class="font-medium">Chat</h2>
    </header>
    <ul ref="list" class="min-h-0 flex-1 space-y-2 overflow-auto px-3 pb-2">
      <li v-if="messages.length === 0" class="text-xs text-muted-foreground">Messages stay in this room only.</li>
      <li v-for="message in messages" :key="message.id">
        <p class="text-[11px] text-muted-foreground">{{ message.displayName }}</p>
        <p class="text-sm break-words">{{ message.text }}</p>
      </li>
    </ul>
    <p v-if="typingLabel" class="px-3 pb-2 text-[11px] text-muted-foreground" data-testid="chat-typing">{{ typingLabel }}</p>
    <form class="flex gap-2 px-3 pb-3" @submit.prevent="send">
      <label class="sr-only" for="room-chat">Message</label>
      <input
        id="room-chat"
        v-model="draft"
        data-testid="room-chat"
        class="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm"
        maxlength="500"
        placeholder="Message the room"
      />
      <Button type="submit" size="sm" :disabled="pending">Send</Button>
    </form>
  </section>
</template>
