<script setup lang="ts">
import { Mic, MicOff, Video, VideoOff } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, ref, watch } from 'vue'
import Button from '@/components/ui/button.vue'
import { useLocalMedia } from '@/composables/useLocalMedia'
import { useMediaStore } from '@/stores/media'

const props = defineProps<{
  roomId: string
  modelName: string
  modelLock: string
  pending: boolean
  error: string
}>()
const emit = defineEmits<{
  'update:modelName': [value: string]
  'update:modelLock': [value: string]
  join: []
}>()

const media = useMediaStore()
const { cameraEnabled, microphoneEnabled, permissionError } = storeToRefs(media)
const { stream, setCamera, setMicrophone, stopAll } = useLocalMedia()
const preview = ref<HTMLVideoElement | null>(null)

watch(stream, (value) => {
  if (!preview.value) return
  preview.value.srcObject = value
  if (value) void preview.value.play().catch(() => undefined)
})

onBeforeUnmount(() => {
  if (!props.pending) return
})

defineExpose({ stopAll })
</script>

<template>
  <section class="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10 md:grid-cols-[minmax(0,1fr)_18rem]">
    <div>
      <p class="text-xs tracking-[0.14em] text-muted-foreground uppercase">Pre-join</p>
      <h1 class="mt-2 text-2xl font-medium tracking-tight">Check your name and devices</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Nothing is sent to the room until you join. You can enter with the camera and microphone off.
      </p>
      <form class="mt-6 space-y-4" @submit.prevent="emit('join')">
        <div>
          <label class="mb-1.5 block text-sm" for="prejoin-name">Display name</label>
          <input
            id="prejoin-name"
            data-testid="prejoin-name"
            class="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
            maxlength="32"
            :value="modelName"
            autocomplete="nickname"
            @input="emit('update:modelName', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-sm" for="prejoin-lock">Lock word</label>
          <input
            id="prejoin-lock"
            data-testid="prejoin-lock"
            class="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
            maxlength="32"
            autocomplete="off"
            placeholder="Only if this room has one"
            :value="modelLock"
            @input="emit('update:modelLock', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <p class="font-mono text-xs text-muted-foreground">Room {{ roomId }}</p>
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
        <div class="flex flex-wrap gap-2">
          <Button type="submit" data-testid="prejoin-join" :disabled="pending">
            {{ pending ? 'Joining…' : 'Join room' }}
          </Button>
          <Button variant="secondary" type="button" :aria-pressed="cameraEnabled" @click="setCamera(!cameraEnabled)">
            <Video v-if="cameraEnabled" class="size-4" />
            <VideoOff v-else class="size-4" />
            Camera
          </Button>
          <Button variant="secondary" type="button" :aria-pressed="microphoneEnabled" @click="setMicrophone(!microphoneEnabled)">
            <Mic v-if="microphoneEnabled" class="size-4" />
            <MicOff v-else class="size-4" />
            Microphone
          </Button>
        </div>
      </form>
    </div>
    <div>
      <div class="relative aspect-video overflow-hidden rounded-lg border border-border bg-card">
        <video ref="preview" class="h-full w-full -scale-x-100 object-cover" autoplay playsinline muted />
        <p v-if="!cameraEnabled" class="absolute inset-0 grid place-items-center px-4 text-center text-sm text-muted-foreground">
          Camera preview is off
        </p>
      </div>
      <p v-if="permissionError" class="mt-3 text-sm text-danger" role="alert">{{ permissionError }}</p>
    </div>
  </section>
</template>
