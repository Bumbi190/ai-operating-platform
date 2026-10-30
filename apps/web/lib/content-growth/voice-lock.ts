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
  /** Exact verified postprocessing profile when present; not an executable FFmpeg instruction. */
  readonly processingProfile?: string
}

/**
 * Rejected by the owner on 2026-10-17 after listening to the preview.
 * Despite the ElevenLabs display name and metadata, this is NOT Nova.
 * Keep this denylist explicit even if a future pin is accidentally added.
 */
export const REJECTED_NOVA_VOICE_IDS = Object.freeze(['I0uKCr8dyBq1Ouru7CWl'] as const)

export function isRejectedNovaVoiceId(voiceId: string): boolean {
  return REJECTED_NOVA_VOICE_IDS.some((id) => id === voiceId)
}

/**
 * APPROVED BY THE OWNER on 2026-10-17 after listening to the September
 * 2026 canonical Känslomånaden social-video source recording.
 *
 * This is a verified *audio sample*, NOT a verified ElevenLabs voice ID.
 * Keep the Nova dialogue TTS role BLOCKED until original generation provenance
 * is recovered. The source WAV is never copied into the Git repository.
 */
export const NOVA_APPROVED_AUDIO_REFERENCE = Object.freeze({
  project: 'familje-stunden' as const,
  character: 'nova' as const,
  sourcePath: 'Månads Teman 2026/Känslomånaden-V2/Social-content/Final/källfiler-ljud/nova_final.wav',
  sha256: '17326af9e0ae82fab4749b5dcd52f59457ae069b8f1044c9659776af0e42b66d',
  bytes: 483918,
  durationMs: 5040,
  ownerApprovedOn: '2026-10-17',
  elevenLabsVoiceId: null,
  provenance: 'Approved September 2026 Känslomånaden social master source; provider generation receipt not yet found',
})

/** Verifies that a reference sample is exactly the approved file; grants NO TTS authority. */
export function assertApprovedNovaAudioSha256(sha256: string): typeof NOVA_APPROVED_AUDIO_REFERENCE {
  if (sha256.toLowerCase() !== NOVA_APPROVED_AUDIO_REFERENCE.sha256) {
    throw new Error('NOVA_REFERENCE_MISMATCH: audio file differs from owner-approved sample')
  }
  return NOVA_APPROVED_AUDIO_REFERENCE
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
  'familje-stunden:pling-dialogue': {
    project: 'familje-stunden', role: 'pling-dialogue',
    name: 'Pling - approved Alternative B character voice',
    voiceId: 'vhPZICLLz0UIRNLnUe0u', modelId: 'eleven_v4',
    source: 'Owner approval 2026-10-13 (Alternative B); December 2026 Pling dialogue, plus CALENDAR_INSTRUCTIONS_V3_AUDIO.json',
    // Identity alone is not enough: approved clips also used a brighter post-processing profile.
    processingProfile: 'pling-alternative-b-december-2026',
  },
  'familje-stunden:december-calendar-instructions': {
    project: 'familje-stunden', role: 'december-calendar-instructions',
    name: 'Pling (December instructions variant)',
    voiceId: 'vhPZICLLz0UIRNLnUe0u', modelId: 'eleven_v4',
    source: 'familje-stunden-v2/docs/december-2026/CALENDAR_INSTRUCTIONS_V3_AUDIO.json',
    processingProfile: 'pling-alternative-b-december-2026',
  },
})

/** Unknown or unverified roles (notably Nova dialogue) block rather than use a default. */
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
  if (project === 'familje-stunden' && role === 'nova-dialogue' && isRejectedNovaVoiceId(voiceId)) {
    throw new Error('VOICE_ID_REJECTED_BY_OWNER: This preview was explicitly rejected as NOT Nova')
  }
  const pin = requirePinnedContentVoice(project, role)
  if (pin.voiceId !== voiceId || pin.modelId !== modelId) {
    throw new Error('VOICE_LOCK_MISMATCH: ' + project + '/' + role)
  }
  return pin
}

/**
 * Extra preview/render boundary. It rejects mixing an approved voice with
 * unverified post-processing. Does NOT run the DSP chain or generate speech.
 * Call this in the future governed Content Studio TTS adapter before dispatch.
 */
export function assertPinnedContentVoiceForRender(
  project: ContentVoiceProject,
  role: ContentVoiceRole,
  voiceId: string,
  modelId: string,
  processingProfile?: string,
): PinnedContentVoice {
  const pin = assertPinnedContentVoice(project, role, voiceId, modelId)
  if (pin.processingProfile && processingProfile !== pin.processingProfile) {
    throw new Error('VOICE_PROCESSING_PROFILE_MISMATCH: ' + project + '/' + role)
  }
  if (!pin.processingProfile && processingProfile) {
    throw new Error('VOICE_PROCESSING_PROFILE_UNAPPROVED: ' + project + '/' + role)
  }
  return pin
}
