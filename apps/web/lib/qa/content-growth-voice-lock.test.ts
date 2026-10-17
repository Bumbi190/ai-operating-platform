import { describe, expect, it } from 'vitest'
import { BRAND_MODEL, VICTORIA_VOICE_ID } from '../voice/config'
import { assertPinnedContentVoice, requirePinnedContentVoice } from '../content-growth/voice-lock'

describe('Content Growth pinned ElevenLabs voices', () => {
  it('uses The Prompt existing Victoria config', () => {
    const v = requirePinnedContentVoice('the-prompt','news-narrator')
    expect(v.voiceId).toBe(VICTORIA_VOICE_ID)
    expect(v.modelId).toBe(BRAND_MODEL)
  })

  it('uses December instruction Pling voice by ID, not name alone', () => {
    const v = requirePinnedContentVoice('familje-stunden','december-calendar-instructions')
    expect(v.voiceId).toBe('vhPZICLLz0UIRNLnUe0u')
    expect(v.modelId).toBe('eleven_v4')
  })

  it('does not substitute a Sanna story narrator for a speaking character', () => {
    for (const role of ['november-story-narrator','december-story-narrator'] as const) {
      const v = requirePinnedContentVoice('familje-stunden',role)
      expect(v.name).toContain('narrator')
      expect(v.voiceId).toBe('ZSHzpa6aUvhjzShiBmYw')
    }
  })

  it('fails closed for as-yet-unverified Nova/Pling general dialogue voices', () => {
    expect(() => requirePinnedContentVoice('familje-stunden','nova-dialogue')).toThrow('VOICE_LOCK_UNVERIFIED')
    expect(() => requirePinnedContentVoice('familje-stunden','pling-dialogue')).toThrow('VOICE_LOCK_UNVERIFIED')
    expect(() => requirePinnedContentVoice('the-prompt','pling-dialogue')).toThrow('VOICE_LOCK_UNVERIFIED')
    expect(() => requirePinnedContentVoice('familje-stunden','news-narrator')).toThrow('VOICE_LOCK_UNVERIFIED')
  })

  it('blocks swapped voice IDs or models', () => {
    expect(() => assertPinnedContentVoice('familje-stunden','december-calendar-instructions','iS3S91gyCtjX6pvnxlEc','eleven_v4')).toThrow('VOICE_LOCK_MISMATCH')
    expect(() => assertPinnedContentVoice('familje-stunden','december-calendar-instructions','vhPZICLLz0UIRNLnUe0u','eleven_v3')).toThrow('VOICE_LOCK_MISMATCH')
    expect(() => assertPinnedContentVoice('the-prompt','news-narrator','ZSHzpa6aUvhjzShiBmYw',BRAND_MODEL)).toThrow('VOICE_LOCK_MISMATCH')
  })

  it('accepts a correctly pinned pair', () => {
    const pin = requirePinnedContentVoice('the-prompt','news-narrator')
    expect(assertPinnedContentVoice('the-prompt','news-narrator',pin.voiceId,pin.modelId)).toEqual(pin)
  })
})
