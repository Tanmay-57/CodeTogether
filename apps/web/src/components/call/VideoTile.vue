<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  stream: MediaStream | null
  name: string
  muted?: boolean
  mirror?: boolean
  jumpable?: boolean
}>()
const emit = defineEmits<{ jump: [] }>()

const video = ref<HTMLVideoElement | null>(null)
const liveVideo = ref(false)

function paint() {
  liveVideo.value = Boolean(props.stream?.getVideoTracks().some((track) => track.readyState === 'live'))
  const element = video.value
  if (!element) return
  element.srcObject = props.stream
  if (props.stream) void element.play().catch(() => undefined)
}

onMounted(paint)
watch(() => props.stream, (stream, _previous, onCleanup) => {
  paint()
  if (!stream) return
  const onChange = () => paint()
  stream.addEventListener('addtrack', onChange)
  stream.addEventListener('removetrack', onChange)
  for (const track of stream.getTracks()) track.addEventListener('ended', onChange)
  onCleanup(() => {
    stream.removeEventListener('addtrack', onChange)
    stream.removeEventListener('removetrack', onChange)
    for (const track of stream.getTracks()) track.removeEventListener('ended', onChange)
  })
}, { immediate: true })
</script>

<template>
  <figure class="relative aspect-video w-full self-start overflow-hidden rounded-md border border-border bg-black">
    <video
      ref="video"
      class="h-full w-full object-contain"
      :class="mirror ? '-scale-x-100' : ''"
      autoplay
      playsinline
      :muted="muted"
    />
    <figcaption v-if="!liveVideo" class="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
      Camera off
    </figcaption>
    <button
      v-if="jumpable"
      type="button"
      class="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-left text-[11px] text-white"
      @click="emit('jump')"
    >
      {{ name }}
    </button>
    <figcaption v-else class="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] text-white">
      {{ name }}
    </figcaption>
  </figure>
</template>
