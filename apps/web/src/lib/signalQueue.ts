export interface SignalDescription {
  type: RTCSdpType
  sdp?: string
}

export interface SignalCandidate {
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

export type Signal =
  | { type: 'offer'; from: string; description: SignalDescription }
  | { type: 'answer'; from: string; description: SignalDescription }
  | { type: 'ice'; from: string; candidate: SignalCandidate }

const queue: Signal[] = []
let handler: ((signal: Signal) => void) | null = null

export function pushSignal(signal: Signal): void {
  if (handler) handler(signal)
  else queue.push(signal)
}

export function setSignalHandler(next: ((signal: Signal) => void) | null): void {
  handler = next
  if (!next) return
  while (queue.length > 0) {
    const signal = queue.shift()
    if (signal) next(signal)
  }
}

export function clearSignalQueue(): void {
  queue.length = 0
}
