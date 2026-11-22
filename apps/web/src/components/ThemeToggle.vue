<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import Button from '@/components/ui/button.vue'
import { useEditorStore } from '@/stores/editor'

const editor = useEditorStore()
const { theme } = storeToRefs(editor)

function toggle() {
  editor.applyTheme(theme.value === 'dark' ? 'light' : 'dark')
}
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
    @click="toggle"
  >
    <Sun v-if="theme === 'dark'" class="size-4" />
    <Moon v-else class="size-4" />
  </Button>
</template>
