/**
 * lib/atlas/autonomy-license/types.ts — Chapter 18 Autonomy Licensing domain.
 *
 * §18.2: "Executive Intelligence may recommend higher autonomy. Executive
 * Intelligence may not grant itself higher autonomy." An autonomy licence is
 * GOVERNED PERMISSION, and this module owns exactly one fact: which already-
 * governed actions an identified workflow instance may perform without an
 * individual human approval each time.
 *
 * ── WHAT THIS MODULE IS NOT ────────────────────────────────────────────────
 * It creates no capability and no action authority. §18.6 ("Autonomy vs
 * Capability") and §18.7 ("Autonomy vs Access") are the reason: a licence
 * answers "may this run unattended?", never "can this run at all". The
 * underlying workflow/action authority still decides whether an action is
 * possible, and a licence can only ever narrow what that authority already
 * allows — never widen it.
 *
 * Phase 2C implements the licence TRUTH only. Nothing here executes anything,
 * and no executor, gate, provider, spend boundary or scheduler imports it.
 * The composition with the rest of the authority chain is deliberately a later
 * phase (see `compose.ts`, which is pure and unimported).
 *
 * ── THE LEVEL VOCABULARY IS NOT DECLARED HERE ──────────────────────────────
 * The canonical L0–L6 levels are re-exported from `./levels`, never restated.
 * §18.10's seven levels are ONE vocabulary; a second L0–L6 enum anywhere would
 * make "is this licence for L4?" a question with two answers. The existing
 * guard tests that forbid an autonomy-licence vocabulary inside Work Package,
 * Delegation and the Survival history module stay exactly as they are — this
 * module is the dedicated Chapter 18 owner those guards imply, and it
 * deliberately does not live inside any of them.
 *
 * ── THREE SCALES THAT ARE NEVER COMPARED ───────────────────────────────────
 * Chapter 18 autonomy levels (L0–L6), Mission Risk Level (0–3) and
 * `MissionRecord.risks` (low/medium/high) are unrelated axes. `docs/autonomy/
 * RISK-AND-AUTHORITY.md` §0: "The two numbers are unrelated and must never be
 * compared or added." Nothing in this module imports a risk vocabulary, and
 * tests assert that neither one can enter level resolution.
 */

import { INEFFECTIVE_LEVEL } from './levels'
import type { AutonomyLicenseLevel } from './levels'

// ── The level vocabulary — reused, never re-declared ──────────────────────────
//
// Re-exported so this module has one import surface for its own consumers while
// the declaration stays in one place. Re-exporting is not duplication:
// `AUTONOMY_LICENSE_LEVELS` is `as const`, so every consumer's type is literally
// the same tuple, and adding an eighth level would be a one-file change.

export { AUTONOMY_LICENSE_LEVELS, AUTONOMY_LICENSE_LABELS } from './levels'
export { compareLevels, levelIndex, INEFFECTIVE_LEVEL } from './levels'

// ── Identity ──────────────────────────────────────────────────────────────────

/** Stable identity of the licence aggregate (the whole event chain). */
export type AutonomyLicenseId = string

/** Stable identity of one immutable event within a chain. */
export type AutonomyLicenseEventId = string

/**
 * The licence lineage position an act belongs to (§18.59).
 *
 * Same mechanism as `atlas_decision_ledger.lifecycle_generation`: two acts
 * derived from the same lineage state necessarily claim the same generation,
 * and a unique index on `(license_id, license_generation)` makes the second
 * one fail. That is what stops two concurrent human acts from both becoming
 * canonical — never timestamp ordering, which cannot distinguish them.
 */
export type LicenseGeneration = number

// ── Lifecycle (§18.49) ────────────────────────────────────────────────────────

/**
 * The five lifecycle acts Phase 2C V1 implements.
 *
 * §18.49 lists twelve STATUSES (Draft, Proposed, Under Review, Approved,
 * Scheduled, Active, Restricted, Suspended, Expired, Revoked, Superseded,
 * Completed). Those are the states a licence may hold; these are the ACTS a
 * human may perform. Phase 2C models the subset that can be performed with
 * evidence already in the repository — issuing, and the four ways a standing
 * grant stops or narrows.
 *
 * Deliberately absent: `RESUMED`. A suspended licence is ineffective, and
 * restoring autonomy requires a NEW reviewed licensing act rather than
 * reactivating the old grant. §18.251 ("Anti-Silent-Demotion") is about the
 * reverse direction, but the principle is symmetric: authority never returns
 * without a human act that can be pointed at.
 */
