export function mediaErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Camera or microphone permission was denied. You can still join with devices off.'
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'No microphone or camera was detected. You can still join with devices off.'
    }
    if (error.name === 'NotReadableError') {
      return 'The camera or microphone is already in use by another application.'
    }
  }
  return 'The camera or microphone could not be started.'
}
