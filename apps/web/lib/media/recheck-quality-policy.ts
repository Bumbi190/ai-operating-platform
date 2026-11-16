/** Pure preflight for rescoring an existing The Prompt draft. Never bypass editorial QA. */
export interface RecheckDraft {
  id: string
  project_id: string | null
  status: string | null
  version: number | null
  voice_status: string | null
  video_status: string | null
  audio_url: string | null
  video_url: string | null
  published_at: string | null
}

export type RecheckInput = { expectedVersion: number; hook: string; script: string; captions: string[]; cta: string }

export function validateRecheckInput(value: unknown): RecheckInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (Object.keys(input).sort().join(',') !== 'captions,cta,expectedVersion,hook,script') return null
  if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 1) return null
  if (typeof input.hook !== 'string' || input.hook.trim().length < 8 || input.hook.length > 250) return null
  if (typeof input.script !== 'string' || input.script.trim().length < 40 || input.script.length > 2500) return null
  if (!Array.isArray(input.captions) || input.captions.length < 2 || input.captions.length > 8 ||
      input.captions.some(s => typeof s !== 'string' || !s.trim() || s.length > 120)) return null
  if (typeof input.cta !== 'string' || !input.cta.trim() || input.cta.length > 180) return null
  return { expectedVersion: input.expectedVersion as number, hook: input.hook.trim(), script: input.script.trim(),
    captions: (input.captions as string[]).map(s => s.trim()), cta: input.cta.trim() }
}

export function eligibleForRecheck(row: RecheckDraft, input: RecheckInput): boolean {
  return !!row.project_id && row.status === 'pending_review' &&
    row.version === input.expectedVersion && row.published_at === null &&
    (row.voice_status === 'none' || row.voice_status === null) &&
    (row.video_status === 'none' || row.video_status === null) &&
    row.audio_url === null && row.video_url === null
}
