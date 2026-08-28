/**
 * Omnira Trading Core — verdicts, authority modes and fail-closed semantics.
 *
 * Canonical source:
 *  - Systemarkitektur v0.1 §3 (separation of authority), §16 (approval modes), §26 (fail closed)
 *  - Risk Engine Specification Canonical v1.0 §2, and v0.1 §4–5 (outputs, fail closed)
 *  - Datamodell v0.1 §29, §32 (decision results)
 *
 * INVARIANTS:
 *  - UNKNOWN is a first-class verdict. Safety-critical state is NOT a boolean.
 *  - UNKNOWN never becomes ALLOW. Absence of information is never permission.
 *  - Only an explicit ALLOW grants anything. Everything else blocks.
 *  - The system never changes authority mode on its own (Systemarkitektur §16).
 */

// ─── Verdicts ─────────────────────────────────────────────────────────────────

/**
 * The three outcomes any authority layer can produce.
 *
 * ALLOW_REDUCED_SIZE is named in Risk v0.1 §5 as an explicitly FUTURE result and
 * is deliberately absent here — adding it now would let Phase 1 imply a sizing
 * behaviour the Risk Engine has not been built to honour.
 */
export const VERDICTS = ['ALLOW', 'DENY', 'UNKNOWN'] as const
export type Verdict = (typeof VERDICTS)[number]

export function isVerdict(raw: unknown): raw is Verdict {
  return typeof raw === 'string' && (VERDICTS as readonly string[]).includes(raw)
}

/**
 * The single place where a verdict is turned into permission.
 *
 * Every gate in the system routes through this function, so there is exactly
 * one line of code that can ever answer "yes" — and it answers only to ALLOW.
 */
export function grantsPermission(verdict: Verdict): boolean {
  return verdict === 'ALLOW'
}

/**
 * Normalize an untrusted or absent verdict, failing closed.
 *
 * Anything unrecognized — undefined, null, '', 'allow', 'true', a number —
 * resolves to UNKNOWN. Never to ALLOW, and never silently to DENY either:
 * UNKNOWN and DENY mean different things to an operator reading the journal.
 */
export function resolveVerdict(raw: unknown): Verdict {
  return isVerdict(raw) ? raw : 'UNKNOWN'
}

/**
 * Combine verdicts from independent authority layers.
 *
 * Risk and Prop both hold veto (README §6), so the combination is a logical
 * AND over ALLOW with the conservative outcome winning:
 *   any DENY    → DENY     (an explicit refusal is the most informative answer)
 *   any UNKNOWN → UNKNOWN  (we do not know, so we do not proceed)
 *   all ALLOW   → ALLOW
 *
 * An empty list yields UNKNOWN: "nobody evaluated this" is not approval.
 */
export function combineVerdicts(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.length === 0) return 'UNKNOWN'
  if (verdicts.includes('DENY')) return 'DENY'
  if (verdicts.includes('UNKNOWN')) return 'UNKNOWN'
  return 'ALLOW'
}

// ─── Authority modes ──────────────────────────────────────────────────────────

/**
 * The six canonical authority modes (Systemarkitektur v0.1 §16).
 *
 * Ordering is meaningful: each step widens what the system may do.
 * The system may never advance a mode by itself.
 */
export const AUTHORITY_MODES = [
  'ANALYSIS_ONLY',            // Mode 0 — no order placement is technically permitted
  'READ_ONLY',                // Mode 1 — MT5 data may be read; order placement is off
  'DEMO_MANUAL_APPROVAL',     // Mode 2 — demo, every proposal needs a human
  'DEMO_AUTOMATION',          // Mode 3 — demo, approved system rules may execute
  'LIVE_MANUAL_APPROVAL',     // Mode 4 — live, every order needs a human
  'LIVE_CONTROLLED_AUTOMATION', // Mode 5 — live automation, behind safety gates
] as const
export type AuthorityMode = (typeof AUTHORITY_MODES)[number]

export function isAuthorityMode(raw: unknown): raw is AuthorityMode {
  return typeof raw === 'string' && (AUTHORITY_MODES as readonly string[]).includes(raw)
}

/**
 * Parse an untrusted mode. Fails closed to null — there is no default mode,
 * and in particular no default that permits execution.
 */
export function parseAuthorityMode(raw: unknown): AuthorityMode | null {
  return isAuthorityMode(raw) ? raw : null
}

/** Modes under which an execution intent may be created at all. */
const EXECUTION_CAPABLE_MODES: readonly AuthorityMode[] = [
  'DEMO_MANUAL_APPROVAL',
  'DEMO_AUTOMATION',
  'LIVE_MANUAL_APPROVAL',
  'LIVE_CONTROLLED_AUTOMATION',
]

/** Modes that require a human decision before execution. */
const MANUAL_APPROVAL_MODES: readonly AuthorityMode[] = [
  'DEMO_MANUAL_APPROVAL',
  'LIVE_MANUAL_APPROVAL',
]

/** True when the mode permits creating an execution intent. Modes 0–1 never do. */
export function modeAllowsExecution(mode: AuthorityMode): boolean {
  return EXECUTION_CAPABLE_MODES.includes(mode)
}

/** True when the mode requires an explicit human approval (Modes 2 and 4). */
export function modeRequiresManualApproval(mode: AuthorityMode): boolean {
  return MANUAL_APPROVAL_MODES.includes(mode)
}

/**
 * The environment a mode is scoped to, or null when the mode is
 * environment-agnostic (Modes 0–1 read and analyse anywhere).
 *
 * Read straight from the canonical mode names: Modes 2–3 are the demo tiers,
 * Modes 4–5 the live tiers.
 */
export function modeEnvironmentScope(mode: AuthorityMode): 'demo' | 'live' | null {
  switch (mode) {
    case 'DEMO_MANUAL_APPROVAL':
    case 'DEMO_AUTOMATION':
      return 'demo'
    case 'LIVE_MANUAL_APPROVAL':
    case 'LIVE_CONTROLLED_AUTOMATION':
      return 'live'
    case 'ANALYSIS_ONLY':
    case 'READ_ONLY':
      return null
  }
}
