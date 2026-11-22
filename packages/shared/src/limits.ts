export const DEFAULT_LIMITS = {
  maxParticipants: 4,
  roomTtlMs: 4 * 60 * 60 * 1000,
  roomHardCapMs: 12 * 60 * 60 * 1000,
  emptyRoomGraceMs: 2 * 60 * 1000,
  reconnectGraceMs: 20 * 1000,
  maxDocBytes: 512 * 1024,
  maxSignalBytes: 64 * 1024,
  displayNameMax: 32,
  roomIdLength: 12,
  createRoomPerMinute: 10,
  signalsPerSecond: 30,
  runTimeoutMs: 10_000,
  maxRunOutputBytes: 64 * 1024,
  runsPerMinute: 6,
} as const

export type Limits = {
  maxParticipants: number
  roomTtlMs: number
  roomHardCapMs: number
  emptyRoomGraceMs: number
  reconnectGraceMs: number
  maxDocBytes: number
  maxSignalBytes: number
  displayNameMax: number
  roomIdLength: number
  createRoomPerMinute: number
  signalsPerSecond: number
  runTimeoutMs: number
  maxRunOutputBytes: number
  runsPerMinute: number
}

export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/
