import * as React from 'react'
import Link from 'next/link'
import type { CandidateMemoryLoad } from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'
import type { CandidateReviewLoad } from '@/lib/atlas/project-analytics/handlarborsen-candidate-review-service'
import { deriveCandidateReviewNotice } from '@/lib/atlas/project-analytics/handlarborsen-candidate-review-notice'

type Role = 'owner' | 'collaborator'
const destinations: Record<Role, string> = {
  owner: '/projects/handlarborsen/competitors',
  collaborator: '/organization/projects/handlarborsen/competitors',
}

/**
 * On-platform project review cue. It does not deliver a push notification and
 * must not call a candidate "unread" until acknowledgements are persisted.
 */
export function HandlarborsenCandidateReviewNotice({
  memory,
  enabled,
  audience,
  reviews = null,
  reviewEnabled = false,
}: {
  memory: CandidateMemoryLoad | null
  enabled: boolean
  audience: Role
  reviews?: CandidateReviewLoad | null
  reviewEnabled?: boolean
}) {
  const cue = deriveCandidateReviewNotice(enabled, memory, reviews, reviewEnabled)
  if (cue.state === 'hidden') return null
  const headingId = 'hb-candidate-review-notice'
  return <section
    aria-labelledby={headingId}
    data-review-state={cue.state}
    className="mb-5 rounded-xl border border-cyan-400/25 bg-slate-900/75 p-5 text-slate-100"
  >
    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
      Atlas · Konkurrentspaning
    </p>
    {cue.state === 'unavailable'
      ? <>
          <h3 id={headingId} className="mb-2 text-base font-semibold">Kandidatminnet kan inte läsas</h3>
          <p className="text-sm text-slate-300">
            Underlaget kunde inte verifieras. Antalet väntande granskningar är okänt, inte noll.
          </p>
        </>
      : <>
          <h3 id={headingId} className="mb-2 text-base font-semibold">
            {cue.count} {cue.count === 1 ? 'konkurrentkandidat' : 'konkurrentkandidater'} att granska
          </h3>
          <p className="mb-1 text-sm text-slate-200">
            Senast registrerad i Omnira: <strong>{cue.latest.name}</strong>{' '}
            <time dateTime={cue.latest.firstSeenAt}>{cue.latest.firstSeenAt.slice(0, 10)}</time>.
          </p>
          <p className="mb-3 text-xs text-slate-400">
            En ny kandidat i Omnira innebär inte att företaget är nystartat.
            Detta är en granskningspåminnelse, inte en skickad avisering eller ett godkännande.
          </p>
          <Link
            href={destinations[audience]}
            className="inline-flex min-h-11 items-center rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/15"
          >
            Granska källor och kandidat →
          </Link>
        </>
    }
  </section>
}
