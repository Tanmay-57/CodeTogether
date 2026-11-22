<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{ pointer: { x: number; y: number } | null }>()
const { theme } = storeToRefs(useEditorStore())
const canvas = ref<HTMLCanvasElement | null>(null)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const accents = ['#e8a54b', '#7dd3c7', '#f0a3c2']
let frame = 0
let observer: ResizeObserver | null = null

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  if (value.length !== 6) return `rgba(28, 25, 21, ${alpha})`
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function ink(): { line: string; side: string; fill: number } {
  const dark = document.documentElement.classList.contains('dark')
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()
  return {
    line: withAlpha(raw || (dark ? '#ece8e1' : '#1c1915'), dark ? 0.22 : 0.28),
    side: dark ? 'rgba(0, 0, 0, 0.38)' : 'rgba(28, 25, 21, 0.16)',
    fill: dark ? 0.38 : 0.42,
  }
}

function accentAt(col: number, row: number): string | null {
  const slot = Math.abs((col * 17 + row * 13) % 23)
  if (slot !== 0 && slot !== 11) return null
  return accents[Math.abs(col + row) % accents.length] ?? accents[0]
}

function traceDiamond(context: CanvasRenderingContext2D, cx: number, cy: number, halfW: number, halfH: number) {
  context.beginPath()
  context.moveTo(cx, cy - halfH)
  context.lineTo(cx + halfW, cy)
  context.lineTo(cx, cy + halfH)
  context.lineTo(cx - halfW, cy)
  context.closePath()
}

function paint() {
  const element = canvas.value
  if (!element) return
  const bounds = element.getBoundingClientRect()
  const scale = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.floor(bounds.width * scale))
  const height = Math.max(1, Math.floor(bounds.height * scale))
  if (element.width !== width || element.height !== height) {
    element.width = width
    element.height = height
  }
  const context = element.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, width, height)
  const colors = ink()
  const halfW = 28 * scale
  const halfH = 14 * scale
  const pointer = reduceMotion ? null : props.pointer
  const originX = pointer ? pointer.x * scale : -1
  const originY = pointer ? pointer.y * scale : -1
  const span = Math.ceil(width / halfW) + Math.ceil(height / halfH) + 2
  context.lineWidth = Math.max(1, scale)
  context.strokeStyle = colors.line

  for (let col = -span; col <= span; col += 1) {
    for (let row = -span; row <= span; row += 1) {
      const cx = (col - row) * halfW + width / 2
      const cy = (col + row) * halfH + height / 2
      if (cx < -halfW || cx > width + halfW || cy < -halfH || cy > height + halfH) continue
      const color = accentAt(col, row)
      const distance = pointer ? Math.hypot(cx - originX, cy - originY) : Number.POSITIVE_INFINITY
      const lift = distance < 120 * scale ? (1 - distance / (120 * scale)) * 10 * scale : 0
      if (color) {
        traceDiamond(context, cx, cy - lift, halfW, halfH)
        context.fillStyle = withAlpha(color, colors.fill)
        context.fill()
      }
      if (lift > 0.5) {
        context.beginPath()
        context.moveTo(cx - halfW, cy - lift)
        context.lineTo(cx, cy + halfH - lift)
        context.lineTo(cx, cy + halfH)
        context.lineTo(cx - halfW, cy)
        context.closePath()
        context.fillStyle = colors.side
        context.fill()
        context.beginPath()
        context.moveTo(cx, cy + halfH - lift)
        context.lineTo(cx + halfW, cy - lift)
        context.lineTo(cx + halfW, cy)
        context.lineTo(cx, cy + halfH)
        context.closePath()
        context.fill()
        traceDiamond(context, cx, cy - lift, halfW, halfH)
        if (color) {
          context.fillStyle = withAlpha(color, colors.fill)
          context.fill()
        }
      }
      traceDiamond(context, cx, cy - lift, halfW, halfH)
      context.stroke()
    }
  }
}

function schedule() {
  if (frame) return
  frame = window.requestAnimationFrame(() => {
    frame = 0
    paint()
  })
}

watch(() => props.pointer, () => {
  if (!reduceMotion) schedule()
})
watch(theme, () => schedule())

onMounted(() => {
  if (!canvas.value) return
  observer = new ResizeObserver(() => schedule())
  observer.observe(canvas.value)
  schedule()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame) window.cancelAnimationFrame(frame)
})
</script>

<template>
  <canvas ref="canvas" class="pointer-events-none h-full w-full" aria-hidden="true" />
</template>
