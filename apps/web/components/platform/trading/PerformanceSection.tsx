import React from 'react'
import { StatePill, UnknownValue } from './primitives'
import styles from './AtlasMarketView.module.css'

/**
 * Performance — declared, and declared unavailable.
 *
 * Stage 1 has no journal of closed trades, so there is nothing a performance
 * figure could be computed from. The section exists so the absence is stated
 * where an operator would look for the numbers, and every slot is drawn as an
 * explicit unknown rather than left out: a missing win rate and a win rate of
 * zero are opposite claims, and a blank would let either be read.
 *
 * NO NUMBER IS RENDERED HERE, and a test holds that. The slot names are the
 * design's; nothing behind them exists yet.
 */

export const PERFORMANCE_SLOTS = [
  'Vinstandel',
  'Genomsnittligt R',
  'Profit factor',
  'Nettoresultat',
  'Max drawdown',
  'Senaste trades',
] as const

export function PerformanceSection() {
  return (
    <details className={styles.secondarySection} data-testid="market-view-performance">
      <summary className={styles.secondarySummary}>
        <span className={styles.secondaryTitle}>Prestanda</span>
        <StatePill tone="unknown">Ej tillgänglig i Stage 1</StatePill>
      </summary>
      <div className={styles.secondaryBody}>
        <dl className={styles.performanceSlots}>
          {PERFORMANCE_SLOTS.map((slot) => (
            <div key={slot} className={styles.performanceSlot}>
              <dt className={styles.performanceSlotLabel}>{slot}</dt>
              <dd className={styles.performanceSlotValue}>
                <UnknownValue label="—" />
              </dd>
            </div>
          ))}
        </dl>
        <p className={styles.panelNote}>
          Prestandadata är inte tillgänglig i Stage 1. Vinstandel, genomsnittligt R, profit factor,
          nettoresultat och max drawdown kräver en journal över avslutade trades, och en sådan finns
          inte i den funktionella implementationen ännu.
        </p>
      </div>
    </details>
  )
}