export const LICENSE_ACTS = [
  'LICENSE_ISSUED',
  'LICENSE_RESTRICTED',
  'LICENSE_SUSPENDED',
  'LICENSE_REVOKED',
  'LICENSE_SUPERSEDED',
] as const
export type LicenseAct = (typeof LICENSE_ACTS)[number]

/** Derived licence status. Never stored as a mutable column — always folded. */
export const LICENSE_STATUSES = [
  'active',
  'restricted',
  'suspended',
  'revoked',
  'superseded',
] as const
export type LicenseStatus = (typeof LICENSE_STATUSES)[number]

// ── Effectiveness (§18.45, §18.272) ───────────────────────────────────────────

/**
 * Why a licence is or is not currently effective. A CLOSED vocabulary, because
 * "why did autonomy not apply?" must have one answer a reader can act on
 * rather than a free-text explanation no surface can group by.
 *
 * Every non-`active` entry resolves to L0 — but L0 never means "this workflow
 * may do nothing". It means: no autonomous permission above observation is
 * currently PROVEN. A separately human-authorized action is unaffected.
 */
export const LICENSE_REASONS = [
  'active',
  /** Nothing was ever issued for this workflow instance. */
  'no_license',
  /** The named instance does not exist — distinct from "exists, unlicensed". */
  'unknown_workflow_instance',
  /**
   * The read itself failed. Deliberately NOT folded into `no_license`: "we
   * could not prove a licence exists" and "no licence exists" both fail closed
   * to L0, but only one of them is a reason to look at the database.
   */
  'unavailable',
  /** Issued, but the read clock is before `effective_at`. */
  'not_yet_effective',
  /** At or after `expires_at`. Derived from the read clock, never a status. */
  'expired',
  'suspended',
  /** Terminal for this licence lineage (§18.57). */
  'revoked',
  /** A replacement licence lineage exists (§18.56). */
  'superseded',
  /**
   * More than one non-terminal licence lineage exists for this instance and
   * nothing says which one governs.
   *
   * This is the expected — and safe — state DURING a replacement: issuing a
   * successor beside a live licence is transiently ambiguous until the
   * supersession act lands. Ambiguity must never be resolved by guessing, so it
   * fails closed to L0 rather than picking a winner.
   */
  'ambiguous_licenses',
  /** The immutable event chain cannot be folded. Fails closed, never repairs. */
  'malformed_lineage',
  /** The Decision Ledger decision that authorized the grant no longer governs. */
  'decision_not_governing',
  /** The workflow instance's `def_hash` moved off the issued binding (§18.61). */
  'workflow_definition_drifted',
  /** The action registry reclassified a licensed ActionKind (§18.60). */
  'scope_drifted',
] as const
export type LicenseReason = (typeof LICENSE_REASONS)[number]

// ── Action scope (§18.18, §18.23) ─────────────────────────────────────────────

/**
 * §18.18: "An autonomy level describes the category of authority. The license
 * defines the actual scope. Two L4 licenses may differ completely… They do not
 * authorize each other's actions."
 *
 * So the licence carries an EXPLICIT bounded set of ActionKinds. An ActionClass
 * is never a scope: licensing `FINANCIAL` must not mean "every FINANCIAL action
 * in Omnira is licensed", because that is exactly the level-is-scope confusion
 * §18.18 forbids.
 */
export interface LicensedActionEntry {
  readonly actionKind: string
  /**
   * Derived from `ACTION_REGISTRY` — never caller-supplied. `null` when the
   * kind has since been removed from the registry, which is itself drift rather
   * than a missing value to be papered over.
   */
  readonly actionClass: string | null
}

/**
 * What a resolved licence says about actions. The fingerprint binds the
 * load-bearing REGISTRY facts (not prose) so a later reclassification is
 * detectable without mutating history (§18.60 "Action Mutation").
 */
