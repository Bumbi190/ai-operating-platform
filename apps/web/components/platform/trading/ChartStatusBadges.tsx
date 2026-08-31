import React from 'react'
import type { TradingMarketViewSnapshot } from '@/lib/trading/market-view'
import { originBadgeOf, proposalBadgeOf } from './chart-presentation'
import styles from './AtlasMarketView.module.css'

/**
 * Omnira Trading — what this chart is, stated on the chart.
 *
 * WHY THIS SITS ON THE CHART AND NOT IN A PANEL
 * ─────────────────────────────────────────────
 * An interactive chart with Entry, SL and TP drawn across it looks like a
 * position at a broker. It is not one: the data is a fixture and the proposal
 * is explicitly non-executable. An operator who has to look somewhere else to
 * learn that is an operator who will eventually not look.
 *
 * BOTH BADGES READ MACHINE-READABLE FIELDS
 * ────────────────────────────────────────
 * `provenance.origin` and `tradeProposal.status` are closed vocabularies on the
 * model. Neither badge is inferred from `sourceLabel` or any other prose, so a
 * fixture cannot word its way into looking live, and there is no configuration
 * that turns FIXTURE into LIVE — the mapping is total and has no other input.
 *
 * The proposal vocabulary is deliberately non-executable and stays that way:
 * there is no APPROVED, SUBMITTED or FILLED here, because this model has no
 * execution state to describe.
 */
export function ChartStatusBadges({ snapshot }: { snapshot: TradingMarketViewSnapshot }) {
  const origin = originBadgeOf(snapshot)
  const proposal = proposalBadgeOf(snapshot)

  return (
    <div className={styles.chartBadges} data-testid="chart-status-badges">
      <span
        className={styles.chartOriginBadge}
        data-tone={origin.tone}
        data-testid="chart-origin-badge"
      >
        {origin.text}
      </span>
      <span className={styles.chartProposalBadge} data-testid="chart-proposal-badge">
        {proposal.text}
      </span>
    </div>
  )
}
