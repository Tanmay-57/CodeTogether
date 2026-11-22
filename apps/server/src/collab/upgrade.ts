import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { YJS_PATH_PREFIX, roomIdSchema } from '@codetogether/shared'
import type { Server as HttpServer } from 'node:http'
import type { WebSocketServer } from 'ws'
import type { AppConfig } from '../config'
import { logger } from '../logger'
import type { RoomService } from '../rooms/roomService'
import type { DocumentServer } from './documentServer'

interface UpgradeDeps {
  httpServer: HttpServer
  wss: WebSocketServer
  rooms: RoomService
  documents: DocumentServer
  config: AppConfig
}

export function attachYjsUpgrade(deps: UpgradeDeps): void {
  deps.httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(`${YJS_PATH_PREFIX}/`)) return

    const roomId = decodeURIComponent(url.pathname.slice(YJS_PATH_PREFIX.length + 1))
    const ticket = url.searchParams.get('ticket') ?? ''
    const participantId = url.searchParams.get('participantId') ?? ''
    const origin = request.headers.origin
    if (deps.config.nodeEnv === 'production' && origin && origin !== deps.config.clientOrigin) {
      rejectUpgrade(socket, 403, 'origin rejected')
      return
    }
    if (!roomIdSchema.safeParse(roomId).success || !deps.rooms.authorizeTicket(roomId, participantId, ticket)) {
      rejectUpgrade(socket, 401, 'room access rejected')
      logger.info({ roomId }, 'rejected collaboration connection')
      return
    }

    deps.wss.handleUpgrade(request, socket, head, (ws) => {
      deps.documents.connect(roomId, ws)
    })
  })
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}
