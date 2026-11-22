import { randomUUID } from 'node:crypto'
import { ServerEvents } from '@codetogether/shared'

export interface ChatMessage {
  id: string
  participantId: string
  displayName: string
  text: string
  sentAt: number
}

const MAX_MESSAGES = 80

export class RoomChat {
  private readonly messages = new Map<string, ChatMessage[]>()

  post(roomId: string, participantId: string, displayName: string, text: string): ChatMessage {
    const message: ChatMessage = {
      id: randomUUID(),
      participantId,
      displayName,
      text,
      sentAt: Date.now(),
    }
    const list = this.messages.get(roomId) ?? []
    list.push(message)
    if (list.length > MAX_MESSAGES) list.splice(0, list.length - MAX_MESSAGES)
    this.messages.set(roomId, list)
    return message
  }

  replay(socket: { emit: (event: string, payload: unknown) => void }, roomId: string): void {
    socket.emit(ServerEvents.ChatState, { messages: this.messages.get(roomId) ?? [] })
  }

  clear(roomId: string): void {
    this.messages.delete(roomId)
  }
}
