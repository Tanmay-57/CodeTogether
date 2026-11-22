import { storeToRefs } from 'pinia'
import { useConnectionStore } from '@/stores/connection'
import { ensureConnected, getSocket } from '@/lib/socket'

export function useSocket() {
  const connection = useConnectionStore()
  const { status } = storeToRefs(connection)
  return {
    status,
    connect: ensureConnected,
    socket: getSocket,
  }
}
