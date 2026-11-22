export const PARTICIPANT_COLORS = [
  '#e8a54b',
  '#7dd3c7',
  '#f0a3c2',
  '#9db0ff',
  '#d4e07a',
  '#f2b48a',
  '#c4b5fd',
  '#86efac',
] as const

export type ParticipantColor = (typeof PARTICIPANT_COLORS)[number]

export function colorForParticipant(participantId: string): ParticipantColor {
  let hash = 0
  for (let index = 0; index < participantId.length; index += 1) {
    hash = (hash * 31 + participantId.charCodeAt(index)) >>> 0
  }
  return PARTICIPANT_COLORS[hash % PARTICIPANT_COLORS.length] ?? PARTICIPANT_COLORS[0]
}

export function isParticipantColor(value: string): value is ParticipantColor {
  return (PARTICIPANT_COLORS as readonly string[]).includes(value)
}
