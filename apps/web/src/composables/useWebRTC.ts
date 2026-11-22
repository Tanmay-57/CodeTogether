import { ClientEvents, type IceServerConfig } from '@codetogether/shared'
import { onScopeDispose, shallowRef } from 'vue'
import { onRoomEvent } from '@/lib/roomBus'
import { setSignalHandler, type SignalCandidate, type SignalDescription } from '@/lib/signalQueue'
import { getSocket } from '@/lib/socket'
import { useMediaStore } from '@/stores/media'
import { useRoomStore } from '@/stores/room'
import { useLocalMedia } from './useLocalMedia'

export function useWebRTC() {
  const rooms = useRoomStore()
  const media = useMediaStore()
  const { stream, screenStream } = useLocalMedia()
  const peers = shallowRef(new Map<string, MediaStream>())
  const connections = new Map<string, RTCPeerConnection>()
  const pendingCandidates = new Map<string, SignalCandidate[]>()
  const pendingRenegotiation = new Set<string>()
  const chains = new Map<string, Promise<void>>()
  let accepting = true

  function others(): string[] {
    return rooms.others.map((person) => person.id)
  }

  function enqueue(id: string, task: () => Promise<void>): Promise<void> {
    const previous = chains.get(id) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(task)
    chains.set(id, next)
    return next
  }

  function iceServers(): RTCIceServer[] {
    return rooms.iceServers.map((server: IceServerConfig) => ({
      urls: server.urls,
      username: server.username,
      credential: server.credential,
    }))
  }

  function publishPeers() {
    peers.value = new Map(peers.value)
  }

  function localTracks(): MediaStreamTrack[] {
    const tracks: MediaStreamTrack[] = []
    const screen = screenStream.value?.getVideoTracks().find((track) => track.readyState === 'live')
    const camera = stream.value
    if (screen) tracks.push(screen)
    else {
      const video = camera?.getVideoTracks().find((track) => track.readyState === 'live')
      if (video) tracks.push(video)
    }
    const audio = camera?.getAudioTracks().find((track) => track.readyState === 'live')
    if (audio) tracks.push(audio)
    return tracks
  }

  function senderFor(pc: RTCPeerConnection, kind: 'audio' | 'video'): RTCRtpSender | undefined {
    const sending = pc.getSenders().find((item) => item.track?.kind === kind)
    if (sending) return sending
    const receiving = pc.getTransceivers().find((item) => item.receiver.track?.kind === kind)
    if (receiving) return receiving.sender
    const open = pc.getTransceivers().filter((item) => !item.sender.track && item.direction !== 'stopped')
    return (kind === 'audio' ? open[0] : open[1] ?? open[0])?.sender
  }

  function attachLocal(pc: RTCPeerConnection) {
    const tracks = localTracks()
    if (tracks.length === 0) {
      pc.addTransceiver('audio', { direction: 'recvonly' })
      pc.addTransceiver('video', { direction: 'recvonly' })
      return
    }
    const local = new MediaStream(tracks)
    for (const track of tracks) pc.addTrack(track, local)
    if (!tracks.some((track) => track.kind === 'audio')) pc.addTransceiver('audio', { direction: 'recvonly' })
    if (!tracks.some((track) => track.kind === 'video')) pc.addTransceiver('video', { direction: 'recvonly' })
  }

  function ensurePeer(remoteId: string): RTCPeerConnection {
    const existing = connections.get(remoteId)
    if (existing && existing.connectionState !== 'closed') return existing
    const pc = new RTCPeerConnection({ iceServers: iceServers() })
    connections.set(remoteId, pc)
    attachLocal(pc)
    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      getSocket().emit(ClientEvents.WebRtcIceCandidate, {
        to: remoteId,
        candidate: event.candidate.toJSON(),
      }, () => undefined)
    }
    pc.ontrack = (event) => {
      const current = peers.value.get(remoteId)
      const remoteStream = current ?? event.streams[0] ?? new MediaStream()
      if (!remoteStream.getTracks().includes(event.track)) remoteStream.addTrack(event.track)
      event.track.onended = () => {
        remoteStream.removeTrack(event.track)
        peers.value.set(remoteId, remoteStream)
        publishPeers()
      }
      peers.value.set(remoteId, remoteStream)
      publishPeers()
    }
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable' && pendingRenegotiation.has(remoteId)) {
        void enqueue(remoteId, () => sendOffer(remoteId))
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        media.connectionError = 'A video connection failed. If you are on different networks, a TURN server is required.'
        const selfId = rooms.selfId ?? ''
        if (selfId < remoteId) {
          void enqueue(remoteId, async () => {
            pc.restartIce()
            await sendOffer(remoteId)
          })
        }
      }
      if (pc.connectionState === 'connected') media.connectionError = null
      if (pc.connectionState === 'closed') {
        peers.value.delete(remoteId)
        publishPeers()
      }
    }
    return pc
  }

  async function flushCandidates(remoteId: string, pc: RTCPeerConnection) {
    const queued = pendingCandidates.get(remoteId) ?? []
    pendingCandidates.delete(remoteId)
    for (const candidate of queued) {
      if (!candidate.candidate) continue
      await pc.addIceCandidate(candidate)
    }
  }

  async function sendOffer(remoteId: string) {
    const pc = ensurePeer(remoteId)
    if (pc.signalingState !== 'stable') {
      pendingRenegotiation.add(remoteId)
      return
    }
    pendingRenegotiation.delete(remoteId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    getSocket().emit(ClientEvents.WebRtcOffer, {
      to: remoteId,
      description: pc.localDescription,
    }, () => undefined)
  }

  async function handleOffer(from: string, description: SignalDescription) {
    if (!accepting) return
    const pc = ensurePeer(from)
    const selfId = rooms.selfId ?? ''
    const polite = selfId > from
    const collision = pc.signalingState !== 'stable'
    if (collision && !polite) return
    if (collision && polite) await pc.setLocalDescription({ type: 'rollback' })
    await pc.setRemoteDescription(description)
    await flushCandidates(from, pc)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    getSocket().emit(ClientEvents.WebRtcAnswer, {
      to: from,
      description: pc.localDescription,
    }, () => undefined)
  }

  async function handleAnswer(from: string, description: SignalDescription) {
    const pc = connections.get(from)
    if (!pc || pc.signalingState !== 'have-local-offer') return
    await pc.setRemoteDescription(description)
    await flushCandidates(from, pc)
  }

  async function handleIce(from: string, candidate: SignalCandidate) {
    const pc = connections.get(from)
    if (!pc || !pc.remoteDescription) {
      const queued = pendingCandidates.get(from) ?? []
      queued.push(candidate)
      pendingCandidates.set(from, queued)
      return
    }
    if (!candidate.candidate) return
    await pc.addIceCandidate(candidate)
  }

  function closePeer(remoteId: string) {
    pendingRenegotiation.delete(remoteId)
    pendingCandidates.delete(remoteId)
    connections.get(remoteId)?.close()
    connections.delete(remoteId)
    peers.value.delete(remoteId)
    publishPeers()
  }

  function closeAll() {
    for (const id of [...connections.keys()]) closePeer(id)
  }

  async function publishLocal() {
    const tracks = localTracks()
    const local = new MediaStream(tracks)
    for (const [id, pc] of connections) {
      for (const track of tracks) {
        const kind = track.kind === 'audio' ? 'audio' : 'video'
        let sender = senderFor(pc, kind)
        if (sender) await sender.replaceTrack(track)
        else sender = pc.addTrack(track, local)
        const transceiver = pc.getTransceivers().find((item) => item.sender === sender)
        if (transceiver) transceiver.direction = 'sendrecv'
      }
      if (!tracks.some((track) => track.kind === 'video')) {
        const videoSender = senderFor(pc, 'video')
        if (videoSender?.track) await videoSender.replaceTrack(null)
      }
      if (tracks.length > 0 || pc.getSenders().some((item) => item.track)) await enqueue(id, () => sendOffer(id))
    }
  }

  async function startCall() {
    accepting = true
    media.inCall = true
    for (const id of others()) {
      if (!connections.has(id)) await enqueue(id, () => sendOffer(id))
    }
    await publishLocal()
  }

  function leaveCall() {
    accepting = false
    media.inCall = false
    closeAll()
  }

  const stopEvents = onRoomEvent((event) => {
    if (event.type === 'peer-left') closePeer(event.participantId)
    if (event.type === 'self-resumed') closeAll()
    if (event.type === 'peer-joined') {
      void enqueue(event.participantId, async () => {
        closePeer(event.participantId)
        if (!accepting) return
        await sendOffer(event.participantId)
      })
    }
    if (event.type === 'expired') leaveCall()
  })

  setSignalHandler((signal) => {
    const task = async () => {
      if (signal.type === 'offer') await handleOffer(signal.from, signal.description)
      if (signal.type === 'answer') await handleAnswer(signal.from, signal.description)
      if (signal.type === 'ice') await handleIce(signal.from, signal.candidate)
    }
    void enqueue(signal.from, task).catch(() => {
      media.connectionError = 'The video connection could not be negotiated.'
    })
  })

  onScopeDispose(() => {
    stopEvents()
    setSignalHandler(null)
    leaveCall()
  })

  return { peers, publishLocal, startCall, leaveCall, closeAll }
}
