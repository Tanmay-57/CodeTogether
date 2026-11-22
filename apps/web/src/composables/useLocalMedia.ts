import { shallowRef } from 'vue'
import { mediaErrorMessage } from '@/lib/mediaError'
import { useMediaStore } from '@/stores/media'

const stream = shallowRef<MediaStream | null>(null)
const screenStream = shallowRef<MediaStream | null>(null)

function stopStream(current: MediaStream | null) {
  current?.getTracks().forEach((track) => track.stop())
}

async function capture(video: boolean, audio: boolean): Promise<MediaStream | null> {
  if (!video && !audio) {
    stopStream(stream.value)
    stream.value = null
    return null
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Media devices are unavailable.', 'NotFoundError')
  }
  const next = await navigator.mediaDevices.getUserMedia({ video, audio })
  stopStream(stream.value)
  stream.value = next
  return next
}

export function useLocalMedia() {
  const media = useMediaStore()

  async function setCamera(enabled: boolean) {
    media.permissionError = null
    try {
      await capture(enabled, media.microphoneEnabled)
      media.cameraEnabled = enabled
      return true
    } catch (error) {
      media.cameraEnabled = false
      media.permissionError = mediaErrorMessage(error)
      if (!media.microphoneEnabled) {
        stopStream(stream.value)
        stream.value = null
      }
      return false
    }
  }

  async function setMicrophone(enabled: boolean) {
    media.permissionError = null
    try {
      await capture(media.cameraEnabled, enabled)
      media.microphoneEnabled = enabled
      return true
    } catch (error) {
      media.microphoneEnabled = false
      media.permissionError = mediaErrorMessage(error)
      if (!media.cameraEnabled) {
        stopStream(stream.value)
        stream.value = null
      }
      return false
    }
  }

  function stopScreen() {
    stopStream(screenStream.value)
    screenStream.value = null
  }

  async function shareScreen() {
    if (screenStream.value) {
      stopScreen()
      return false
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      media.permissionError = 'Screen sharing is unavailable in this browser.'
      return false
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const track = display.getVideoTracks()[0]
      if (!track) {
        stopStream(display)
        return false
      }
      track.addEventListener('ended', () => stopScreen(), { once: true })
      screenStream.value = display
      return true
    } catch (error) {
      media.permissionError = mediaErrorMessage(error)
      return false
    }
  }

  function stopAll() {
    stopScreen()
    stopStream(stream.value)
    stream.value = null
    media.cameraEnabled = false
    media.microphoneEnabled = false
  }

  return { stream, screenStream, setCamera, setMicrophone, shareScreen, stopScreen, stopAll }
}
