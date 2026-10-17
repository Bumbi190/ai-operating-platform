import { describe, expect, it } from 'vitest'
import { BRAND_MODEL, VICTORIA_VOICE_ID } from '../voice/config'
import { assertPinnedContentVoice, assertPinnedContentVoiceForRender, requirePinnedContentVoice } from '../content-growth/voice-lock'

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

  it('keeps Nova unverified while permitting the owner-approved Pling Alternative B', () => {
    expect(() => requirePinnedContentVoice('familje-stunden','nova-dialogue')).toThrow('VOICE_LOCK_UNVERIFIED')
    const pling = requirePinnedContentVoice('familje-stunden','pling-dialogue')
    expect(pling.voiceId).toBe('vhPZICLLz0UIRNLnUe0u')
    expect(pling.modelId).toBe('eleven_v4')
    expect(pling.source).toContain('Alternative B')
    expect(() => requirePinnedContentVoice('the-prompt','pling-dialogue')).toThrow('VOICE_LOCK_UNVERIFIED')
    expect(() => requirePinnedContentVoice('familje-stunden','news-narrator')).toThrow('VOICE_LOCK_UNVERIFIED')
  })

  it('blocks swapped voice IDs or models', () => {
    expect(() => assertPinnedContentVoice('familje-stunden','december-calendar-instructions','iS3S91gyCtjX6pvnxlEc','eleven_v4')).toThrow('VOICE_LOCK_MISMATCH')
    expect(() => assertPinnedContentVoice('familje-stunden','december-calendar-instructions','vhPZICLLz0UIRNLnUe0u','eleven_v3')).toThrow('VOICE_LOCK_MISMATCH')
    expect(() => assertPinnedContentVoice('the-prompt','news-narrator','ZSHzpa6aUvhjzShiBmYw',BRAND_MODEL)).toThrow('VOICE_LOCK_MISMATCH')
  })

  it('checks Pling brightening profile in addition to voice ID and model', () => {
    const p = requirePinnedContentVoice('familje-stunden','pling-dialogue')
    expect(p.processingProfile).toBe('pling-alternative-b-december-2026')
    expect(() => assertPinnedContentVoiceForRender('familje-stunden','pling-dialogue',p.voiceId,p.modelId)).toThrow('VOICE_PROCESSING_PROFILE_MISMATCH')
    expect(() => assertPinnedContentVoiceForRender('familje-stunden','pling-dialogue',p.voiceId,p.modelId,'unverified')).toThrow('VOICE_PROCESSING_PROFILE_MISMATCH')
    expect(assertPinnedContentVoiceForRender('familje-stunden','pling-dialogue',p.voiceId,p.modelId,p.processingProfile)).toEqual(p)
    const victoria = requirePinnedContentVoice('the-prompt','news-narrator')
    expect(() => assertPinnedContentVoiceForRender('the-prompt','news-narrator',victoria.voiceId,victoria.modelId,'pling-alternative-b-december-2026')).toThrow('VOICE_PROCESSING_PROFILE_UNAPPROVED')
  })

  it('accepts a correctly pinned pair', () => {
    const pin = requirePinnedContentVoice('the-prompt','news-narrator')
    expect(assertPinnedContentVoice('the-prompt','news-narrator',pin.voiceId,pin.modelId)).toEqual(pin)
  })
})
