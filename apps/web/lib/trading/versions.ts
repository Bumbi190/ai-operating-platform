/**
 * Omnira Trading Core — explicit version references.
 *
 * Canonical source:
 *  - Systemarkitektur v0.1 §7 (strategy versioning), §36 (replayability), §37 (determinism)
 *  - Strategy Specification Canonical v1.0 §44 (versioning)
 *  - README §10 (documentation versioning)
 *
 * INVARIANTS:
 *  - 'latest' is never resolved implicitly at runtime. A recorded decision must
 *    keep the version it actually ran under, forever.
 *  - A historical event may never be re-read under a newer version and still be
 *    presented as the same result (Strategy §44).
 *  - Version references are values, not lookups. Resolution belongs to a later
 *    phase; Phase 1 only guarantees the reference is carried and preserved.
 */

import type {
  PropFirmProfileId,
  RiskProfileId,
  StrategyId,
  StrategyVersionId,
} from './ids'

// ─── Version strings ──────────────────────────────────────────────────────────

/**
 * A version label such as 'v1.0' or 'v1.1-candidate-04'.
 *
 * Deliberately rejects the moving aliases. Storing 'latest' on a decision would
 * make the historical record unreadable the moment a new version ships.
 */
const FORBIDDEN_VERSION_ALIASES: readonly string[] = ['latest', 'current', 'head', 'stable']

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export function isVersionLabel(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !VERSION_PATTERN.test(raw)) return false
  return !FORBIDDEN_VERSION_ALIASES.includes(raw.toLowerCase())
}

export function parseVersionLabel(raw: unknown): string | null {
  return isVersionLabel(raw) ? raw : null
}

// ─── References ───────────────────────────────────────────────────────────────

/** The strategy version a signal or trade actually ran under. */
export interface StrategyVersionRef {
  readonly strategyId: StrategyId
  readonly strategyVersionId: StrategyVersionId
  readonly version: string
}

/** The risk profile version a RiskDecision was evaluated against. */
export interface RiskProfileRef {
  readonly riskProfileId: RiskProfileId
  readonly version: string
}

/** The prop firm profile version a PropDecision was evaluated against. */
export interface PropFirmProfileRef {
  readonly propFirmProfileId: PropFirmProfileId
  readonly version: string
}

/**
 * The version of the deterministic pattern-detection rules in force.
 *
 * The rules themselves are GATE-01 through GATE-04 and are NOT defined here.
 * The reference exists now so that when those gates close, every historical
 * signal can say which detection version produced it — required for
 * backtest/replay/live parity (README §8).
 */
export interface DetectionVersionRef {
  readonly version: string
}

/**
 * The market-data snapshot a decision was made against.
 *
 * The provider is GATE-08 and is not chosen here. `sourceRef` is an opaque
 * handle whose meaning is owned by the future Market Data Layer.
 */
export interface DataSnapshotRef {
  readonly snapshotId: string
  readonly sourceRef: string
}

// ─── Construction ─────────────────────────────────────────────────────────────

/** Build a frozen StrategyVersionRef, refusing moving aliases. */
export function strategyVersionRef(
  strategyId: StrategyId,
  strategyVersionId: StrategyVersionId,
  version: string,
): StrategyVersionRef | null {
  if (!isVersionLabel(version)) return null
  return Object.freeze({ strategyId, strategyVersionId, version })
}

/** Build a frozen RiskProfileRef, refusing moving aliases. */
export function riskProfileRef(
  riskProfileId: RiskProfileId,
  version: string,
): RiskProfileRef | null {
  if (!isVersionLabel(version)) return null
  return Object.freeze({ riskProfileId, version })
}

/** Build a frozen PropFirmProfileRef, refusing moving aliases. */
export function propFirmProfileRef(
  propFirmProfileId: PropFirmProfileId,
  version: string,
): PropFirmProfileRef | null {
  if (!isVersionLabel(version)) return null
  return Object.freeze({ propFirmProfileId, version })
}

/** True when two strategy version references denote the same version. */
export function sameStrategyVersion(a: StrategyVersionRef, b: StrategyVersionRef): boolean {
  return a.strategyVersionId === b.strategyVersionId && a.version === b.version
}
