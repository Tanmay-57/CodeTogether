<script setup lang="ts">
import { ChevronDown, ChevronUp, Mic, MicOff, Monitor, PhoneOff, Video, VideoOff } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import Button from '@/components/ui/button.vue'
import VideoTile from './VideoTile.vue'
import { useLocalMedia } from '@/composables/useLocalMedia'
import { useRoom } from '@/composables/useRoom'
import { useWebRTC } from '@/composables/useWebRTC'
import { typingIds } from '@/lib/typing'
import { useMediaStore } from '@/stores/media'
import { useRoomStore } from '@/stores/room'

const emit = defineEmits<{ jump: [participantId: string] }>()
const collapsed = ref(false)
const rooms = useRoomStore()
const media = useMediaStore()
const { self, others } = storeToRefs(rooms)
const { cameraEnabled, microphoneEnabled, permissionError, connectionError, inCall } = storeToRefs(media)
const { stream, screenStream, setCamera, setMicrophone, shareScreen, stopAll } = useLocalMedia()
const { peers, publishLocal, startCall, leaveCall } = useWebRTC()
const { updatePresence } = useRoom()

onMounted(() => {
  media.inCall = true
})

const previewStream = computed(() => screenStream.value ?? (cameraEnabled.value ? stream.value : null))

watch(screenStream, () => {
  if (inCall.value) void publishLocal()
})

const tiles = computed(() => others.value.map((person) => ({
  person,
  stream: peers.value.get(person.id) ?? null,
})))

async function syncPresence() {
  await updatePresence(cameraEnabled.value, microphoneEnabled.value)
  if (inCall.value) await publishLocal()
}

async function toggleCamera() {
  const enabled = await setCamera(!cameraEnabled.value)
  if (!enabled && !cameraEnabled.value) await syncPresence()
  else await syncPresence()
}

async function toggleMicrophone() {
  await setMicrophone(!microphoneEnabled.value)
  await syncPresence()
}

async function onLeaveCall() {
  leaveCall()
  stopAll()
  await updatePresence(false, false)
}

async function onShare() {
  media.permissionError = null
  await shareScreen()
}

async function onStartCall() {
  await startCall()
  await syncPresence()
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col" aria-label="Audio and video">
    <header class="flex shrink-0 items-center justify-between px-3 py-2">
      <h2 class="text-xs font-medium">Call</h2>
      <Button variant="ghost" size="icon" :aria-label="collapsed ? 'Expand call' : 'Collapse call'" @click="collapsed = !collapsed">
        <ChevronDown v-if="!collapsed" class="size-4" />
        <ChevronUp v-else class="size-4" />
      </Button>
    </header>
    <div v-show="!collapsed" class="grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start items-start gap-2 overflow-auto px-3 pb-2 lg:grid-cols-1">
      <VideoTile :stream="previewStream" :name="`${self?.displayName ?? 'You'} (you)`" muted :mirror="!screenStream" />
      <VideoTile
        v-for="tile in tiles"
        :key="tile.person.id"
        :stream="tile.stream"
        jumpable
        :name="typingIds[tile.person.id] ? `${tile.person.displayName} · Typing` : tile.person.displayName"
        @jump="emit('jump', tile.person.id)"
      />
    </div>
    <p v-if="permissionError" class="px-3 pb-2 text-xs text-danger" role="alert">{{ permissionError }}</p>
    <p v-if="connectionError" class="px-3 pb-2 text-xs text-danger" role="alert">{{ connectionError }}</p>
    <div class="flex shrink-0 items-center gap-1 px-3 pb-3">
      <Button variant="secondary" size="icon" :aria-label="microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'" :aria-pressed="microphoneEnabled" @click="toggleMicrophone">
        <Mic v-if="microphoneEnabled" class="size-4" />
        <MicOff v-else class="size-4" />
      </Button>
      <Button variant="secondary" size="icon" :aria-label="cameraEnabled ? 'Turn camera off' : 'Turn camera on'" :aria-pressed="cameraEnabled" @click="toggleCamera">
        <Video v-if="cameraEnabled" class="size-4" />
        <VideoOff v-else class="size-4" />
      </Button>
      <Button variant="secondary" size="icon" :aria-label="screenStream ? 'Stop sharing your screen' : 'Share your screen'" :aria-pressed="Boolean(screenStream)" @click="onShare">
        <Monitor class="size-4" />
      </Button>
      <Button v-if="inCall" variant="secondary" size="sm" @click="onLeaveCall">
        <PhoneOff class="size-3.5" />
        Leave call
      </Button>
      <Button v-else variant="secondary" size="sm" @click="onStartCall">Start call</Button>
    </div>
  </section>
</template>
