<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { Toaster } from 'vue-sonner'
import { useEditorStore } from '@/stores/editor'
import 'vue-sonner/style.css'

const editor = useEditorStore()
const { theme } = storeToRefs(editor)
</script>

<template>
  <RouterView />
  <Toaster :theme="theme === 'dark' ? 'dark' : 'light'" position="top-center" :duration="2800" />
</template>
