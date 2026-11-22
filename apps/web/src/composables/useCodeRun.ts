import { ClientEvents, ERROR_MESSAGES, type ErrorCode, simpleAckSchema } from '@codetogether/shared'
import { toast } from 'vue-sonner'
import { ensureConnected, getSocket } from '@/lib/socket'

function messageFor(code: string): string {
  return code in ERROR_MESSAGES ? ERROR_MESSAGES[code as ErrorCode] : 'Something went wrong. Try again.'
}

function request(event: string, payload: unknown = {}): Promise<{ ok: true } | { ok: false; code: string }> {
  const socket = getSocket()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('The server did not respond.')), 8000)
    socket.emit(event, payload, (response: unknown) => {
      window.clearTimeout(timer)
      const parsed = simpleAckSchema.safeParse(response)
      if (!parsed.success) {
        reject(new Error('The server sent an unexpected response.'))
        return
      }
      resolve(parsed.data)
    })
  })
}

export function useCodeRun() {
  async function run(fileId?: string) {
    try {
      await ensureConnected()
      const response = await request(ClientEvents.CodeRun, fileId ? { fileId } : {})
      if (!response.ok) toast.error(messageFor(response.code))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The run could not be started.')
    }
  }

  async function clearOutput() {
    try {
      await ensureConnected()
      const response = await request(ClientEvents.CodeClear)
      if (!response.ok) toast.error(messageFor(response.code))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The output could not be cleared.')
    }
  }

  async function sendInput(text: string) {
    try {
      await ensureConnected()
      const response = await request(ClientEvents.CodeInput, { text })
      if (!response.ok) toast.error(messageFor(response.code))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The input could not be sent.')
    }
  }

  async function stop() {
    try {
      await ensureConnected()
      const response = await request(ClientEvents.CodeStop)
      if (!response.ok) toast.error(messageFor(response.code))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The run could not be stopped.')
    }
  }

  return { run, stop, sendInput, clearOutput }
}
