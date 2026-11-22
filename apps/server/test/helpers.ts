import { ClientEvents, type JoinAckData, type SimpleAck } from '@codetogether/shared'
import type { AddressInfo } from 'node:net'
import { io, type Socket } from 'socket.io-client'
import { createCodeTogetherServer, type ServerOverrides } from '../src/server'

export async function startTestServer(overrides: ServerOverrides = {}) {
  const { env: extraEnv, ...rest } = overrides
  const server = createCodeTogetherServer({
    ...rest,
    env: {
      CLIENT_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
      MAX_PARTICIPANTS: '2',
      ROOM_TTL_MS: '60000',
      ROOM_HARD_CAP_MS: '120000',
      EMPTY_ROOM_GRACE_MS: '200',
      RECONNECT_GRACE_MS: '1000',
      CREATE_ROOM_PER_MINUTE: '5',
      SIGNALS_PER_SECOND: '20',
      ...extraEnv,
    },
  })
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve))
  const address = server.httpServer.address() as AddressInfo
  const url = `http://127.0.0.1:${address.port}`
  return { server, url }
}

export async function connectClient(url: string): Promise<Socket> {
  const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 4000)
    socket.on('connect', () => {
      clearTimeout(timer)
      resolve()
    })
    socket.on('connect_error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
  return socket
}

export function emitAck<T>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 4000)
    const callback = (response: T) => {
      clearTimeout(timer)
      resolve(response)
    }
    if (payload === undefined) socket.emit(event, callback)
    else socket.emit(event, payload, callback)
  })
}

export async function createRoom(socket: Socket, displayName = 'Ada') {
  return emitAck<{ ok: true; data: JoinAckData } | { ok: false; code: string }>(socket, ClientEvents.RoomCreate, { displayName })
}

export async function joinRoom(socket: Socket, roomId: string, displayName: string, resumeParticipantId?: string) {
  return emitAck<{ ok: true; data: JoinAckData } | { ok: false; code: string }>(socket, ClientEvents.RoomJoin, {
    roomId,
    displayName,
    resumeParticipantId,
  })
}

export async function leaveRoom(socket: Socket) {
  return emitAck<SimpleAck>(socket, ClientEvents.RoomLeave, {})
}
