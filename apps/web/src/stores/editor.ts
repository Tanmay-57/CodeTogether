import { DEFAULT_LANGUAGE_ID } from '@codetogether/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AppTheme = 'dark' | 'light'
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'disconnected'

const THEME_KEY = 'codetogether.theme'
const FONT_KEY = 'codetogether.fontSize'

function readTheme(): AppTheme {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

function readFontSize(): number {
  const value = Number(localStorage.getItem(FONT_KEY))
  if (!Number.isFinite(value)) return 14
  return Math.min(22, Math.max(12, value))
}

export const useEditorStore = defineStore('editor', () => {
  const theme = ref<AppTheme>(readTheme())
  const fontSize = ref(readFontSize())
  const language = ref(DEFAULT_LANGUAGE_ID)
  const syncStatus = ref<SyncStatus>('idle')

  function applyTheme(next: AppTheme) {
    theme.value = next
    localStorage.setItem(THEME_KEY, next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  function setFontSize(next: number) {
    const value = Math.min(22, Math.max(12, next))
    fontSize.value = value
    localStorage.setItem(FONT_KEY, String(value))
  }

  function setLanguage(next: string) {
    language.value = next
  }

  function setSyncStatus(next: SyncStatus) {
    syncStatus.value = next
  }

  return { theme, fontSize, language, syncStatus, applyTheme, setFontSize, setLanguage, setSyncStatus }
})
