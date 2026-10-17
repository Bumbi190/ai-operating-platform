import { PCM_MAX_BYTES } from './pcm'
export const VOICE_PCM_CHUNK_BYTES = 6400
export const VOICE_PCM_QUEUE_BYTES = 64000
export const VOICE_SEGMENT_BYTES = 640000
export const VOICE_TRANSCRIPT_CHARS = 12000
export type VoiceEndReason = 'pause' | 'manual' | 'limit'
export type RealtimeTurn = { send(pcm: Uint8Array): void; finish(reason: VoiceEndReason): Promise<string>; abort(): void }
const validSeq = (seq: number) => Number.isInteger(seq) && seq >= 0 && seq <= 0xffffffff
function validPcm(pcm: Uint8Array) {
  if (!(pcm instanceof Uint8Array) || !pcm.length || pcm.length % 2 || pcm.length > VOICE_PCM_CHUNK_BYTES)
    throw new Error('invalid_voice_pcm')
}
export function encodeVoicePcm(seq: number, pcm: Uint8Array): Uint8Array {
  if (!validSeq(seq)) throw new Error('invalid_voice_sequence')
  validPcm(pcm)
  const frame = new Uint8Array(pcm.length + 4)
  new DataView(frame.buffer).setUint32(0, seq, false)
  frame.set(pcm, 4)
  return frame
}
export function decodeVoicePcm(frame: Uint8Array): { seq: number; pcm: Uint8Array } {
  if (!(frame instanceof Uint8Array) || frame.length < 6 || frame.length > VOICE_PCM_CHUNK_BYTES + 4) throw new Error('invalid_voice_frame')
  const pcm = frame.subarray(4)
  validPcm(pcm)
  return { seq: new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0, false), pcm }
}

export type VoiceFinishControl = { type: 'finish'; lastSeq: number; reason: VoiceEndReason }
export type VoiceControl = VoiceFinishControl | { type: 'cancel' }
export type VoiceFailureCode = 'unavailable' | 'invalid_audio' | 'aborted' | 'timeout' | 'capacity'
export type VoiceServerEvent = { type: 'ready' } | { type: 'final'; text: string; reason: VoiceEndReason } | { type: 'failed'; code: VoiceFailureCode }
const encoder = new TextEncoder()
const validReason = (value: unknown): value is VoiceEndReason => value === 'pause' || value === 'manual' || value === 'limit'
function parseObject(raw: string, maxBytes: number): Record<string, unknown> {
  if (typeof raw !== 'string' || encoder.encode(raw).byteLength > maxBytes) throw new Error('invalid_voice_control')
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_voice_control')
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).length === allowed.length && allowed.every(key => Object.hasOwn(value, key))
}
export function parseVoiceControl(raw: string): VoiceControl {
  const value = parseObject(raw, 512)
  if (value.type === 'cancel' && keys(value, ['type'])) return { type: 'cancel' }
  if (value.type === 'finish' && keys(value, ['type', 'lastSeq', 'reason'])
    && typeof value.lastSeq === 'number' && validSeq(value.lastSeq) && validReason(value.reason))
    return { type: 'finish', lastSeq: value.lastSeq, reason: value.reason }
  throw new Error('invalid_voice_control')
}
export function parseVoiceServerEvent(raw: string): VoiceServerEvent {
  const value = parseObject(raw, 65536)
  if (value.type === 'ready' && keys(value, ['type'])) return { type: 'ready' }
  if (value.type === 'final' && keys(value, ['type', 'text', 'reason'])
    && typeof value.text === 'string' && value.text.length <= VOICE_TRANSCRIPT_CHARS && validReason(value.reason))
    return { type: 'final', text: value.text, reason: value.reason }
  if (value.type === 'failed' && keys(value, ['type', 'code'])
    && ['unavailable', 'invalid_audio', 'aborted', 'timeout', 'capacity'].includes(value.code as string))
    return { type: 'failed', code: value.code as VoiceFailureCode }
  throw new Error('invalid_voice_event')
}
export function createVoiceFrameState() {
  let next = 0, bytes = 0, ended = false
  return {
    acceptPcm(frame: Uint8Array): Uint8Array {
      if (ended) throw new Error('voice_turn_ended')
      const item = decodeVoicePcm(frame)
      if (item.seq !== next || bytes + item.pcm.length > PCM_MAX_BYTES) throw new Error('invalid_voice_sequence')
      next++; bytes += item.pcm.length
      return item.pcm
    },
    finish(value: VoiceFinishControl): { reason: VoiceEndReason; bytes: number } {
      if (ended || !next || value.type !== 'finish' || value.lastSeq !== next - 1 || !validReason(value.reason))
        throw new Error('invalid_voice_finish')
      ended = true
      return { reason: value.reason, bytes }
    },
  }
}
export function createTranscriptSegments(): { append(text: string): void; text(): string } {
  let text = ''
  return {
    append(segment: string) {
      if (typeof segment !== 'string') throw new Error('invalid_voice_transcript')
      const clean = segment.trim(), result = clean ? (text ? text + ' ' + clean : clean) : text
      if (result.length > VOICE_TRANSCRIPT_CHARS) throw new Error('voice_transcript_too_long')
      text = result
    },
    text: () => text,
  }
}
export type VoiceSegmentState = {
  accepted(bytes: number): void
  shouldCommit(): boolean
  commitSent(): void
  committed(text: string): void
  finishRequested(): void
  result(): string | null
}
/** Internal checkpoints never grant permission to submit a user question. */
export function createVoiceSegmentState(): VoiceSegmentState {
  const segments = createTranscriptSegments()
  let total = 0, current = 0, pending = false, finished = false
  const shouldCommit = () => !pending && current > 0 && (current >= VOICE_SEGMENT_BYTES || finished)
  return {
    accepted(bytes) {
      if (finished || pending || !Number.isInteger(bytes) || bytes <= 0 || bytes % 2 || bytes > VOICE_PCM_CHUNK_BYTES
        || current + bytes > VOICE_SEGMENT_BYTES || total + bytes > PCM_MAX_BYTES) throw new Error('invalid_voice_segment_audio')
      current += bytes; total += bytes
    },
    shouldCommit,
    commitSent() {
      if (!shouldCommit()) throw new Error('invalid_voice_segment_commit')
      pending = true
    },
    committed(text) {
      if (!pending) throw new Error('unexpected_voice_segment')
      segments.append(text)
      pending = false; current = 0
    },
    finishRequested() { finished = true },
    result: () => finished && !pending && current === 0 ? segments.text() : null,
  }
}
