export type AckFn = (response: { ok: true; data?: unknown } | { ok: false; code: string } | { ok: true }) => void

export function isAck(value: unknown): value is AckFn {
  return typeof value === 'function'
}
