import { CODE_TEXT_KEY, DEFAULT_LANGUAGE_ID, FILES_MAP_KEY, LANGUAGE_META_KEY, META_MAP_KEY } from '@codetogether/shared'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'
import type { WebSocket } from 'ws'
import { logger } from '../logger'

const messageSync = 0
const messageAwareness = 1
const messageQueryAwareness = 3

interface DocumentEntry {
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  conns: Map<WebSocket, Set<number>>
}

/**
 * In-process Yjs document registry.
 * The sync and awareness framing matches the y-websocket protocol so the
 * official client can connect, while this process owns document lifetime.
 */
export class DocumentServer {
  private readonly docs = new Map<string, DocumentEntry>()

  constructor(
    private readonly maxDocBytes: number,
    private readonly onActivity: (roomId: string) => void,
  ) {}

  has(roomId: string): boolean {
    return this.docs.has(roomId)
  }

  connect(roomId: string, socket: WebSocket): void {
    const entry = this.getOrCreate(roomId)
    entry.conns.set(socket, new Set())
    socket.on('message', (data, isBinary) => {
      if (!isBinary) {
        socket.close(1003, 'binary only')
        return
      }
      const bytes = toBytes(data)
      if (bytes.byteLength > this.maxDocBytes) {
        socket.close(1009, 'update too large')
        return
      }
      this.onMessage(roomId, entry, socket, bytes)
    })
    socket.on('close', () => this.closeConnection(entry, socket))
    socket.on('error', () => this.closeConnection(entry, socket))

    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.writeSyncStep1(encoder, entry.doc)
    this.send(socket, encoding.toUint8Array(encoder))
    this.sendAwareness(entry, socket, [...entry.awareness.getStates().keys()])
  }

  destroy(roomId: string): void {
    const entry = this.docs.get(roomId)
    if (!entry) return
    for (const socket of entry.conns.keys()) {
      socket.close(1000, 'room closed')
    }
    entry.conns.clear()
    entry.awareness.destroy()
    entry.doc.destroy()
    this.docs.delete(roomId)
    logger.info({ roomId }, 'document destroyed')
  }

  destroyAll(): void {
    for (const roomId of [...this.docs.keys()]) this.destroy(roomId)
  }

  text(roomId: string): string | null {
    const entry = this.docs.get(roomId)
    if (!entry) return null
    return entry.doc.getText(CODE_TEXT_KEY).toString()
  }

  language(roomId: string): string | null {
    const entry = this.docs.get(roomId)
    if (!entry) return null
    const value = entry.doc.getMap(META_MAP_KEY).get(LANGUAGE_META_KEY)
    return typeof value === 'string' ? value : DEFAULT_LANGUAGE_ID
  }

  source(roomId: string, fileId?: string): { text: string; language: string } | null {
    const entry = this.docs.get(roomId)
    if (!entry) return null
    if (fileId) {
      const record = entry.doc.getMap(FILES_MAP_KEY).get(fileId) as { textKey?: unknown; language?: unknown } | undefined
      if (record && typeof record.textKey === 'string') {
        const language = typeof record.language === 'string' ? record.language : DEFAULT_LANGUAGE_ID
        return { text: entry.doc.getText(record.textKey).toString(), language }
      }
    }
    return {
      text: entry.doc.getText(CODE_TEXT_KEY).toString(),
      language: this.language(roomId) ?? DEFAULT_LANGUAGE_ID,
    }
  }

  private getOrCreate(roomId: string): DocumentEntry {
    const existing = this.docs.get(roomId)
    if (existing) return existing

    const doc = new Y.Doc()
    const awareness = new awarenessProtocol.Awareness(doc)
    awareness.setLocalState(null)
    const entry: DocumentEntry = { doc, awareness, conns: new Map() }

    doc.on('update', (update: Uint8Array, origin: unknown) => {
      this.onActivity(roomId)
      if (measuredLength(doc) > this.maxDocBytes && origin instanceof Object) {
        const socket = origin as WebSocket
        if (entry.conns.has(socket)) socket.close(1009, 'document too large')
      }
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageSync)
      syncProtocol.writeUpdate(encoder, update)
      const message = encoding.toUint8Array(encoder)
      for (const conn of entry.conns.keys()) {
        if (conn !== origin) this.send(conn, message)
      }
    })

    awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const controlled = origin instanceof Object ? entry.conns.get(origin as WebSocket) : undefined
      if (controlled) {
        for (const clientId of added) controlled.add(clientId)
        for (const clientId of removed) controlled.delete(clientId)
      }
      this.broadcastAwareness(entry, added.concat(updated, removed), origin)
    })

    const meta = doc.getMap(META_MAP_KEY)
    if (!meta.has(LANGUAGE_META_KEY)) meta.set(LANGUAGE_META_KEY, DEFAULT_LANGUAGE_ID)
    this.docs.set(roomId, entry)
    return entry
  }

  private onMessage(roomId: string, entry: DocumentEntry, socket: WebSocket, message: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(message)
      const messageType = decoding.readVarUint(decoder)
      switch (messageType) {
        case messageSync: {
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, messageSync)
          syncProtocol.readSyncMessage(decoder, encoder, entry.doc, socket)
          if (encoding.length(encoder) > 1) this.send(socket, encoding.toUint8Array(encoder))
          break
        }
        case messageAwareness:
          awarenessProtocol.applyAwarenessUpdate(entry.awareness, decoding.readVarUint8Array(decoder), socket)
          break
        case messageQueryAwareness:
          this.sendAwareness(entry, socket, [...entry.awareness.getStates().keys()])
          break
        default:
          break
      }
    } catch (error) {
      logger.warn({ err: error, roomId }, 'rejected collaboration message')
      socket.close(1003, 'malformed update')
    }
  }

  private closeConnection(entry: DocumentEntry, socket: WebSocket): void {
    const controlled = entry.conns.get(socket)
    if (!controlled) return
    entry.conns.delete(socket)
    awarenessProtocol.removeAwarenessStates(entry.awareness, [...controlled], null)
  }

  private broadcastAwareness(entry: DocumentEntry, clients: number[], origin: unknown): void {
    if (clients.length === 0) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageAwareness)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(entry.awareness, clients))
    const message = encoding.toUint8Array(encoder)
    for (const conn of entry.conns.keys()) {
      if (conn !== origin) this.send(conn, message)
    }
  }

  private sendAwareness(entry: DocumentEntry, socket: WebSocket, clients: number[]): void {
    if (clients.length === 0) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageAwareness)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(entry.awareness, clients))
    this.send(socket, encoding.toUint8Array(encoder))
  }

  private send(socket: WebSocket, message: Uint8Array): void {
    if (socket.readyState !== socket.OPEN) return
    socket.send(message)
  }
}

function measuredLength(doc: Y.Doc): number {
  let total = doc.getText(CODE_TEXT_KEY).length
  doc.getMap(FILES_MAP_KEY).forEach((value) => {
    if (!value || typeof value !== 'object') return
    const textKey = (value as { textKey?: unknown }).textKey
    if (typeof textKey !== 'string' || textKey === CODE_TEXT_KEY) return
    total += doc.getText(textKey).length
  })
  return total
}

function toBytes(data: WebSocket.RawData): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  return new Uint8Array(data)
}
