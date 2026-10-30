export type LiveCloseReason = 'close_requested' | 'expired' | 'content' | 'remote_hangup' | 'connection_lost'
export type AtlasLiveEvent = { eventId: string } & (
  | { type: 'session.started'; sessionId: string }
  | { type: 'session.closed'; sessionId: string; seconds: number; reason: LiveCloseReason }
  | { type: 'session.usage.updated'; seconds: number }
  | { type: 'session.input_transcript.delta' | 'session.output_transcript.delta'; delta: string; startMs: number; endMs: number }
  | { type: 'error'; code: string | null }
)

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
const identifier = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256
const seconds = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
const timeline = (value: unknown): value is number => seconds(value) && Number.isSafeInteger(value)
const reasons: ReadonlySet<unknown> = new Set(['close_requested', 'expired', 'content', 'remote_hangup', 'connection_lost'])

/** Live transcript deltas are fragments, not turn boundaries or playback receipts. */
export function decodeAtlasLiveEvent(raw: unknown): AtlasLiveEvent | null {
  const event = record(raw)
  if (!event || !identifier(event.event_id)) return null
  const eventId = event.event_id
  if (event.type === 'session.started') {
    const id = record(event.session)?.id
    return identifier(id) ? { type: event.type, eventId, sessionId: id } : null
  }
  if (event.type === 'session.closed') {
    const id = record(event.session)?.id, usage = record(event.usage)?.seconds
    return identifier(id) && seconds(usage) && reasons.has(event.reason)
      ? { type: event.type, eventId, sessionId: id, seconds: usage, reason: event.reason as LiveCloseReason } : null
  }
  if (event.type === 'session.usage.updated') {
    const usage = record(event.usage)?.seconds
    return seconds(usage) ? { type: event.type, eventId, seconds: usage } : null
  }
  if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
    return typeof event.delta === 'string' && event.delta.length <= 16_384
      && timeline(event.start_ms) && timeline(event.end_ms) && event.end_ms >= event.start_ms
      ? { type: event.type, eventId, delta: event.delta, startMs: event.start_ms, endMs: event.end_ms } : null
  }
  if (event.type === 'error') {
    const code = record(event.error)?.code
    return { type: event.type, eventId, code: typeof code === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(code) ? code : null }
  }
  return null
}
