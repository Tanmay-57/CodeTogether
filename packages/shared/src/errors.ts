export const ERROR_CODES = {
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_EXPIRED: 'ROOM_EXPIRED',
  ROOM_FULL: 'ROOM_FULL',
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  RATE_LIMITED: 'RATE_LIMITED',
  RUN_IN_PROGRESS: 'RUN_IN_PROGRESS',
  NO_ACTIVE_RUN: 'NO_ACTIVE_RUN',
  ROOM_LOCKED: 'ROOM_LOCKED',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_PAYLOAD: 'Check the display name and try again.',
  ROOM_NOT_FOUND: 'That room does not exist.',
  ROOM_EXPIRED: 'This room has expired.',
  ROOM_FULL: 'This room is full.',
  NOT_A_MEMBER: 'You are not a member of this room.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
  RUN_IN_PROGRESS: 'A run is already in progress.',
  NO_ACTIVE_RUN: 'Nothing is running.',
  ROOM_LOCKED: 'This room needs the lock word.',
}
