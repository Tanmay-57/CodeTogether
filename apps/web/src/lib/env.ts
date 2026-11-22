export const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:3001'
export const yjsUrl = import.meta.env.VITE_YJS_URL || 'ws://127.0.0.1:3001/yjs'

if (import.meta.env.PROD && !import.meta.env.VITE_SERVER_URL) {
  console.error('VITE_SERVER_URL is required for a production build.')
}
