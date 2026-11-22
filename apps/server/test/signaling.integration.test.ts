import { ClientEvents, ERROR_CODES } from '@codetogether/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { connectClient, createRoom, emitAck, joinRoom, startTestServer } from './helpers'

const closers: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})

describe('webrtc signaling authorization', () => {
  it('relays an offer only to the addressed member and rejects outsiders', async () => {
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

    const offers: Array<{ from: string; description: { type: string } }> = []
    lin.on(ClientEvents.WebRtcOffer, (payload) => offers.push(payload))

    const relayed = await emitAck<{ ok: boolean; code?: string }>(ada, ClientEvents.WebRtcOffer, {
      to: joined.data.participant.id,
      description: { type: 'offer', sdp: 'v=0' },
    })
    expect(relayed).toEqual({ ok: true })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(offers).toEqual([{ from: created.data.participant.id, description: { type: 'offer', sdp: 'v=0' } }])

    const rejected = await emitAck(outsider, ClientEvents.WebRtcOffer, {
      to: joined.data.participant.id,
      description: { type: 'offer', sdp: 'v=0' },
    })
    expect(rejected).toEqual({ ok: false, code: ERROR_CODES.NOT_A_MEMBER })

    const otherRoom = await createRoom(outsider, 'Noa')
    if (!otherRoom.ok) throw new Error('second room failed')
    const cross = await emitAck(ada, ClientEvents.WebRtcOffer, {
      to: otherRoom.data.participant.id,
      description: { type: 'offer', sdp: 'v=0' },
    })
    expect(cross).toEqual({ ok: false, code: ERROR_CODES.NOT_A_MEMBER })

    const malformed = await emitAck(ada, ClientEvents.WebRtcAnswer, {
      to: joined.data.participant.id,
      description: { type: 'offer', sdp: 'v=0' },
    })
    expect(malformed).toEqual({ ok: false, code: ERROR_CODES.INVALID_PAYLOAD })
  })
})
