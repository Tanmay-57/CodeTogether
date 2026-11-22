export type RoomBusEvent =
  | { type: 'peer-joined'; participantId: string; resumed: boolean }
  | { type: 'peer-left'; participantId: string }
  | { type: 'self-resumed' }
  | { type: 'expired' }

type Listener = (event: RoomBusEvent) => void

const listeners = new Set<Listener>()

export function emitRoomEvent(event: RoomBusEvent): void {
  for (const listener of listeners) listener(event)
}

export function onRoomEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
