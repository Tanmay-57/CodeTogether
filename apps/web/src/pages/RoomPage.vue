<script setup lang="ts">
import { displayNameSchema, ERROR_MESSAGES, roomIdSchema } from '@codetogether/shared'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PreJoinPanel from '@/components/room/PreJoinPanel.vue'
import WorkspaceShell from '@/components/room/WorkspaceShell.vue'
import { useLocalMedia } from '@/composables/useLocalMedia'
import { useRoom } from '@/composables/useRoom'
import { onRoomEvent } from '@/lib/roomBus'
import { clearSession, readSession } from '@/lib/session'
import { clearSignalQueue } from '@/lib/signalQueue'
import { clearChatTyping } from '@/lib/chatTyping'
import { useChatStore } from '@/stores/chat'
import { useMediaStore } from '@/stores/media'
import { useRoomStore } from '@/stores/room'
import { useRunStore } from '@/stores/run'

const route = useRoute()
const router = useRouter()
const media = useMediaStore()
const rooms = useRoomStore()
const runs = useRunStore()
const chat = useChatStore()
const { self, ticket } = storeToRefs(rooms)
const { cameraEnabled, microphoneEnabled } = storeToRefs(media)
const { joinRoom, leaveRoom, updatePresence } = useRoom()
const { stopAll } = useLocalMedia()

const stage = ref<'checking' | 'prejoin' | 'workspace' | 'error'>('checking')
const displayName = ref('')
const lockWord = ref('')
const error = ref('')
const pending = ref(false)
const roomId = ref(String(route.params.roomId ?? ''))

const stopExpired = onRoomEvent((event) => {
  if (event.type !== 'expired') return
  error.value = ERROR_MESSAGES.ROOM_EXPIRED
  stage.value = 'error'
  stopAll()
  clearSignalQueue()
  runs.reset()
  chat.reset()
  clearChatTyping()
})

function invalidRoom(): boolean {
  return !roomIdSchema.safeParse(roomId.value).success
}

async function enterFromSession() {
  const session = readSession()
  if (session?.roomId === roomId.value) {
    displayName.value = session.displayName
    lockWord.value = session.lock ?? ''
  }
  if (session?.roomId === roomId.value && session.enteredWorkspace && session.participantId) {
    stopAll()
    media.cameraEnabled = false
    media.microphoneEnabled = false
    const result = await joinRoom({
      roomId: roomId.value,
      displayName: session.displayName,
      resumeParticipantId: session.participantId,
      ...(session.lock ? { lock: session.lock } : {}),
    }, true)
    if (!result.ok) {
      clearSession()
      error.value = result.message
      stage.value = 'prejoin'
      return
    }
    await updatePresence(false, false)
    stage.value = 'workspace'
    return
  }
  stage.value = 'prejoin'
}

async function joinFromPreJoin() {
  error.value = ''
  const parsed = displayNameSchema.safeParse(displayName.value)
  if (!parsed.success) {
    error.value = 'Enter a display name using 1–32 characters.'
    return
  }
  if (pending.value) return
  pending.value = true
  try {
    const session = readSession()
    const lock = lockWord.value.trim()
    const result = await joinRoom({
      roomId: roomId.value,
      displayName: parsed.data,
      resumeParticipantId: session?.roomId === roomId.value ? session.participantId : undefined,
      ...(lock ? { lock } : {}),
    }, true)
    if (!result.ok) {
      error.value = result.message
      return
    }
    await updatePresence(cameraEnabled.value, microphoneEnabled.value)
    stage.value = 'workspace'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not connect to the server.'
  } finally {
    pending.value = false
  }
}

async function leave() {
  stopAll()
  clearSignalQueue()
  runs.reset()
  chat.reset()
  clearChatTyping()
  media.reset()
  await leaveRoom()
  await router.push('/')
}

onMounted(async () => {
  if (invalidRoom()) {
    error.value = 'That room code is not valid.'
    stage.value = 'error'
    return
  }
  try {
    await enterFromSession()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not connect to the server.'
    stage.value = 'error'
  }
})

watch(() => route.params.roomId, async (value) => {
  roomId.value = String(value ?? '')
  stage.value = 'checking'
  if (invalidRoom()) {
    error.value = 'That room code is not valid.'
    stage.value = 'error'
    return
  }
  await enterFromSession()
})

onBeforeUnmount(() => {
  stopExpired()
  if (stage.value !== 'workspace') stopAll()
})
</script>

<template>
  <main>
    <p v-if="stage === 'checking'" class="px-4 py-10 text-sm text-muted-foreground" role="status">Connecting to the room…</p>
    <PreJoinPanel
      v-else-if="stage === 'prejoin'"
      v-model:model-name="displayName"
      v-model:model-lock="lockWord"
      :room-id="roomId"
      :pending="pending"
      :error="error"
      @join="joinFromPreJoin"
    />
    <WorkspaceShell
      v-else-if="stage === 'workspace' && self && ticket"
      :room-id="roomId"
      :ticket="ticket"
      :participant="self"
      @leave="leave"
    />
    <section v-else class="mx-auto max-w-lg px-4 py-16">
      <h1 class="text-2xl font-medium tracking-tight">Unable to open this room</h1>
      <p class="mt-3 text-sm text-danger" role="alert">{{ error || 'This room is unavailable.' }}</p>
      <RouterLink class="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground" to="/">Back to CodeTogether</RouterLink>
    </section>
  </main>
</template>
