/** The Prompt: retry only technical editorial failures, never factual rejections. */
export interface QualityRetryDraft {
  project_id: string | null
  status: string | null
  version: number | null
  generated_at: string
  published_at: string | null
  voice_status: string | null
  video_status: string | null
  audio_url: string | null
  video_url: string | null
  quality_score: unknown
}

const TECHNICAL_PREFIXES = [
  'Quality check timed out',
  'Quality check invalid or malformed',
  'Quality check truncated',
  'Quality evaluator request failed',
  'No time left for editorial QA',
  'Rewritten script was not re-scored in time',
  'Quality check failed',
]

export function recoverableQualityFailure(score: unknown): boolean {
  if (!score || typeof score !== 'object' || Array.isArray(score)) return false
  const record = score as Record<string, unknown>
  return record.passed === false && typeof record.verdict === 'string'
    && TECHNICAL_PREFIXES.some(prefix => (record.verdict as string).startsWith(prefix))
}

export function eligibleForTechnicalQualityRetry(
  row: QualityRetryDraft, expectedProjectId: string, nowMs: number,
): boolean {
  const createdMs = Date.parse(row.generated_at)
  return row.project_id === expectedProjectId
    && row.status === 'pending_review' && (row.version === 1 || row.version === 2)
    && row.published_at === null && row.audio_url === null && row.video_url === null
    && (row.voice_status === 'none' || row.voice_status === null)
    && (row.video_status === 'none' || row.video_status === null)
    && Number.isFinite(createdMs) && createdMs <= nowMs
    && nowMs - createdMs <= 6 * 60 * 60 * 1000
    && recoverableQualityFailure(row.quality_score)
}

export function sufficientSourceForRetry(source: {
  title?: string | null
  summary?: string | null
  url?: string | null
} | null): boolean {
  return !!source && typeof source.title === 'string' && source.title.length >= 10
    && typeof source.summary === 'string' && source.summary.trim().length >= 80
    && typeof source.url === 'string' && source.url.startsWith('https://')
}
