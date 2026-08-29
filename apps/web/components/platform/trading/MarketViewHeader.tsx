import React from 'react'
import {
  INSTRUMENT_LABELS,
  MARKET_INSTRUMENTS,
  MARKET_TIMEFRAMES,
  resolveSafetyBanner,
  type MarketInstrument,
  type MarketTimeframe,
  type SafetyBanner,
  type TradingMarketViewSnapshot,
} from '@/lib/trading/market-view'
import styles from './AtlasMarketView.module.css'

/**
 * The command strip: instrument, timeframe, session, and — most importantly —
 * what kind of data is on screen.
 *
 * The safety banner is the loudest element in the header by design. A market
 * workspace that looks like a trading terminal must never let a reader assume
 * the numbers are live, so provenance is stated in words at the top, repeated
 * on the chart frame, and repeated again in the proposal panel. Three
 * independent statements, none of which depends on the reader noticing a colour.
 */

const BANNER_COPY: Readonly<Record<SafetyBanner, { label: string; detail: string }>> = {
  FIXTURE: {
    label: 'FIXTURDATA',
    detail: 'Deterministisk lokal data. Ingen marknadsanslutning.',
  },
  SIMULATION: {
    label: 'SIMULERING',
    detail: 'Icke-live providermiljö.',
  },
  LIVE: {
    label: 'LIVE',
    detail: 'Riktigt kapital.',
  },
  STALE: {
    label: 'INAKTUELL',
    detail: 'Senaste observationen är för gammal för att behandlas som aktuell.',
  },
  UNKNOWN: {
    label: 'OKÄND',
    detail: 'Datans aktualitet kan inte fastställas.',
  },
  BLOCKED: {
    label: 'BLOCKERAD',
    detail: 'Riskläget tillåter ingen handling.',
  },
}

const SESSION_STATE_LABELS = {
  BEFORE: 'före',
  OPEN: 'öppen',
  AFTER: 'stängd',
  UNKNOWN: 'okänd',
} as const

const LOAD_COPY = {
  LOADING: { label: 'LADDAR', detail: 'Hämtar tidslinje från källan.' },
  UNAVAILABLE: { label: 'EJ TILLGÄNGLIG', detail: 'Källan har ingen tidslinje för detta urval.' },
  ERROR: { label: 'KÄLLFEL', detail: 'Tidslinjen kunde inte hämtas.' },
} as const

export interface MarketViewHeaderProps {
  /**
   * Null while the source is loading, unavailable or failed.
   *
   * Deliberately nullable rather than defaulted to a blank snapshot: an empty
   * snapshot would render as a calm, connected market with no data, which is
   * exactly the impression this surface must never give.
   */
  snapshot: TradingMarketViewSnapshot | null
  loadStatus: 'LOADING' | 'READY' | 'UNAVAILABLE' | 'ERROR'
  /** Source identity, which exists even when no timeline does. */
  sourceLabel: string
  sourceOrigin: string
  instrument: MarketInstrument
  timeframe: MarketTimeframe
  onInstrumentChange: (instrument: MarketInstrument) => void
  onTimeframeChange: (timeframe: MarketTimeframe) => void
}

export function MarketViewHeader({
  snapshot,
  loadStatus,
  sourceLabel,
  sourceOrigin,
  instrument,
  timeframe,
  onInstrumentChange,
  onTimeframeChange,
}: MarketViewHeaderProps) {
  const banner = snapshot === null ? null : resolveSafetyBanner(snapshot)
  const copy = banner === null ? null : BANNER_COPY[banner]
  const session = snapshot?.sessionState ?? null

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.identity}>
          <p className={styles.identityEyebrow}>Atlas Market View</p>
          <h1 className={styles.identityTitle}>
            {instrument}
            <span className={styles.identitySubtitle}>{INSTRUMENT_LABELS[instrument]}</span>
          </h1>
        </div>

        <div
          className={styles.safetyBanner}
          data-banner={banner ?? loadStatus}
          role="status"
          data-testid="safety-banner"
        >
          {/*
            With no snapshot there is no market state to describe, so the banner
            reports the SOURCE state instead. It never falls back to a market
            claim it cannot support.
          */}
          <span className={styles.safetyLabel}>
            {copy?.label ?? LOAD_COPY[loadStatus as keyof typeof LOAD_COPY]?.label ?? 'OKÄND'}
          </span>
          <span className={styles.safetyDetail}>
            {copy?.detail ?? LOAD_COPY[loadStatus as keyof typeof LOAD_COPY]?.detail ?? ''}
          </span>
        </div>
      </div>

      <div className={styles.headerControls}>
        <div
          className={styles.segmented}
          role="group"
          aria-label="Instrument"
          data-testid="instrument-switch"
        >
          {MARKET_INSTRUMENTS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={styles.segment}
              aria-pressed={candidate === instrument}
              data-active={candidate === instrument || undefined}
              onClick={() => onInstrumentChange(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>

        <div
          className={styles.segmented}
          role="group"
          aria-label="Tidsram"
          data-testid="timeframe-switch"
        >
          {MARKET_TIMEFRAMES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={styles.segment}
              aria-pressed={candidate === timeframe}
              data-active={candidate === timeframe || undefined}
              onClick={() => onTimeframeChange(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>

        {session === null ? null : (
          <div className={styles.sessionStrip} aria-label="Sessionsfönster">
            <span className={styles.sessionClock}>
              {session.canonicalTime}
              <span className={styles.sessionZone}>
                {session.timezone} {session.utcOffset}
              </span>
            </span>
            {session.windows.map((window) => (
              <span key={window.session} className={styles.sessionWindow} data-state={window.state}>
                <span className={styles.sessionName}>{window.label}</span>
                <span className={styles.sessionRange}>
                  {window.opensAt}–{window.closesAt}
                </span>
                <span className={styles.sessionState}>{SESSION_STATE_LABELS[window.state]}</span>
              </span>
            ))}
          </div>
        )}

        {/*
          Source identity survives every load state — it is a property of what
          the view is pointed at, not of whether data arrived. The snapshot's own
          provenance is shown once it exists, and a test asserts the two agree.
        */}
        <div className={styles.provenanceChip} data-testid="provenance-chip">
          <span className={styles.provenanceOrigin}>
            {snapshot?.provenance.origin ?? sourceOrigin}
          </span>
          <span className={styles.provenanceLabel}>
            {snapshot?.provenance.sourceLabel ?? sourceLabel}
          </span>
          <span className={styles.provenanceProvider}>
            {snapshot?.provenance.providerLabel ?? 'Ingen provider ansluten'}
          </span>
        </div>
      </div>
    </header>
  )
}