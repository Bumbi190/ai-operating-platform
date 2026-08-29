import React from 'react'
import {
  LIFECYCLE_LABELS,
  observedOrNull,
  plannedTradeIsExecutable,
  type ObservedPosition,
  type ObservedValue,
  type PlannedTradeView,
} from '@/lib/trading/replay'
import { PanelSection, PriceValue, StatePill, UnknownValue, ValueRow } from './primitives'
import { DirectionPill, GradeBadge } from './panels'
import styles from './AtlasMarketView.module.css'

/**
 * The two halves of the future right rail: what the system PLANS, and what is
 * actually OPEN.
 *
 * They are rendered as two panels with different headings, different vocabulary
 * and different colour treatment, because they answer different questions and
 * can disagree. A planned trade is an idea Omnira had; an observed position is
 * exposure a provider reports. Reading one as the other is the mistake this
 * separation exists to prevent, so neither panel ever borrows the other's words:
 * a plan is never "open", a position is never "proposed".
 *
 * Stage 1.5 keeps them inside the existing layout. The graph-first redesign
 * comes later.
 */

/** Render an `ObservedValue`, distinguishing all three states in words. */
function ObservedReading<T extends string | number>({
  value,
  suffix,
}: {
  value: ObservedValue<T>
  suffix?: string
}) {
  if (value.state === 'PRESENT') {
    return (
      <span className={styles.priceValue}>
        {value.value}
        {suffix ? <span className={styles.priceSuffix}>{suffix}</span> : null}
      </span>
    )
  }
  // UNAVAILABLE and UNKNOWN are different claims — "this provider does not
  // report it" versus "we have not been told" — and never collapse to a dash.
  return <UnknownValue label={value.state === 'UNAVAILABLE' ? 'RAPPORTERAS EJ' : 'OKÄND'} />
}

// ─── Planned trades ───────────────────────────────────────────────────────────

export function PlannedTradesPanel({ plans }: { plans: readonly PlannedTradeView[] }) {
  return (
    <PanelSection
      eyebrow="Planned"
      title="Planerade trades"
      right={<StatePill tone="unknown">{plans.length === 0 ? 'INGA' : `${plans.length}`}</StatePill>}
    >
      {plans.length === 0 ? (
        <p className={styles.panelNote} data-testid="planned-empty">
          Ingen planerad trade vid denna punkt i replayen.
        </p>
      ) : null}

      {plans.map((plan) => {
        const executable = plannedTradeIsExecutable(plan)
        return (
          <article key={plan.plannedTradeId} className={styles.plannedCard} data-testid="planned-trade">
            <header className={styles.plannedHeader}>
              <span className={styles.plannedInstrument}>{plan.instrument}</span>
              <DirectionPill direction={plan.direction} />
              <GradeBadge grade={plan.grade} />
              <StatePill tone={plan.lifecycle === 'BLOCKED' ? 'negative' : 'unknown'}>
                {LIFECYCLE_LABELS[plan.lifecycle]}
              </StatePill>
            </header>

            <dl className={styles.valueList}>
              <ValueRow label="Entry" value={<PriceValue value={plan.entry} />} />
              <ValueRow label="SL" value={<PriceValue value={plan.stopLoss} />} />
              <ValueRow label="TP" value={<PriceValue value={plan.takeProfit} />} />
              <ValueRow label="R:R" value={<PriceValue value={plan.riskReward} />} />
              <ValueRow label="Föreslagen risk" value={<PriceValue value={plan.proposedRisk} suffix="USD" />} />
            </dl>

            <p className={styles.panelNote}>{plan.reason}</p>
            <p
              className={styles.executionBoundary}
              data-executable={executable || undefined}
              data-testid="planned-boundary"
            >
              Plan, inte order. Det finns ingen orderväg i detta bygge.
            </p>
          </article>
        )
      })}

      <p className={styles.panelFootnote}>
        En planerad trade är vad systemet skulle föreslå. Den har aldrig varit hos en broker.
      </p>
    </PanelSection>
  )
}

// ─── Observed positions ───────────────────────────────────────────────────────

const POSITION_STATE_LABELS = {
  OPEN: 'ÖPPEN',
  CLOSED: 'STÄNGD',
  UNKNOWN: 'OKÄND',
} as const

export function ObservedPositionsPanel({ positions }: { positions: readonly ObservedPosition[] }) {
  return (
    <PanelSection
      eyebrow="Observed"
      title="Observerade positioner"
      right={<StatePill tone="unknown">{positions.length === 0 ? 'INGA' : `${positions.length}`}</StatePill>}
    >
      {positions.length === 0 ? (
        <p className={styles.panelNote} data-testid="observed-empty">
          Ingen observerad position vid denna punkt i replayen.
        </p>
      ) : null}

      {positions.map((position) => (
        <article
          key={position.positionId}
          className={styles.observedCard}
          data-testid="observed-position"
          data-stale={position.freshness !== 'FRESH' || undefined}
        >
          <header className={styles.plannedHeader}>
            <span className={styles.plannedInstrument}>{position.instrument}</span>
            <DirectionPill direction={position.direction} />
            <StatePill tone={position.state === 'UNKNOWN' ? 'unknown' : 'warning'}>
              {POSITION_STATE_LABELS[position.state]}
            </StatePill>
          </header>

          {/*
            Provenance on every card. A fixture position must never be mistaken
            for a real brokerage position, and the label says so on the card
            itself rather than only in a page-level banner.
          */}
          <p className={styles.observedSource} data-testid="observed-source">
            {position.source.origin} · {position.source.providerLabel}
            {position.source.accountLabel === null ? ' · inget konto' : ` · ${position.source.accountLabel}`}
          </p>

          <dl className={styles.valueList}>
            <ValueRow label="Antal" value={<ObservedReading value={position.quantity} />} />
            <ValueRow label="Snittpris" value={<ObservedReading value={position.averageEntry} />} />
            <ValueRow label="Senaste pris" value={<ObservedReading value={position.lastPrice} />} />
            <ValueRow label="Orealiserad P/L" value={<ObservedReading value={position.unrealizedPnl} suffix="USD" />} />
            <ValueRow label="SL (observerad)" value={<ObservedReading value={position.stopLoss} />} />
            <ValueRow label="TP (observerad)" value={<ObservedReading value={position.takeProfit} />} />
            <ValueRow
              label="Öppnad"
              value={
                observedOrNull(position.openedAt) === null
                  ? <ObservedReading value={position.openedAt} />
                  : <span className={styles.priceValue}>{observedOrNull(position.openedAt)}</span>
              }
            />
          </dl>

          {position.unattributed ? (
            <p className={styles.panelNote} data-testid="observed-unattributed">
              Ingen matchande plan. Positionen är observerad, inte föreslagen av Omnira.
            </p>
          ) : null}
          {position.note ? <p className={styles.panelNote}>{position.note}</p> : null}
        </article>
      ))}

      <p className={styles.panelFootnote}>
        Observerad position = faktisk exponering enligt provider. Fixturdata i detta bygge —
        ingen broker är ansluten.
      </p>
    </PanelSection>
  )
}
