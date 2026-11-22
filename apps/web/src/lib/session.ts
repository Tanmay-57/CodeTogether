export interface LocalSession {
  roomId: string
  displayName: string
  participantId?: string
  lock?: string
  enteredWorkspace: boolean
}

const KEY = 'codetogether.session'

export function readSession(): LocalSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalSession>
    if (!parsed.roomId || !parsed.displayName) return null
    return {
      roomId: parsed.roomId,
      displayName: parsed.displayName,
      participantId: parsed.participantId,
      lock: typeof parsed.lock === 'string' && parsed.lock.length > 0 ? parsed.lock : undefined,
      enteredWorkspace: Boolean(parsed.enteredWorkspace),
    }
  } catch {
    return null
  }
}

export function writeSession(session: LocalSession): void {
  sessionStorage.setItem(KEY, JSON.stringify(session))
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY)
}
