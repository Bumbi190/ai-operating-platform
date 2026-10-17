/**
 * Atlas Content Growth - explicit ElevenLabs voice identity guard.
 * Knowledge/preflight only; does not call ElevenLabs, spend or publish.
 * Never interchange similarly named voices or narrator and character roles.
 */
import { BRAND_MODEL, VICTORIA_VOICE_ID } from '../voice/config'

export type ContentVoiceProject = 'the-prompt' | 'familje-stunden'
export type ContentVoiceRole =
  | 'news-narrator'
  | 'november-story-narrator'
  | 'december-story-narrator'
  | 'december-calendar-instructions'
  | 'nova-dialogue'
  | 'pling-dialogue'

export interface PinnedContentVoice {
  readonly project: ContentVoiceProject
  readonly role: ContentVoiceRole
  readonly name: string
  readonly voiceId: string
  readonly modelId: string
  readonly source: string
}

const PINS: Readonly<Record<string, PinnedContentVoice>> = Object.freeze({
  'the-prompt:news-narrator': {
    project: 'the-prompt', role: 'news-narrator', name: 'Victoria',
    voiceId: VICTORIA_VOICE_ID, modelId: BRAND_MODEL,
    source: 'apps/web/lib/voice/config.ts',
  },
  'familje-stunden:november-story-narrator': {
    project: 'familje-stunden', role: 'november-story-narrator',
    name: 'Sanna Hartfield (narrator, NOT Nova/Pling)',
    voiceId: 'ZSHzpa6aUvhjzShiBmYw', modelId: 'eleven_v3',
    source: 'familje-stunden-v2/docs/month-experience/NOVEMBER_SANNA_AUDIO_REQUIRED.json',
  },
  'familje-stunden:december-story-narrator': {
    project: 'familje-stunden', role: 'december-story-narrator',
    name: 'Sanna Hartfield (narrator, NOT Nova/Pling)',
    voiceId: 'ZSHzpa6aUvhjzShiBmYw', modelId: 'eleven_v3',
    source: 'familje-stunden-v2/docs/december-2026/STORY_ORIGINAL_VERIFIED_TRANSCRIPTS.json',
  },
  'familje-stunden:december-calendar-instructions': {
    project: 'familje-stunden', role: 'december-calendar-instructions',
    name: 'Pling (December instructions variant)',
    voiceId: 'vhPZICLLz0UIRNLnUe0u', modelId: 'eleven_v4',
    source: 'familje-stunden-v2/docs/december-2026/CALENDAR_INSTRUCTIONS_V3_AUDIO.json',
  },
})

/** Unknown roles, including character dialogue, block rather than use a default. */
export function requirePinnedContentVoice(
  project: ContentVoiceProject, role: ContentVoiceRole,
): PinnedContentVoice {
  const pin = PINS[project + ':' + role]
  if (!pin) throw new Error(
    'VOICE_LOCK_UNVERIFIED: No proven ElevenLabs voice for ' +
    project + '/' + role + '. Verify approved historical reference audio first.',
  )
  return pin
}

/** Validate explicit ID AND model before separately authorized TTS dispatch. */
export function assertPinnedContentVoice(
  project: ContentVoiceProject, role: ContentVoiceRole,
  voiceId: string, modelId: string,
): PinnedContentVoice {
  const pin = requirePinnedContentVoice(project, role)
  if (pin.voiceId !== voiceId || pin.modelId !== modelId) {
    throw new Error('VOICE_LOCK_MISMATCH: ' + project + '/' + role)
  }
  return pin
}
