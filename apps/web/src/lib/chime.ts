let audio: AudioContext | null = null

function playTone(frequency: number, peak: number, seconds: number): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const AudioCtx = window.AudioContext
  if (!AudioCtx) return
  audio ??= new AudioCtx()
  const current = audio
  void current.resume().then(() => {
    const oscillator = current.createOscillator()
    const gain = current.createGain()
    const now = current.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
    oscillator.connect(gain)
    gain.connect(current.destination)
    oscillator.start(now)
    oscillator.stop(now + seconds + 0.02)
  }).catch(() => undefined)
}

export function playJoinChime(): void {
  playTone(740, 0.05, 0.22)
}

export function playChatTone(): void {
  playTone(494, 0.025, 0.1)
}
