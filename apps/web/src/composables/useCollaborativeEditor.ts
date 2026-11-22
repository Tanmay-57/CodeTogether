import { CODE_TEXT_KEY, isParticipantColor, LANGUAGE_META_KEY, META_MAP_KEY } from '@codetogether/shared'
import { onScopeDispose, ref } from 'vue'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { yjsUrl } from '@/lib/env'
import { useEditorStore } from '@/stores/editor'

interface EditorParticipant {
  id: string
  displayName: string
  color: string
}

export function useCollaborativeEditor(roomId: string, ticket: string, participant: EditorParticipant) {
  const editor = useEditorStore()
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(yjsUrl, roomId, doc, {
    connect: true,
    params: {
      ticket,
      participantId: participant.id,
    },
  })
  const synced = ref(false)
  const text = doc.getText(CODE_TEXT_KEY)
  const meta = doc.getMap(META_MAP_KEY)
  let destroyed = false

  provider.awareness.setLocalStateField('user', {
    name: participant.displayName,
    color: isParticipantColor(participant.color) ? participant.color : '#e8a54b',
    participantId: participant.id,
  })

  const onStatus = ({ status }: { status: string }) => {
    if (status !== 'connected') {
      synced.value = false
      editor.setSyncStatus('disconnected')
      return
    }
    editor.setSyncStatus(provider.synced ? 'synced' : 'syncing')
    synced.value = provider.synced
  }
  const onSync = (isSynced: boolean) => {
    synced.value = isSynced
    editor.setSyncStatus(isSynced ? 'synced' : 'syncing')
    const language = meta.get(LANGUAGE_META_KEY)
    if (typeof language === 'string') editor.setLanguage(language)
  }

  provider.on('status', onStatus)
  provider.on('sync', onSync)
  editor.setSyncStatus('syncing')

  function destroy() {
    if (destroyed) return
    destroyed = true
    provider.destroy()
    doc.destroy()
    editor.setSyncStatus('idle')
  }

  onScopeDispose(destroy)

  return { doc, provider, awareness: provider.awareness, synced, text, meta, destroy }
}
