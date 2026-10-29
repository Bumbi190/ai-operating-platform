import type { ScbRegisterRecord } from './types'

/**
 * Contract boundary for the SCB register: pagination, rate limiting and retry.
 * The HTTP adapter implementing `ScbPageFetcher` lives in `scb-client.ts`; it
 * is gated off until live search is explicitly approved (see `readiness.ts`).
 */

export const SCB_LIMITS = Object.freeze({
  /** Documented maximum rows per request. */
  maxPageSize: 5000,
  /** Documented hard limit is 5 req/s; we stay below it. */
  maxRequestsPerSecond: 4,
})

export interface ScbPage {
  rows: ScbRegisterRecord[]
  /** Opaque continuation; null/undefined on the last page. */
  nextCursor?: string | null
}

export type ScbPageFetcher = (req: { cursor: string | null; pageSize: number }) => Promise<ScbPage>

export class ScbKeyMissingError extends Error {
  constructor() {
    super('SCB_API_KEY is not configured')
    this.name = 'ScbKeyMissingError'
  }
}

export class ScbHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs?: number) {
    super(`SCB request failed with status ${status}`)
    this.name = 'ScbHttpError'
  }
}

/** Server-only. Never log or return the value. */
export function requireScbApiKey(env: Record<string, string | undefined> = process.env): string {
  const key = env.SCB_API_KEY?.trim()
  if (!key) throw new ScbKeyMissingError()
  return key
}

export interface PaginateOptions {
  pageSize?: number
  /** Hard cap on requests per run — protects against runaway/expensive jobs. */
  maxPages?: number
  /** Stop once this many rows were collected. */
  maxRows?: number
  maxRetries?: number
  requestsPerSecond?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export interface PaginateResult {
  rows: ScbRegisterRecord[]
  pages: number
  truncated: boolean
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function paginateScb(fetchPage: ScbPageFetcher, opts: PaginateOptions = {}): Promise<PaginateResult> {
  const requestedPageSize = opts.pageSize ?? 1000
  const requestedRps = opts.requestsPerSecond ?? SCB_LIMITS.maxRequestsPerSecond
  if (!(requestedPageSize > 0)) throw new RangeError('pageSize must be greater than 0')
  if (!(requestedRps > 0)) throw new RangeError('requestsPerSecond must be greater than 0')
  const pageSize = Math.min(requestedPageSize, SCB_LIMITS.maxPageSize)
  const maxPages = opts.maxPages ?? 5
  const maxRows = opts.maxRows ?? Infinity
  const maxRetries = opts.maxRetries ?? 4
  const rps = Math.min(requestedRps, SCB_LIMITS.maxRequestsPerSecond)
  const minGap = Math.ceil(1000 / rps)
  const sleep = opts.sleep ?? defaultSleep
  const now = opts.now ?? Date.now

  const rows: ScbRegisterRecord[] = []
  let cursor: string | null = null
  let pages = 0
  let lastRequestAt = -Infinity
  let truncated = false

  while (pages < maxPages && rows.length < maxRows) {
    let attempt = 0
    let page: ScbPage
    for (;;) {
      const wait = lastRequestAt + minGap - now()
      if (wait > 0) await sleep(wait)
      lastRequestAt = now()
      try {
        page = await fetchPage({ cursor, pageSize })
        break
      } catch (err) {
        const status = err instanceof ScbHttpError ? err.status : 0
        const retryable = status === 429 || status >= 500
        if (!retryable || attempt >= maxRetries) throw err
        const backoff = err instanceof ScbHttpError && err.retryAfterMs ? err.retryAfterMs : 500 * 2 ** attempt
        attempt++
        await sleep(backoff)
      }
    }
    pages++
    rows.push(...page.rows)
    cursor = page.nextCursor ?? null
    if (!cursor) return { rows: rows.slice(0, maxRows), pages, truncated: rows.length > maxRows }
  }
  truncated = true
  return { rows: rows.slice(0, maxRows), pages, truncated }
}