export interface ActionScope {
  readonly entries: readonly LicensedActionEntry[]
  /** `canonicalTargetVersionHash` over the sorted, class-carrying entries. */
  readonly fingerprint: string
}

// ── Immutable events ──────────────────────────────────────────────────────────

/**
 * One immutable licence event. The whole licence is reconstructible from its
 * events plus the current registry — never from a mutable "current" row.
 */
export interface LicenseEvent {
  readonly eventId: AutonomyLicenseEventId
  readonly eventSeq: number
  readonly licenseId: AutonomyLicenseId
  readonly generation: LicenseGeneration
  readonly act: LicenseAct
  readonly projectId: string
  readonly workflowInstanceId: string
  /**
   * The definition the licence was issued against (§18.61/§18.22). BOTH halves
   * are bound: `key` names which definition, `hash` pins its exact content.
   * The fingerprint needs the key to scope placement lookups, and the hash is
   * what detects a materially changed definition.
   */
  readonly boundDefKey: string
  readonly boundDefHash: string
  /** The level this act establishes. RESTRICTED may only lower it. */
  readonly licensedLevel: AutonomyLicenseLevel
  readonly allowedActionKinds: readonly string[]
  readonly actionScopeFingerprint: string
  readonly decisionId: string
  readonly decisionVersion: number
  readonly decisionRecordId: string
  readonly effectiveAt: string
  readonly expiresAt: string
  readonly supersededByLicenseId: string | null
  readonly reason: string | null
  /** Server-derived from the authenticated session: `user:<uuid>`. */
  readonly actor: string
  readonly occurredAt: string
}

// ── Resolved read model ───────────────────────────────────────────────────────

/**
 * The canonical answer to "what autonomy may this workflow instance exercise
 * without per-action approval, right now?".
 *
 * Deliberately more than a level: a bare `L4` cannot be audited, cannot explain
 * itself, and cannot distinguish "never licensed" from "licensed but the
 * decision stopped governing". Every field here is one a reviewer needs to
 * answer §18.275's closing questions.
 */
export interface ResolvedAutonomyLicense {
  /** The folded lifecycle status, or null when no licence exists. */
  readonly status: LicenseStatus | null
  readonly effective: boolean
  readonly reason: LicenseReason
  /**
   * The specific Decision Ledger reason when `reason` is
   * `decision_not_governing` — the existing Chapter 11 vocabulary
   * (`expired`/`reversed`/`superseded`/`completed`/`malformed_lineage`/…).
   * Null in every other case.
   */
  readonly decisionReason: string | null

  readonly licenseId: AutonomyLicenseId | null
  readonly projectId: string | null
  readonly workflowInstanceId: string
  readonly boundDefKey: string | null
  readonly boundDefHash: string | null

  /** The level the licence grants when effective. */
  readonly licensedLevel: AutonomyLicenseLevel | null
  /** The level that may actually be used now: `L0` whenever ineffective. */
  readonly resolvedLevel: AutonomyLicenseLevel
  readonly allowedActionKinds: readonly string[]
  readonly actionScopeFingerprint: string | null

  /** Institutional provenance (Ruling 2) — never the whole decision. */
  readonly decision: {
    readonly decisionId: string
    readonly version: number
    readonly recordId: string
  } | null
  readonly issuer: string | null

  readonly effectiveAt: string | null
  readonly expiresAt: string | null
  /** The lineage position of the event that decided this answer. */
  readonly generation: LicenseGeneration | null
  readonly eventCount: number
}

/** The always-ineffective answer, so no caller invents its own default. */
export function noLicense(workflowInstanceId: string, reason: LicenseReason): ResolvedAutonomyLicense {
  return {
    status: null,
    effective: false,
    reason,
    decisionReason: null,
    licenseId: null,
    projectId: null,
    workflowInstanceId,
    boundDefKey: null,
    boundDefHash: null,
    licensedLevel: null,
    resolvedLevel: INEFFECTIVE_LEVEL,
    allowedActionKinds: [],
    actionScopeFingerprint: null,
    decision: null,
    issuer: null,
    effectiveAt: null,
    expiresAt: null,
    generation: null,
    eventCount: 0,
  }
}
