<script setup lang="ts">
import { GitMerge, MousePointer2, UserRound, Video } from 'lucide-vue-next'
import { displayNameSchema, roomIdSchema } from '@codetogether/shared'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppWordmark from '@/components/AppWordmark.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import Button from '@/components/ui/button.vue'
import { useRoom } from '@/composables/useRoom'
import { writeSession } from '@/lib/session'

const route = useRoute()
const router = useRouter()
const { createRoom } = useRoom()
const displayName = ref('')
const lockWord = ref('')
const roomCode = ref('')
const nameError = ref('')
const codeError = ref('')
const formError = ref(typeof route.query.error === 'string' ? route.query.error : '')
const pending = ref(false)
const page = ref<HTMLElement | null>(null)
const LOCAL_LINE = 'function review(change) {'
const RETURN_LINE = "return change.intent === 'ship'"
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const followPointer = ref(!reduceMotion)
const localCount = ref(reduceMotion ? LOCAL_LINE.length : 0)
const linCount = ref(reduceMotion ? RETURN_LINE.length : 0)
const phase = ref<'local' | 'lin' | 'hold' | 'done'>(reduceMotion ? 'done' : 'local')
let loopTimer = 0
let loopRunning = true

const localKeyword = computed(() => LOCAL_LINE.slice(0, Math.min(8, localCount.value)))
const localRest = computed(() => (localCount.value > 8 ? LOCAL_LINE.slice(8, localCount.value) : ''))
const linKeyword = computed(() => RETURN_LINE.slice(0, Math.min(6, linCount.value)))
const linRest = computed(() => (linCount.value > 6 ? RETURN_LINE.slice(6, linCount.value) : ''))
const showClose = computed(() => linCount.value === RETURN_LINE.length)
const showAda = computed(() => phase.value === 'local' || phase.value === 'hold' || phase.value === 'done')
const showLin = computed(() => phase.value === 'lin' || phase.value === 'hold' || phase.value === 'done')

function queue(delay: number, next: () => void) {
  loopTimer = window.setTimeout(next, delay)
}

function typePreview() {
  if (!loopRunning) return
  if (phase.value === 'local') {
    if (localCount.value < LOCAL_LINE.length) {
      localCount.value += 1
      queue(42, typePreview)
      return
    }
    phase.value = 'lin'
    queue(360, typePreview)
    return
  }
  if (phase.value === 'lin') {
    if (linCount.value < RETURN_LINE.length) {
      linCount.value += 1
      queue(36, typePreview)
      return
    }
    phase.value = 'hold'
    queue(1600, () => {
      localCount.value = 0
      linCount.value = 0
      phase.value = 'local'
      typePreview()
    })
  }
}

onMounted(() => {
  followPointer.value = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (followPointer.value) typePreview()
})

onBeforeUnmount(() => {
  loopRunning = false
  window.clearTimeout(loopTimer)
})

function onPointerMove(event: PointerEvent) {
  if (!followPointer.value || !page.value) return
  const bounds = page.value.getBoundingClientRect()
  const x = (event.clientX - bounds.left) / bounds.width
  const y = (event.clientY - bounds.top) / bounds.height
  page.value.style.setProperty('--mx', ((x * 2) - 1).toFixed(3))
  page.value.style.setProperty('--my', ((y * 2) - 1).toFixed(3))
}

const features = [
  { icon: MousePointer2, title: 'Shared cursors', copy: 'See where everyone is editing without asking them to scroll.' },
  { icon: GitMerge, title: 'Conflict-free editing', copy: 'Concurrent edits merge instead of one person overwriting another.' },
  { icon: Video, title: 'Optional audio and video', copy: 'Talk in the same room. Media stays off until you turn it on.' },
  { icon: UserRound, title: 'No account', copy: 'A display name is enough. Source code is not stored after the room ends.' },
]

function validateName(): boolean {
  const parsed = displayNameSchema.safeParse(displayName.value)
  nameError.value = parsed.success ? '' : 'Enter a display name using 1–32 characters.'
  return parsed.success
}

