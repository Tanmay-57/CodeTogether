import { CODE_TEXT_KEY, YJS_PATH_PREFIX } from '@codetogether/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import WebSocket from 'ws'
import { connectClient, createRoom, joinRoom, leaveRoom, startTestServer } from './helpers'

const closers: Array<() => unknown> = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

function waitForSync(provider: WebsocketProvider): Promise<void> {
  if (provider.synced) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('document sync did not complete')), 4000)
    provider.on('sync', (synced: boolean) => {
      if (!synced) return
      clearTimeout(timer)
      resolve()
    })
  })
}

describe('collaboration documents', () => {
  it('rejects a websocket without a join ticket', async () => {
    const started = await startTestServer()
    closers.push(() => started.server.close())
    const ada = await connectClient(started.url)
    closers.push(async () => ada.close())
    const created = await createRoom(ada, 'Ada')
    if (!created.ok) throw new Error('create failed')
    const wsUrl = started.url.replace('http', 'ws')
    const socket = new WebSocket(`${wsUrl}${YJS_PATH_PREFIX}/${created.data.room.id}`)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('upgrade was not rejected')), 3000)
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      socket.once('unexpected-response', done)
      socket.once('error', done)
      socket.once('close', done)
    })
    socket.close()
  })

  it('syncs concurrent edits and destroys the document after the room is empty', async () => {
    const started = await startTestServer()
    closers.push(() => started.server.close())
    const adaSocket = await connectClient(started.url)
    const linSocket = await connectClient(started.url)
    closers.push(async () => {
      adaSocket.close()
      linSocket.close()
    })
    const created = await createRoom(adaSocket, 'Ada')
    if (!created.ok) throw new Error('create failed')
    const joined = await joinRoom(linSocket, created.data.room.id, 'Lin')
    if (!joined.ok) throw new Error('join failed')

    const wsUrl = `${started.url.replace('http', 'ws')}${YJS_PATH_PREFIX}`
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    const providerA = new WebsocketProvider(wsUrl, created.data.room.id, docA, {
      params: { ticket: created.data.ticket, participantId: created.data.participant.id },
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
      disableBc: true,
    })
    const providerB = new WebsocketProvider(wsUrl, created.data.room.id, docB, {
      params: { ticket: joined.data.ticket, participantId: joined.data.participant.id },
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
      disableBc: true,
    })
    closers.push(async () => {
      providerA.destroy()
      providerB.destroy()
      docA.destroy()
      docB.destroy()
    })

    await Promise.all([waitForSync(providerA), waitForSync(providerB)])
    const before = docA.getText(CODE_TEXT_KEY).toString()
    docA.getText(CODE_TEXT_KEY).insert(0, 'Alpha')
    docB.getText(CODE_TEXT_KEY).insert(0, 'Beta')
    await vi.waitFor(() => {
      expect(docA.getText(CODE_TEXT_KEY).toString()).toBe(docB.getText(CODE_TEXT_KEY).toString())
      expect(docA.getText(CODE_TEXT_KEY).toString()).toContain('Alpha')
      expect(docA.getText(CODE_TEXT_KEY).toString()).toContain('Beta')
    })
    expect(docA.getText(CODE_TEXT_KEY).toString()).not.toBe(before)

    await leaveRoom(adaSocket)
    await leaveRoom(linSocket)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(started.server.documents.has(created.data.room.id)).toBe(false)
    expect(started.server.documents.text(created.data.room.id)).toBeNull()
  })
})
