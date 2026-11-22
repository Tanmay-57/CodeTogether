import { DEFAULT_LIMITS, type Limits } from '@codetogether/shared'

export interface AppConfig {
  port: number
  nodeEnv: string
  clientOrigin: string
  logLevel: string
  limits: Limits
  stunUrls: string[]
  turnUrls: string[]
  turnUsername?: string
  turnCredential?: string
}

export interface ConfigEnv {
  PORT?: string
  NODE_ENV?: string
  CLIENT_ORIGIN?: string
  LOG_LEVEL?: string
  ROOM_TTL_MS?: string
  ROOM_HARD_CAP_MS?: string
  EMPTY_ROOM_GRACE_MS?: string
  RECONNECT_GRACE_MS?: string
  MAX_PARTICIPANTS?: string
  MAX_DOC_BYTES?: string
  MAX_SIGNAL_BYTES?: string
  CREATE_ROOM_PER_MINUTE?: string
  SIGNALS_PER_SECOND?: string
  RUN_TIMEOUT_MS?: string
  MAX_RUN_OUTPUT_BYTES?: string
  RUNS_PER_MINUTE?: string
  STUN_URLS?: string
  TURN_URLS?: string
  TURN_USERNAME?: string
  TURN_CREDENTIAL?: string
}

function integer(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return value
}

function list(raw: string | undefined, fallback: string[]): string[] {
  if (raw === undefined) return fallback
  return raw.split(',').map((item) => item.trim()).filter(Boolean)
}

export function loadConfig(env: ConfigEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || 'development'
  return {
    port: integer('PORT', env.PORT, 3001),
    nodeEnv,
    clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
    logLevel: env.LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug'),
    stunUrls: list(env.STUN_URLS, ['stun:stun.l.google.com:19302']),
    turnUrls: list(env.TURN_URLS, []),
    turnUsername: env.TURN_USERNAME || undefined,
    turnCredential: env.TURN_CREDENTIAL || undefined,
    limits: {
      maxParticipants: integer('MAX_PARTICIPANTS', env.MAX_PARTICIPANTS, DEFAULT_LIMITS.maxParticipants),
      roomTtlMs: integer('ROOM_TTL_MS', env.ROOM_TTL_MS, DEFAULT_LIMITS.roomTtlMs),
      roomHardCapMs: integer('ROOM_HARD_CAP_MS', env.ROOM_HARD_CAP_MS, DEFAULT_LIMITS.roomHardCapMs),
      emptyRoomGraceMs: integer('EMPTY_ROOM_GRACE_MS', env.EMPTY_ROOM_GRACE_MS, DEFAULT_LIMITS.emptyRoomGraceMs),
      reconnectGraceMs: integer('RECONNECT_GRACE_MS', env.RECONNECT_GRACE_MS, DEFAULT_LIMITS.reconnectGraceMs),
      maxDocBytes: integer('MAX_DOC_BYTES', env.MAX_DOC_BYTES, DEFAULT_LIMITS.maxDocBytes),
      maxSignalBytes: integer('MAX_SIGNAL_BYTES', env.MAX_SIGNAL_BYTES, DEFAULT_LIMITS.maxSignalBytes),
      displayNameMax: DEFAULT_LIMITS.displayNameMax,
      roomIdLength: DEFAULT_LIMITS.roomIdLength,
      createRoomPerMinute: integer('CREATE_ROOM_PER_MINUTE', env.CREATE_ROOM_PER_MINUTE, DEFAULT_LIMITS.createRoomPerMinute),
      signalsPerSecond: integer('SIGNALS_PER_SECOND', env.SIGNALS_PER_SECOND, DEFAULT_LIMITS.signalsPerSecond),
      runTimeoutMs: integer('RUN_TIMEOUT_MS', env.RUN_TIMEOUT_MS, DEFAULT_LIMITS.runTimeoutMs),
      maxRunOutputBytes: integer('MAX_RUN_OUTPUT_BYTES', env.MAX_RUN_OUTPUT_BYTES, DEFAULT_LIMITS.maxRunOutputBytes),
      runsPerMinute: integer('RUNS_PER_MINUTE', env.RUNS_PER_MINUTE, DEFAULT_LIMITS.runsPerMinute),
    },
  }
}

export function corsOrigin(config: AppConfig): string | string[] {
  if (config.nodeEnv === 'production') return config.clientOrigin
  return Array.from(new Set([
    config.clientOrigin,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]))
}

export function iceServersFor(config: AppConfig) {
  const servers: Array<{ urls: string[]; username?: string; credential?: string }> = []
  if (config.stunUrls.length > 0) servers.push({ urls: config.stunUrls })
  if (config.turnUrls.length > 0 && config.turnUsername && config.turnCredential) {
    servers.push({
      urls: config.turnUrls,
      username: config.turnUsername,
      credential: config.turnCredential,
    })
  }
  return servers
}
