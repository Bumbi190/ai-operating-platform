import React, { type ReactNode } from 'react'
import type { PresenceState, PriceText } from '@/lib/trading/market-view'
import styles from './AtlasMarketView.module.css'

/**
 * Shared presentation primitives for the Atlas Market View panels.
 *
 * The rule these encode: an unknown value is DRAWN, never omitted. Leaving a
 * row out to mean "we don't know" makes UNKNOWN and ABSENT look identical, and
 * on a trading surface those are opposite claims — "we looked and it is not
 * there" versus "we have no idea". Every helper below therefore has an explicit
 * rendering for null and for UNKNOWN.
 */

/** Placeholder for a value the source did not supply. Never an empty cell. */
export function UnknownValue({ label = 'Okänt' }: { label?: string }) {
  return <span className={styles.unknownValue}>{label}</span>
}

export function ValueRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'warning' | 'critical' | 'positive'
}) {
  return (
    <div className={styles.valueRow} data-tone={tone ?? 'default'}>
      <dt className={styles.valueLabel}>
        {label}
        {hint ? <span className={styles.valueHint}>{hint}</span> : null}
      </dt>
      <dd className={styles.valueValue}>{value}</dd>
    </div>
  )
}

/** Render an exact price, or an explicit unknown. Never a blank. */
export function PriceValue({ value, suffix }: { value: PriceText | null; suffix?: string }) {
  if (value === null) return <UnknownValue label="—" />
  return (
    <span className={styles.priceValue}>
      {value}
      {suffix ? <span className={styles.priceSuffix}>{suffix}</span> : null}
    </span>
  )
}

/** Render a count, or an explicit unknown. `0` is a value, not an absence. */
export function CountValue({ value, of }: { value: number | null; of?: number | null }) {
  if (value === null) return <UnknownValue />
  if (of === null || of === undefined) return <span className={styles.priceValue}>{value}</span>
  return (
    <span className={styles.priceValue}>
      {value}
      <span className={styles.priceSuffix}>/ {of}</span>
    </span>
  )
}

export type StateTone = 'positive' | 'negative' | 'unknown' | 'neutral' | 'warning'

export function StatePill({
  children,
  tone,
  title,
}: {
  children: ReactNode
  tone: StateTone
  title?: string
}) {
  return (
    <span className={styles.statePill} data-tone={tone} title={title}>
      <span className={styles.stateDot} aria-hidden="true" />
      {children}
    </span>
  )
}

const PRESENCE_LABELS: Readonly<Record<PresenceState, string>> = {
  CONFIRMED: 'BEKRÄFTAD',
  ABSENT: 'SAKNAS',
  UNKNOWN: 'OKÄND',
}

const PRESENCE_TONES: Readonly<Record<PresenceState, StateTone>> = {
  CONFIRMED: 'positive',
  ABSENT: 'negative',
  UNKNOWN: 'unknown',
}

/**
 * A confirmation row.
 *
 * All three states get a pill with its own colour and its own word. ABSENT is
 * not "no pill", and UNKNOWN is not "greyed out and unlabelled" — a reader who
 * cannot distinguish those two states cannot tell a checked-and-empty market
 * from a broken feed.
 */
export function ConfirmationRow({
  label,
  state,
  description,
}: {
  label: string
  state: PresenceState
  description?: string
}) {
  return (
    <div className={styles.confirmationRow}>
      <div className={styles.confirmationLabel}>
        <span>{label}</span>
        {description ? <span className={styles.valueHint}>{description}</span> : null}
      </div>
      <StatePill tone={PRESENCE_TONES[state]}>{PRESENCE_LABELS[state]}</StatePill>
    </div>
  )
}

export function PanelSection({
  eyebrow,
  title,
  right,
  children,
}: {
  eyebrow: string
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={styles.panel} aria-label={title}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.panelEyebrow}>{eyebrow}</p>
          <h3 className={styles.panelTitle}>{title}</h3>
        </div>
        {right ? <div className={styles.panelHeaderRight}>{right}</div> : null}
      </header>
      {children}
    </section>
  )
}
