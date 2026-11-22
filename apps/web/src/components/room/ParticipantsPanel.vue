<script setup lang="ts">
import { Mic, MicOff, Video, VideoOff } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { openFiles } from '@/lib/filePresence'
import { typingIds } from '@/lib/typing'
import { useRoomStore } from '@/stores/room'

const emit = defineEmits<{ jump: [participantId: string] }>()
const rooms = useRoomStore()
const { room } = storeToRefs(rooms)

function statusLabel(person: { id: string; connection: string }): string {
  if (typingIds[person.id]) return 'Typing'
  return person.connection === 'connected' ? 'Live' : 'Reconnecting'
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col" aria-label="Participants">
    <header class="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
      <h2 class="font-medium text-foreground">Participants</h2>
      <span>{{ room?.participants.length ?? 0 }}</span>
    </header>
    <ul class="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-2">
      <li v-for="person in room?.participants ?? []" :key="person.id" class="flex items-center gap-2 rounded-md px-2 py-1.5">
        <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: person.color }" aria-hidden="true" />
        <button
          type="button"
          class="min-w-0 flex-1 truncate text-left text-sm"
          :aria-label="`Jump to ${person.displayName}`"
          @click="emit('jump', person.id)"
        >
          {{ person.displayName }}
          <span v-if="openFiles[person.id]?.fileName" class="ml-1 text-[11px] text-muted-foreground">{{ openFiles[person.id].fileName }}</span>
        </button>
        <span class="text-[11px] text-muted-foreground">{{ statusLabel(person) }}</span>
        <Video v-if="person.camera" class="size-3.5 text-muted-foreground" aria-label="Camera on" />
        <VideoOff v-else class="size-3.5 text-muted-foreground" aria-label="Camera off" />
        <Mic v-if="person.microphone" class="size-3.5 text-muted-foreground" aria-label="Microphone on" />
        <MicOff v-else class="size-3.5 text-muted-foreground" aria-label="Microphone off" />
      </li>
    </ul>
  </section>
</template>