async function onCreate() {
  formError.value = ''
  codeError.value = ''
  if (!validateName() || pending.value) return
  pending.value = true
  try {
    const lock = lockWord.value.trim()
    const result = await createRoom(displayName.value.trim(), lock || undefined)
    if (!result.ok) {
      formError.value = result.message
      return
    }
    await router.push(`/room/${result.roomId}`)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Could not connect to the server.'
  } finally {
    pending.value = false
  }
}

async function onJoin() {
  formError.value = ''
  const nameOk = validateName()
  const code = roomIdSchema.safeParse(roomCode.value.trim())
  codeError.value = code.success ? '' : 'Enter a valid room code.'
  if (!nameOk || !code.success || pending.value) return
  writeSession({
    roomId: code.data,
    displayName: displayName.value.trim(),
    enteredWorkspace: false,
  })
  await router.push(`/room/${code.data}`)
}
</script>

<template>
  <div ref="page" class="landing relative min-h-dvh overflow-hidden" @pointermove="onPointerMove">
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div class="landing-grid absolute -inset-16" />
      <div class="landing-shape landing-shape-a absolute top-16 -left-16 size-72 rounded-full" />
      <div class="landing-shape landing-shape-b absolute top-1/3 -right-20 size-96 rounded-full" />
      <div class="landing-shape landing-shape-c absolute bottom-10 left-1/3 size-64 rounded-full" />
    </div>
    <div class="relative">
    <a href="#create" class="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10 focus:bg-card focus:px-3 focus:py-2">Skip to create a room</a>
    <header class="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
      <AppWordmark />
      <ThemeToggle />
    </header>
    <main class="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:py-16">
      <div>
        <p class="text-sm text-primary">No account required</p>
        <h1 class="mt-3 max-w-xl text-4xl font-medium tracking-tight text-balance sm:text-5xl">Code together. Think together.</h1>
        <p class="mt-4 max-w-xl text-base text-muted-foreground">
          A shared editor for small groups. Create a room, send the link, and write in the same document while you talk.
        </p>
        <form id="create" class="mt-8 max-w-md space-y-3" @submit.prevent="onCreate">
          <div>
            <label class="mb-1.5 block text-sm" for="display-name">Display name</label>
            <input
              id="display-name"
              v-model="displayName"
              data-testid="display-name"
              class="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              maxlength="32"
              autocomplete="nickname"
              placeholder="Ada"
            />
            <p v-if="nameError" class="mt-1.5 text-sm text-danger" role="alert">{{ nameError }}</p>
          </div>
          <div>
            <label class="mb-1.5 block text-sm" for="room-lock">Lock word</label>
            <input
              id="room-lock"
              v-model="lockWord"
              data-testid="room-lock"
              class="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              maxlength="32"
              autocomplete="off"
              placeholder="Optional. The link will not include it."
            />
          </div>
          <Button type="submit" data-testid="create-room" :disabled="pending">{{ pending ? 'Creating…' : 'Create room' }}</Button>
          <p v-if="formError" class="text-sm text-danger" role="alert">{{ formError }}</p>
        </form>
        <form class="mt-6 flex max-w-md flex-col gap-2 sm:flex-row" @submit.prevent="onJoin">
          <div class="flex-1">
            <label class="sr-only" for="room-code">Room code</label>
            <input
              id="room-code"
              v-model="roomCode"
              data-testid="room-code"
              class="h-10 w-full rounded-md border border-border bg-card px-3 font-mono text-sm"
              maxlength="12"
              placeholder="Room code"
              autocapitalize="off"
              spellcheck="false"
            />
          </div>
          <Button variant="secondary" type="submit" data-testid="join-room">Join room</Button>
        </form>
        <p v-if="codeError" class="mt-2 text-sm text-danger" role="alert">{{ codeError }}</p>
      </div>
      <aside class="landing-preview overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_60px_rgb(0_0_0/0.18)]" data-testid="landing-preview" aria-label="Workspace preview">
        <div class="flex h-9 items-center gap-2 border-b border-border px-3">
          <span class="size-2 rounded-full bg-primary" aria-hidden="true" />
          <span class="font-mono text-[11px] text-muted-foreground">Ada</span>
          <span class="size-2 rounded-full bg-[#7dd3c7]" aria-hidden="true" />
          <span class="font-mono text-[11px] text-muted-foreground">Lin</span>
          <span class="ml-auto font-mono text-[11px] text-muted-foreground">room / preview</span>
        </div>
        <pre class="overflow-auto p-4 font-mono text-[13px] leading-6 text-foreground"><span class="text-muted-foreground">1</span>  <span class="text-primary">{{ localKeyword }}</span>{{ localRest }}<span v-if="phase === 'local'" class="landing-caret" aria-hidden="true" /><span v-if="showAda && localCount > 0" class="landing-name">Ada</span>
