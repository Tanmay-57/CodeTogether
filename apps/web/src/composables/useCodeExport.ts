import { fileNameFor } from '@codetogether/shared'
import { toast } from 'vue-sonner'

export function useCodeExport(getText: () => string, getLanguage: () => string, getRoomId: () => string, getFileName: () => string = () => '') {
  async function copyCode() {
    const text = getText()
    if (!navigator.clipboard?.writeText) {
      toast.error('Clipboard is unavailable in this browser.')
      return false
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Code copied.')
      return true
    } catch {
      toast.error('Clipboard is unavailable in this browser.')
      return false
    }
  }

  function downloadCode() {
    try {
      const text = getText()
      const named = getFileName().replace(/[\\/]/g, '').replace(/^\.+/, '').slice(0, 80)
      const fileName = named || fileNameFor(getLanguage(), getRoomId()).fileName
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(`Downloaded ${fileName}.`)
      return true
    } catch {
      toast.error('The download failed.')
      return false
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/room/${getRoomId()}`
    if (!navigator.clipboard?.writeText) {
      toast.error('Clipboard is unavailable in this browser.')
      return false
    }
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Invitation link copied.')
      return true
    } catch {
      toast.error('Clipboard is unavailable in this browser.')
      return false
    }
  }

  return { copyCode, downloadCode, copyLink }
}
