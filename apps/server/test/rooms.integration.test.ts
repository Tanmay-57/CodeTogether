import { ERROR_CODES, ServerEvents, type PublicParticipant } from '@codetogether/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { connectClient, createRoom, joinRoom, leaveRoom, startTestServer } from './helpers'

const open: Array<{ close: () => unknown }> = []

afterEach(async () => {
  await Promise.all(open.splice(0).map((item) => item.close()))
})

async function boot(env?: Record<string, string>) {
  const started = await startTestServer({ env })
  open.push({ close: started.server.close.bind(started.server) })
  return started
}

describe('room sockets', () => {
  it('serves health without secrets', async () => {
    const { url } = await boot()
    const health = await fetch(`${url}/health`)
    expect(await health.json()).toEqual({ ok: true, service: 'codetogether' })
    const ice = await fetch(`${url}/api/ice`)
    const body = await ice.json() as { stunConfigured: boolean; turnConfigured: boolean }
    expect(body.stunConfigured).toBe(true)
    expect(body.turnConfigured).toBe(false)
    expect(JSON.stringify(body)).not.toContain('credential')
  })

  it('lets two participants see each other and rejects invalid access', async () => {
    const { url } = await boot()
    const ada = await connectClient(url)
    const lin = await connectClient(url)
    open.push({ close: async () => { ada.close(); lin.close() } })

    const created = await createRoom(ada, 'Ada')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const seen = new Promise<PublicParticipant>((resolve) => {
      ada.once(ServerEvents.ParticipantJoined, (payload: { participant: PublicParticipant }) => resolve(payload.participant))
    })
    const joined = await joinRoom(lin, created.data.room.id, 'Lin')
    expect(joined.ok).toBe(true)
    if (!joined.ok) return
    expect(joined.data.room.participants.map((person) => person.displayName).sort()).toEqual(['Ada', 'Lin'])
    expect((await seen).displayName).toBe('Lin')
    expect(joined.data.ticket.length).toBeGreaterThan(20)

    const stranger = await connectClient(url)
    open.push({ close: async () => stranger.close() })
    const missing = await joinRoom(stranger, 'not-a-room!!', 'Noa')
    expect(missing).toEqual({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
    const unknown = await joinRoom(stranger, 'abcdefghijkl', 'Noa')
    expect(unknown).toEqual({ ok: false, code: ERROR_CODES.ROOM_NOT_FOUND })

    const third = await connectClient(url)
    open.push({ close: async () => third.close() })
    const full = await joinRoom(third, created.data.room.id, 'Noa')
    expect(full).toEqual({ ok: false, code: ERROR_CODES.ROOM_FULL })
  })

  it('resumes after a temporary disconnect and removes a member who leaves', async () => {
    const { url } = await boot()
    const ada = await connectClient(url)
    open.push({ close: async () => ada.close() })
    const created = await createRoom(ada, 'Ada')
    if (!created.ok) throw new Error('create failed')
    ada.disconnect()
    const resumedSocket = await connectClient(url)
    open.push({ close: async () => resumedSocket.close() })
    const resumed = await joinRoom(resumedSocket, created.data.room.id, 'Ada', created.data.participant.id)
    expect(resumed.ok && resumed.data.resumed).toBe(true)

    const left = leaveRoom(resumedSocket)
    await expect(left).resolves.toEqual({ ok: true })
    const outsider = await connectClient(url)
    open.push({ close: async () => outsider.close() })
    await new Promise((resolve) => setTimeout(resolve, 400))
    const expired = await joinRoom(outsider, created.data.room.id, 'Lin')
    expect(expired.ok).toBe(false)
  })

  it('rate limits room creation', async () => {
    const { url } = await boot({ CREATE_ROOM_PER_MINUTE: '2' })
    const ada = await connectClient(url)
    open.push({ close: async () => ada.close() })
    expect((await createRoom(ada)).ok).toBe(true)
    await leaveRoom(ada)
    expect((await createRoom(ada, 'Ada')).ok).toBe(true)
    await leaveRoom(ada)
    expect(await createRoom(ada, 'Ada')).toEqual({ ok: false, code: ERROR_CODES.RATE_LIMITED })
  })
})
