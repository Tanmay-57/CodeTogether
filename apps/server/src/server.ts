import { createServer } from 'node:http'
import { ServerEvents } from '@codetogether/shared'
import { Server } from 'socket.io'
import { WebSocketServer } from 'ws'
import { RoomChat } from './chat/roomChat'
import { attachYjsUpgrade } from './collab/upgrade'
import { DocumentServer } from './collab/documentServer'
import { corsOrigin, loadConfig, type ConfigEnv } from './config'
import { createHttpApp } from './http/app'
import { logger } from './logger'
import { attachRealtime } from './realtime/handlers'
import { CodeRunner } from './run/codeRunner'
import { RoomService, type Clock } from './rooms/roomService'
import { createTimeoutScheduler, type TimerScheduler } from './rooms/scheduler'
import { RateLimiter } from './security/rateLimit'
import type { SocketData } from './types'

export interface ServerOverrides {
  env?: ConfigEnv
  clock?: Clock
  scheduler?: TimerScheduler
}

export function createCodeTogetherServer(overrides: ServerOverrides = {}) {
  const config = loadConfig(overrides.env ?? process.env)
  logger.level = config.logLevel
  const scheduler = overrides.scheduler ?? createTimeoutScheduler()
  const clock = overrides.clock ?? { now: () => Date.now() }
  const app = createHttpApp(config)
  const httpServer = createServer(app)
  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: corsOrigin(config) },
    destroyUpgrade: false,
    maxHttpBufferSize: config.limits.maxSignalBytes,
  })
  let rooms: RoomService
  let runner: CodeRunner
  const chat = new RoomChat()
  const documents = new DocumentServer(config.limits.maxDocBytes, (roomId) => rooms.touchActivity(roomId))
  rooms = new RoomService({
    clock,
    scheduler,
    limits: config.limits,
    onParticipantLeft(roomId, participantId) {
      io.to(roomId).emit(ServerEvents.ParticipantLeft, { participantId })
    },
    onParticipantUpdated(roomId, participant) {
      io.to(roomId).emit(ServerEvents.PresenceUpdated, {
        participantId: participant.id,
        camera: participant.camera,
        microphone: participant.microphone,
        connection: participant.connection,
      })
    },
    onRoomEnded(roomId, reason) {
      runner.clear(roomId)
      chat.clear(roomId)
      if (reason === 'expired') io.to(roomId).emit(ServerEvents.RoomExpired, { roomId })
      documents.destroy(roomId)
      io.in(roomId).disconnectSockets(true)
    },
  })
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.limits.maxDocBytes })
  runner = new CodeRunner(
    { timeoutMs: config.limits.runTimeoutMs, maxOutputBytes: config.limits.maxRunOutputBytes },
    (roomId, event, payload) => {
      io.to(roomId).emit(event, payload)
    },
  )
  attachRealtime({
    io,
    rooms,
    documents,
    runner,
    chat,
    config,
    createLimiter: new RateLimiter(config.limits.createRoomPerMinute, 60_000, clock),
    signalLimiter: new RateLimiter(config.limits.signalsPerSecond, 1_000, clock),
    runLimiter: new RateLimiter(config.limits.runsPerMinute, 60_000, clock),
    chatLimiter: new RateLimiter(20, 10_000, clock),
  })
  attachYjsUpgrade({ httpServer, wss, rooms, documents, config })

  return {
    config,
    httpServer,
    io,
    rooms,
    documents,
    async close() {
      runner.stopAll()
      documents.destroyAll()
      scheduler.clearAll()
      io.disconnectSockets(true)
      await new Promise<void>((resolve) => io.close(() => resolve()))
      wss.close()
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()))
        })
      }
    },
  }
}

