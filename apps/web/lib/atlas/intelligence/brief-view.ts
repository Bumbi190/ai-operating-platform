/**
 * lib/atlas/intelligence/brief-view.ts
 * Pure view adapter: apex Executive Brief → the columns the Atlas page renders.
 *
 * The Atlas page has rendered three string columns since before Executive
 * Intelligence existed ("Vad funkade" / "Vad föll" / "Kräver uppmärksamhet").
 * This adapter feeds those exact columns from the conformant `executive_brief`
 * so the live surface changes its SOURCE without changing its LAYOUT.
 *
 * Pure and zero-I/O so the mapping is unit-testable without a page render.
 * It performs no selection beyond the canonical direction split — ranking and
 * attention gating already happened inside the producer (§10).
 */

import type { ExecutiveBriefBody, ExecutiveBriefSection } from './types'

export interface ExecutiveBriefColumns {
  /** Positive-direction material change and interpretation. */
  whatWorked: string[]
  /** Negative-direction material change and interpretation. */
  whatFailed: string[]
  /** The short list the founder actually has to look at (§13.1 §5). */
  needsAttention: string[]
}

function render(section: ExecutiveBriefSection): string {
  return section.label ? `${section.label}: ${section.detail}` : section.detail
}

export function executiveBriefColumns(body: ExecutiveBriefBody): ExecutiveBriefColumns {
  const reasoned = [...body.whatChanged, ...body.whatItMeans]

  const whatWorked = reasoned.filter(s => s.direction === 'positive').map(render)
  const whatFailed = reasoned.filter(s => s.direction === 'negative').map(render)
  const needsAttention = body.whatNeedsYou.map(render)

  return {
    // §8.17 — say plainly that nothing material changed rather than render a
    // blank column that reads like missing data.
    whatWorked: whatWorked.length > 0 ? whatWorked
      : body.noMaterialChange ? ['Ingen väsentlig positiv förändring i perioden.'] : [],
    whatFailed: whatFailed.length > 0 ? whatFailed
      : body.noMaterialChange ? ['Ingen väsentlig negativ förändring i perioden.'] : [],
    needsAttention: needsAttention.length > 0 ? needsAttention
      : ['Inget kräver ditt beslut just nu.'],
  }
}
