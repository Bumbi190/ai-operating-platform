/**
 * `/intelligence/graph` before vNext — the page body, moved here verbatim.
 *
 * Reachable at `?ui=legacy` (or with the `omnira_ui=legacy` cookie). Nothing in
 * it changed in the move: the same header, the same `calc(100vh-4rem)` height
 * that assumes the legacy CommandBar, and the same IntelligenceGraphClient. The
 * rollback is the page that shipped, not a re-creation of it — pinned by hash in
 * lib/qa/vnext-intelligence-graph.test.ts.
 *
 * Auth: enforced by the (platform) layout (redirects to /login without a
 * session) AND by every /api/intelligence/graph/* route the client calls.
 * The page itself carries no data — everything arrives through the
 * authenticated API, already validated and project-scoped server-side.
 */

import { IntelligenceGraphClient } from '@/components/platform/intelligence/IntelligenceGraphClient'

export function IntelligenceGraphLegacy() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 p-4 md:p-6">
      <header className="shrink-0">
        <p className="text-[11px] uppercase tracking-[0.2em] text-indigo-300/70">Atlas Intelligence</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">Intelligence Graph</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Hur Omniras arkitektur hänger ihop — och vad systemet gör just nu. System Map bygger på en
          lokal Graphify-indexering av kodbasen; Live Operations läser verklig körningsdata.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <IntelligenceGraphClient />
      </div>
    </div>
  )
}
