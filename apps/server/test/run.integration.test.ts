import { CODE_TEXT_KEY, ClientEvents, ERROR_CODES, LANGUAGE_META_KEY, META_MAP_KEY, ServerEvents, YJS_PATH_PREFIX, codeFinishedSchema, codeOutputSchema } from '@codetogether/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import WebSocket from 'ws'
import type { Socket } from 'socket.io-client'
import { connectClient, createRoom, emitAck, joinRoom, startTestServer } from './helpers'

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

function collect(socket: Socket, timeoutMs = 4000) {
  const stdout: string[] = []
  const stdin: string[] = []
  const system: string[] = []
  const finished = new Promise<{ exitCode: number | null; timedOut: boolean }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('run did not finish')), timeoutMs)
    socket.on(ServerEvents.CodeOutput, (payload: unknown) => {
      const parsed = codeOutputSchema.safeParse(payload)
      if (!parsed.success) return
      if (parsed.data.stream === 'stdout') stdout.push(parsed.data.text)
      if (parsed.data.stream === 'stdin') stdin.push(parsed.data.text)
      if (parsed.data.stream === 'system') system.push(parsed.data.text)
    })
    socket.on(ServerEvents.CodeFinished, (payload: unknown) => {
      const parsed = codeFinishedSchema.safeParse(payload)
      if (!parsed.success) return
      clearTimeout(timer)
      resolve(parsed.data)
    })
  })
  return { stdout, stdin, system, finished }
}

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
  await waitForSync(provider)
  if (language) doc.getMap(META_MAP_KEY).set(LANGUAGE_META_KEY, language)
  doc.getText(CODE_TEXT_KEY).insert(0, text)
  return doc
}

describe('shared code runs', () => {
  it('shows JavaScript output to another member and refuses a non-member', async () => {
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
    await seed(started.url, created.data.room.id, created.data.ticket, created.data.participant.id, "console.log('hi')")
    await vi.waitFor(() => {
      expect(started.server.documents.text(created.data.room.id)).toContain("console.log('hi')")
    })

    const denied = await emitAck<{ ok: boolean; code?: string }>(outsider, ClientEvents.CodeRun, {})
    expect(denied).toEqual({ ok: false, code: ERROR_CODES.NOT_A_MEMBER })

    const seen = collect(lin)
    const ack = await emitAck<{ ok: boolean; code?: string }>(ada, ClientEvents.CodeRun, {})
    expect(ack.ok).toBe(true)
    const result = await seen.finished
    expect(result.timedOut).toBe(false)
    expect(seen.stdout.join('')).toContain('hi')
  })

  it('stops an infinite loop when asked and rejects a second run', async () => {
    const started = await startTestServer()
    closers.push(() => started.server.close())
    const ada = await connectClient(started.url)
    closers.push(async () => ada.close())
    const created = await createRoom(ada, 'Ada')
    if (!created.ok) throw new Error('create failed')
    await seed(started.url, created.data.room.id, created.data.ticket, created.data.participant.id, 'while (true) {}')
    await vi.waitFor(() => {
      expect(started.server.documents.text(created.data.room.id)).toContain('while (true)')
    })

    const seen = collect(ada)
    const first = await emitAck<{ ok: boolean; code?: string }>(ada, ClientEvents.CodeRun, {})
    expect(first.ok).toBe(true)
    const second = await emitAck<{ ok: boolean; code?: string }>(ada, ClientEvents.CodeRun, {})
    expect(second).toEqual({ ok: false, code: ERROR_CODES.RUN_IN_PROGRESS })
    const stopped = await emitAck<{ ok: boolean }>(ada, ClientEvents.CodeStop, {})
    expect(stopped.ok).toBe(true)
    const result = await seen.finished
    expect(result.timedOut).toBe(false)
    expect(seen.system.join('')).toContain('Run stopped.')
    expect(seen.system.join('')).not.toContain('time limit')
  })

  it('does not start a process for a language other than JavaScript or Python', async () => {
    const started = await startTestServer()
    closers.push(() => started.server.close())
    const ada = await connectClient(started.url)
    closers.push(async () => ada.close())
    const created = await createRoom(ada, 'Ada')
    if (!created.ok) throw new Error('create failed')
    await seed(started.url, created.data.room.id, created.data.ticket, created.data.participant.id, 'body {}', 'css')
    await vi.waitFor(() => {
      expect(started.server.documents.language(created.data.room.id)).toBe('css')
    })
    const seen = collect(ada)
    const ack = await emitAck<{ ok: boolean }>(ada, ClientEvents.CodeRun, {})
    expect(ack.ok).toBe(true)
    const result = await seen.finished
    expect(result.timedOut).toBe(false)
    expect(result.exitCode).toBeNull()
    expect(seen.system.join('')).toContain('JavaScript or Python')
  })

  it('reads a typed line and shows that line to the other member', async () => {
    const started = await startTestServer()
    closers.push(() => started.server.close())
    const ada = await connectClient(started.url)
    const lin = await connectClient(started.url)
    closers.push(async () => {
      ada.close()
      lin.close()
    })
    const created = await createRoom(ada, 'Ada')
    if (!created.ok) throw new Error('create failed')
    const joined = await joinRoom(lin, created.data.room.id, 'Lin')
    if (!joined.ok) throw new Error('join failed')
    const source = [
      'const readline = require("readline");',
      'const rl = readline.createInterface({ input: process.stdin, output: process.stdout });',
      'rl.question("Enter the number of terms: ", (input) => {',
      '  const n = Number(input);',
      '  let a = 0;',
      '  let b = 1;',
      '  for (let i = 0; i < n; i += 1) {',
      '    console.log(a);',
      '    const next = a + b;',
      '    a = b;',
      '    b = next;',
      '  }',
      '  rl.close();',
      '});',
    ].join('\n')
    await seed(started.url, created.data.room.id, created.data.ticket, created.data.participant.id, source)
    await vi.waitFor(() => {
      expect(started.server.documents.text(created.data.room.id)).toContain('readline')
    })

    const early = await emitAck<{ ok: boolean; code?: string }>(ada, ClientEvents.CodeInput, { text: '5' })
    expect(early).toEqual({ ok: false, code: ERROR_CODES.NO_ACTIVE_RUN })

    const seen = collect(lin, 8000)
    const ack = await emitAck<{ ok: boolean }>(ada, ClientEvents.CodeRun, {})
    expect(ack.ok).toBe(true)
    await vi.waitFor(() => {
      expect(seen.stdout.join('')).toContain('Enter the number of terms')
    })
    const sent = await emitAck<{ ok: boolean }>(lin, ClientEvents.CodeInput, { text: '5' })
    expect(sent.ok).toBe(true)
    await vi.waitFor(() => {
      expect(seen.stdout.join('')).toMatch(/0\s+1\s+1\s+2\s+3/)
    })
    expect(seen.stdin.join('')).toContain('5')
    const stopped = await emitAck<{ ok: boolean }>(ada, ClientEvents.CodeStop, {})
    expect(stopped.ok).toBe(true)
    const result = await seen.finished
    expect(result.timedOut).toBe(false)
    expect(seen.system.join('')).not.toContain('time limit')
  })
})
