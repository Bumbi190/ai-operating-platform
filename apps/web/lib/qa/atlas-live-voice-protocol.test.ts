import { describe, expect, it } from 'vitest'
import { buildAtlasLiveVoiceConfig } from '@/lib/atlas/live-voice/config'
import { decodeAtlasLiveEvent } from '@/lib/atlas/live-voice/protocol'

describe('isolated Swedish Live trial configuration', () => {
  it.each(['marin', 'cedar'] as const)('restricts the %s trial to voice conversation and close', voice => {
    const config = buildAtlasLiveVoiceConfig(voice)
    expect(config.model).toBe('gpt-live-1')
    expect(config.audio).toEqual({ output: { voice } })
    expect(config.store).toBe(false)
    expect(config.delegation).toEqual({ type: 'client' })
    expect(config.client.data_channel.allowed_client_events).toEqual(['session.close'])
    expect(config.client.data_channel.allowed_server_events).toEqual([
      { type: 'session.started' }, { type: 'session.closed' },
      { type: 'session.usage.updated' }, { type: 'session.input_transcript.delta' },
      { type: 'session.output_transcript.delta' }, { type: 'error' },
    ])
    expect(config.instructions).toContain('Tala svenska')
    expect(config.instructions).toContain('tankepauser')
    expect(config.instructions).toContain('Sluta prata när användaren avbryter')
    expect(config.instructions).toContain('inte utföra uppgifter')
    expect(config).not.toHaveProperty('max_duration')
    expect(config).not.toHaveProperty('tools')
  })

  it('rejects voices outside the two verified Live candidates', () => {
    expect(() => buildAtlasLiveVoiceConfig('onyx' as never)).toThrow('unsupported_live_voice')
  })
})

describe('Live event validation', () => {
  it('preserves opaque session IDs instead of assuming a particular prefix', () => {
    expect(decodeAtlasLiveEvent({ type: 'session.started', event_id: 'e1', session: { id: 'opaque.example' } }))
      .toEqual({ type: 'session.started', eventId: 'e1', sessionId: 'opaque.example' })
  })

  it.each([null, [], {}, { type: 'session.started' },
    { type: 'session.started', event_id: 'e', session: { id: '' } },
    { type: 'session.started', event_id: '', session: { id: 'a' } },
    { type: 'response.audio.done', event_id: 'e' },
  ])('ignores malformed or unrelated events: %j', raw => {
    expect(decodeAtlasLiveEvent(raw)).toBeNull()
  })

  it('validates transcript timing and does not manufacture a complete turn', () => {
    const raw = { type: 'session.input_transcript.delta', event_id: 'e2', delta: 'Jag tänker…', start_ms: 20, end_ms: 700 }
    expect(decodeAtlasLiveEvent(raw)).toEqual({ type: raw.type, eventId: 'e2', delta: raw.delta, startMs: 20, endMs: 700 })
    expect(decodeAtlasLiveEvent({ ...raw, end_ms: 19 })).toBeNull()
    expect(decodeAtlasLiveEvent({ ...raw, start_ms: -1 })).toBeNull()
    expect(decodeAtlasLiveEvent({ ...raw, delta: 1 })).toBeNull()
    expect(decodeAtlasLiveEvent({ ...raw, delta: 'x'.repeat(16_385) })).toBeNull()
  })

  it('accepts fractional cumulative seconds', () => {
    expect(decodeAtlasLiveEvent({ type: 'session.usage.updated', event_id: 'e3', usage: { seconds: 12.5 } }))
      .toEqual({ type: 'session.usage.updated', eventId: 'e3', seconds: 12.5 })
  })

  it.each([-1, Infinity, NaN, '15', null])('rejects invalid usage %j', seconds => {
    expect(decodeAtlasLiveEvent({ type: 'session.usage.updated', event_id: 'e4', usage: { seconds } })).toBeNull()
  })

  it('requires identity, final usage and a documented close reason for finalization', () => {
    const raw = { type: 'session.closed', event_id: 'e5', session: { id: 'a' }, reason: 'close_requested', usage: { seconds: 15 } }
    expect(decodeAtlasLiveEvent(raw)).toEqual({ type: raw.type, eventId: 'e5', sessionId: 'a', seconds: 15, reason: raw.reason })
    expect(decodeAtlasLiveEvent({ ...raw, session: null })).toBeNull()
    expect(decodeAtlasLiveEvent({ ...raw, usage: null })).toBeNull()
    expect(decodeAtlasLiveEvent({ ...raw, reason: 'complete' })).toBeNull()
  })

  it('does not expose a provider error message or other unvalidated fields', () => {
    expect(decodeAtlasLiveEvent({ type: 'error', event_id: 'e6', error: { code: 'bad_request', message: 'private detail' } }))
      .toEqual({ type: 'error', eventId: 'e6', code: 'bad_request' })
  })
})
