import type { CandidateMemoryLoad } from './handlarborsen-competitor-memory-service'

type NoticeState =
  | { state: 'hidden' }
  | { state: 'unavailable' }
  | {
      state: 'pending'
      count: number
      latest: { name: string; host: string; firstSeenAt: string }
    }

const maxCandidates = 30
const validHost = /^[a-z0-9][a-z0-9.-]{2,159}$/

/**
 * A read-only Atlas PROJECT cue derived from validated candidate memory.
 * NOT an unread notification count, not a message delivery, and not a
 * substitute for the separate human review decision history.
 *
 * False data must never silently become "0 candidates".
 */
export function deriveCandidateReviewNotice(
  enabled: boolean,
  memory: CandidateMemoryLoad | null,
): NoticeState {
  if (!enabled) return { state: 'hidden' }
  if (!memory || memory.status !== 'ok') return { state: 'unavailable' }
  const { candidates, awaitingReview } = memory
  if (!Array.isArray(candidates) || candidates.length > maxCandidates
    || !Number.isInteger(awaitingReview) || awaitingReview !== candidates.length)
    return { state: 'unavailable' }
  if (candidates.length === 0) return { state: 'hidden' }
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (candidate.lifecycle !== 'candidate_for_review'
      || candidate.foundedRecently !== 'not_verified'
      || candidate.executable !== false
      || typeof candidate.host !== 'string'
      || !validHost.test(candidate.host)
      || typeof candidate.name !== 'string'
      || candidate.name.length < 1 || candidate.name.length > 90
      || candidate.name !== candidate.name.trim()
      || typeof candidate.firstSeenAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(candidate.firstSeenAt)
      || !Number.isFinite(Date.parse(candidate.firstSeenAt))
      || seen.has(candidate.host)) return { state: 'unavailable' }
    seen.add(candidate.host)
  }
  const [latest] = [...candidates].sort((a, b) =>
    b.firstSeenAt.localeCompare(a.firstSeenAt) || a.host.localeCompare(b.host))
  return {
    state: 'pending',
    count: candidates.length,
    latest: { name: latest.name, host: latest.host, firstSeenAt: latest.firstSeenAt },
  }
}
