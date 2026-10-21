import type { InboxAudience } from './handlarborsen-candidate-inbox-service'

export const INBOX_RECEIPT_EVENT = 'omnira:competitor-inbox-receipt'
export const inboxLinks = {
  owner: {
    api: '/api/projects/handlarborsen/competitors/inbox',
    page: '/projects/handlarborsen/competitors#hb-atlas-inbox-title',
  },
  collaborator: {
    api: '/api/organization/projects/handlarborsen/competitors/inbox',
    page: '/organization/projects/handlarborsen/competitors#hb-atlas-inbox-title',
  },
} as const
export type InboxSummaryState =
  | { status: 'hidden' | 'loading' | 'unavailable' }
  | { status: 'ok'; unreadCount: number; totalCount: number }

/** A failed/malformed response can never become a verified zero. */
export function parseInboxSummary(input: unknown): InboxSummaryState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 'unavailable' }
  const row = input as Record<string, unknown>
  if (Object.keys(row).length !== 3 || row.status !== 'ok'
    || !Number.isInteger(row.unreadCount) || !Number.isInteger(row.totalCount)
    || typeof row.unreadCount !== 'number' || typeof row.totalCount !== 'number'
    || row.unreadCount < 0 || row.totalCount > 30 || row.unreadCount > row.totalCount)
    return { status: 'unavailable' }
  return { status: 'ok', unreadCount: row.unreadCount, totalCount: row.totalCount }
}

/** One shell resource, no polling or persistent browser cache. Refreshes are reads only. */
export function createInboxSummaryResource(
  audience: InboxAudience,
  publish: (state: InboxSummaryState) => void,
  deps: { fetch: typeof fetch; now: () => number } = { fetch: (...args) => fetch(...args), now: Date.now },
) {
  let disposed = false
  let generation = 0
  let lastAttempt = -Infinity
  let active: AbortController | null = null
  return {
    async refresh(force = false): Promise<void> {
      if (disposed || (!force && (active || deps.now() - lastAttempt < 30_000))) return
      active?.abort()
      const controller = new AbortController()
      active = controller
      const current = ++generation
      lastAttempt = deps.now()
      publish({ status: 'loading' })
      const timeout = setTimeout(() => controller.abort(), 10_000)
      let state: InboxSummaryState
      try {
        const response = await deps.fetch(inboxLinks[audience].api, {
          method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        })
        state = [401,403,404,409].includes(response.status) ? { status: 'hidden' }
          : response.ok ? parseInboxSummary(await response.json()) : { status: 'unavailable' }
      } catch {
        state = { status: 'unavailable' }
      } finally {
        clearTimeout(timeout)
      }
      if (!disposed && current === generation) {
        active = null
        publish(state)
      }
    },
    dispose() {
      disposed = true
      generation++
      active?.abort()
      active = null
    },
  }
}
