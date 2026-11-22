import { ClientEvents, ERROR_CODES, ServerEvents, chatMessageSchema, codeClearedSchema, codeStartedSchema } from '@codetogether/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Socket } from 'socket.io-client'
import { connectClient, createRoom, emitAck, joinRoom, startTestServer } from './helpers'
import { CODE_TEXT_KEY, LANGUAGE_META_KEY, META_MAP_KEY, YJS_PATH_PREFIX } from '@codetogether/shared'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import WebSocket from 'ws'

const closers: Array<() => unknown> = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

async function seed(url: string, roomId: string, ticket: string, participantId: string, text: string, language?: string) {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(`${url.replace('http', 'ws')}${YJS_PATH_PREFIX}`, roomId, doc, {
    params: { ticket, participantId },
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    disableBc: true,
  })
  closers.push(async () => {
    provider.destroy()
    doc.destroy()
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('document sync did not complete')), 4000)
    provider.on('sync', (synced: boolean) => {
      if (!synced) return
      clearTimeout(timer)
      resolve()
    })
  })
  if (language) doc.getMap(META_MAP_KEY).set(LANGUAGE_META_KEY, language)
  doc.getText(CODE_TEXT_KEY).insert(0, text)
  return doc
}

function once(socket: Socket, event: string) {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 4000)
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

describe('room chat, clear output, and TypeScript', () => {
  it('delivers chat to members and rejects an outsider', async () => {
    const started = await startTestServer()
    closers.push(() => started.server.close())
    const ada = await connectClient(started.url)
    const lin = await connectClient(started.url)
    const outsider = await connectClient(started.url)
    closers.push(async () => {
      ada.close()
      lin.close()
      outsider.close()
    })
    const created = await createRoom(ada, 'Ada')
    if (!created.ok) throw new Error('create failed')
    const joined = await joinRoom(lin, created.data.room.id, 'Lin')
    if (!joined.ok) throw new Error('join failed')
    const incoming = once(lin, ServerEvents.ChatMessage)
    const sent = await emitAck<{ ok: boolean; code?: string }>(ada, ClientEvents.ChatSend, { text: 'hello' })
    expect(sent).toEqual({ ok: true })
    expect(chatMessageSchema.parse(await incoming).text).toBe('hello')
    const denied = await emitAck<{ ok: boolean; code?: string }>(outsider, ClientEvents.ChatSend, { text: 'nope' })
    expect(denied).toEqual({ ok: false, code: ERROR_CODES.NOT_A_MEMBER })
  })

  it('clears output without stopping a running program', async () => {
    const started = await startTestServer()
    closers.push(() => started.server.close())
    const ada = await connectClient(started.url)
    closers.push(() => ada.close())
    const created = await createRoom(ada, 'Ada')
    if (!created.ok) throw new Error('create failed')
    await seed(started.url, created.data.room.id, created.data.ticket, created.data.participant.id, 'setInterval(() => {}, 1000)')
    await vi.waitFor(() => {
      expect(started.server.documents.text(created.data.room.id)).toContain('setInterval')
    })
    const startedRun = once(ada, ServerEvents.CodeStarted)
    const run = await emitAck<{ ok: boolean }>(ada, ClientEvents.CodeRun, {})
    expect(run.ok).toBe(true)
    expect(codeStartedSchema.parse(await startedRun).language).toBe('javascript')
    const cleared = once(ada, ServerEvents.CodeCleared)
    expect(await emitAck(ada, ClientEvents.CodeClear, {})).toEqual({ ok: true })
    expect(codeClearedSchema.parse(await cleared)).toEqual({})
    expect(await emitAck(ada, ClientEvents.CodeRun, {})).toEqual({ ok: false, code: ERROR_CODES.RUN_IN_PROGRESS })
    expect(await emitAck(ada, ClientEvents.CodeStop, {})).toEqual({ ok: true })
  })

  it('runs TypeScript when Node can, and explains itself when Node cannot', async () => {
    const started = await startTestServer()
    closers.push(() => started.server.close())
    const ada = await connectClient(started.url)
    closers.push(() => ada.close())
    const created = await createRoom(ada, 'Ada')
    if (!created.ok) throw new Error('create failed')
    await seed(
      started.url,
      created.data.room.id,
      created.data.ticket,
      created.data.participant.id,
      'const value: number = 1\nconsole.log(value)\n',
      'typescript',
    )
    await vi.waitFor(() => {
      expect(started.server.documents.language(created.data.room.id)).toBe('typescript')
    })
    const system: string[] = []
    const stdout: string[] = []
    const finished = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('run did not finish')), 8000)
      ada.on(ServerEvents.CodeOutput, (payload: { stream?: string; text?: string }) => {
        if (payload.stream === 'system' && payload.text) system.push(payload.text)
        if (payload.stream === 'stdout' && payload.text) stdout.push(payload.text)
      })
      ada.on(ServerEvents.CodeFinished, () => {
        clearTimeout(timer)
        resolve()
      })
    })
    expect((await emitAck<{ ok: boolean }>(ada, ClientEvents.CodeRun, {})).ok).toBe(true)
    await finished
    const message = `${stdout.join('')}\n${system.join('')}`
    if (system.join('').includes('TypeScript')) expect(message).toContain("this server's Node")
    else expect(stdout.join('')).toContain('1')
  })
})
