import { reactive } from 'vue'

export interface OpenFile {
  fileId: string
  fileName: string
  color: string
}

export const openFiles = reactive<Record<string, OpenFile>>({})

export function replaceOpenFiles(next: Record<string, OpenFile>): void {
  for (const key of Object.keys(openFiles)) {
    if (!(key in next)) delete openFiles[key]
  }
  Object.assign(openFiles, next)
}

export function clearOpenFiles(): void {
  for (const key of Object.keys(openFiles)) delete openFiles[key]
}
