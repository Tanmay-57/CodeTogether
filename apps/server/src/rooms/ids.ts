import { randomBytes, randomUUID } from 'node:crypto'

export function createRoomId(random: (size: number) => Buffer = randomBytes): string {
  return random(9).toString('base64url')
}

export function createTicket(random: (size: number) => Buffer = randomBytes): string {
  return random(32).toString('base64url')
}

export function createParticipantId(): string {
  return randomUUID()
}