<span class="text-muted-foreground">2</span>    <span class="text-primary">{{ linKeyword }}</span>{{ linRest }}<span v-if="phase === 'lin'" class="landing-caret landing-caret-lin" aria-hidden="true" /><span v-if="showLin && linCount > 0" class="landing-name landing-name-lin">Lin</span>
<span v-if="showClose" class="text-muted-foreground">3</span><span v-if="showClose">  }</span></pre>
        <p class="border-t border-border px-4 py-3 text-xs text-muted-foreground">{{ phase === 'lin' ? 'Lin is typing' : 'A preview of the editor. Live cursors appear after you join a room.' }}</p>
      </aside>
    </main>
    <section class="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
      <article>
        <p class="font-mono text-xs text-primary">01</p>
        <h2 class="mt-2 text-base font-medium">Create</h2>
        <p class="mt-1 text-sm text-muted-foreground">Start a room and choose the name people will see.</p>
      </article>
      <article>
        <p class="font-mono text-xs text-primary">02</p>
        <h2 class="mt-2 text-base font-medium">Share the link</h2>
        <p class="mt-1 text-sm text-muted-foreground">The link contains the room code only. A lock word, if you set one, stays out of the link.</p>
      </article>
      <article>
        <p class="font-mono text-xs text-primary">03</p>
        <h2 class="mt-2 text-base font-medium">Edit and talk</h2>
        <p class="mt-1 text-sm text-muted-foreground">Write in one document. Turn on audio or video if you want them.</p>
      </article>
    </section>
    <section class="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2">
      <article v-for="feature in features" :key="feature.title" class="landing-feature rounded-lg border border-border p-4">
        <component :is="feature.icon" class="size-4 text-primary" aria-hidden="true" />
        <h2 class="mt-3 text-sm font-medium">{{ feature.title }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ feature.copy }}</p>
      </article>
    </section>
    </div>
  </div>
</template>

<style scoped>
.landing-grid {
  --landing-line: rgb(154 91 36 / 45%);
  background-image:
    linear-gradient(to right, var(--landing-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--landing-line) 1px, transparent 1px);
  background-size: 48px 48px;
  transform: translate3d(calc(var(--mx, 0) * 16px), calc(var(--my, 0) * 12px), 0);
}

:global(.dark) .landing-grid {
  --landing-line: rgb(232 165 75 / 8%);
}

.landing-shape {
  background: radial-gradient(circle, rgb(232 165 75 / 18%), transparent 68%);
  filter: blur(8px);
}

.landing-shape-a {
  transform: translate3d(calc(var(--mx, 0) * 36px), calc(var(--my, 0) * 22px), 0);
}

.landing-shape-b {
  transform: translate3d(calc(var(--mx, 0) * -28px), calc(var(--my, 0) * 18px), 0);
}

.landing-shape-c {
  transform: translate3d(calc(var(--mx, 0) * 20px), calc(var(--my, 0) * -26px), 0);
}

.landing-preview {
  transform: perspective(900px) rotateX(calc(var(--my, 0) * -3deg)) rotateY(calc(var(--mx, 0) * 4deg));
  transform-origin: center;
  transition: transform 180ms ease-out;
}

.landing-feature {
  transition: transform 180ms ease, border-color 180ms ease;
}

.landing-feature:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
}

.landing-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 1px;
  background: #e8a54b;
  vertical-align: text-bottom;
  animation: landing-blink 1s steps(1) infinite;
}

.landing-caret-lin {
  background: #7dd3c7;
}

.landing-name {
  margin-left: 6px;
  border-radius: 4px;
  background: #e8a54b;
  padding: 0 4px;
  color: #1c1408;
  font-size: 10px;
  line-height: 1.4;
  vertical-align: text-bottom;
}

.landing-name-lin {
  background: #7dd3c7;
}

@keyframes landing-blink {
  50% {
    opacity: 0;
  }
}
</style>
