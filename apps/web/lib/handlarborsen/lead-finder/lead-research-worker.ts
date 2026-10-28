import 'server-only'
import type { LocalReview } from './local-review'
import {
  buildResearchQueue, evaluateLeadEvidence, LEAD_RESEARCH_MAX_OBSERVATIONS,
  type LeadEvidenceResult, type ResearchJob,
} from './lead-research'

/**
 * Atlas Lead Research Worker v1 - server-only orchestration with an INJECTED adapter.
 * There is no default adapter, no network, no scheduling, no env access and no database write.
 * Without an adapter the worker is blocked; it never fabricates research.
 */
export const WORKER_MAX_JOBS = 5
export const WORKER_DEFAULT_TIMEOUT_MS = 10_000
export const WORKER_MAX_TIMEOUT_MS = 15_000

/** An adapter turns one bounded research job into raw observations. Output is untrusted and re-validated. */
export interface SearchAdapter {
  readonly name: string
  collect(job: ResearchJob, signal: AbortSignal): Promise<unknown>
}

export type ResearchRunResult =
  | { status: 'blocked'; reason: 'adapter_absent' | string; results: []; calls: 0; outreachReady: false }
  | { status: 'completed'; results: LeadEvidenceResult[]; calls: number; outreachReady: false }

export interface ResearchRunOptions {
  review: LocalReview
  adapter?: SearchAdapter | null
  limit?: number
  offset?: number
  timeoutMs?: number
}

const blocked = (reason: string): ResearchRunResult => ({ status: 'blocked', reason, results: [], calls: 0, outreachReady: false })

function withTimeout<T>(work: Promise<T>, ms: number, abort: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort()
      reject(new Error('timeout'))
    }, ms)
  })
  return Promise.race([work, timeout]).finally(() => { if (timer) clearTimeout(timer) })
}

const failedJob = (job: ResearchJob, reason: string): LeadEvidenceResult => ({
  ...evaluateLeadEvidence(job, []), reasons: [reason],
})

export async function runLeadResearch(options: ResearchRunOptions): Promise<ResearchRunResult> {
  const adapter = options.adapter
  if (!adapter || typeof adapter.collect !== 'function') return blocked('adapter_absent')

  const queue = buildResearchQueue(options.review, Math.min(options.limit ?? WORKER_MAX_JOBS, WORKER_MAX_JOBS), options.offset ?? 0)
  if (queue.status !== 'ready') return blocked(queue.reason)

  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.min(Math.max(options.timeoutMs as number, 1), WORKER_MAX_TIMEOUT_MS)
    : WORKER_DEFAULT_TIMEOUT_MS

  const results: LeadEvidenceResult[] = []
  let calls = 0
  for (const job of queue.jobs.slice(0, WORKER_MAX_JOBS)) {
    calls += 1
    try {
      const abort = new AbortController()
      const raw = await withTimeout(Promise.resolve(adapter.collect(job, abort.signal)), timeoutMs, abort)
      const observations = Array.isArray(raw) ? raw.slice(0, LEAD_RESEARCH_MAX_OBSERVATIONS + 1) : raw
      results.push(evaluateLeadEvidence(job, observations))
    } catch {
      // Error text from an adapter is never surfaced: it could carry URLs or page content.
      results.push(failedJob(job, 'adapter_failed'))
    }
  }
  return { status: 'completed', results, calls, outreachReady: false }
}
