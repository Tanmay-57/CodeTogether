import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { useEditorStore } from './stores/editor'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './app.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
useEditorStore().applyTheme(useEditorStore().theme)
app.mount('#app')
