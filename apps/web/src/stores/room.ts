import type { IceServerConfig, JoinAckData, JoinRoomPayload, PublicParticipant, PublicRoom } from '@codetogether/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useRoomStore = defineStore('room', () => {
  const room = ref<PublicRoom | null>(null)
  const selfId = ref<string | null>(null)
  const ticket = ref<string | null>(null)
  const iceServers = ref<IceServerConfig[]>([])
  const resume = ref<JoinRoomPayload | null>(null)

  const self = computed(() => room.value?.participants.find((person) => person.id === selfId.value) ?? null)
  const others = computed(() => room.value?.participants.filter((person) => person.id !== selfId.value) ?? [])

  function applyJoin(data: JoinAckData) {
    room.value = data.room
    selfId.value = data.participant.id
    ticket.value = data.ticket
    iceServers.value = data.iceServers
  }

  function upsert(participant: PublicParticipant) {
    if (!room.value) return
    const index = room.value.participants.findIndex((person) => person.id === participant.id)
    if (index === -1) room.value.participants.push(participant)
    else room.value.participants[index] = participant
  }

  function remove(participantId: string) {
    if (!room.value) return
    room.value.participants = room.value.participants.filter((person) => person.id !== participantId)
  }

  function patchPresence(update: { participantId: string; camera: boolean; microphone: boolean; connection: PublicParticipant['connection'] }) {
    const participant = room.value?.participants.find((person) => person.id === update.participantId)
    if (!participant) return
    participant.camera = update.camera
    participant.microphone = update.microphone
    participant.connection = update.connection
  }

  function clear() {
    room.value = null
    selfId.value = null
    ticket.value = null
    iceServers.value = []
    resume.value = null
  }

  return { room, selfId, self, others, ticket, iceServers, resume, applyJoin, upsert, remove, patchPresence, clear }
})
