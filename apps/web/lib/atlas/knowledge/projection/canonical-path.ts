/**
 * lib/atlas/knowledge/projection/canonical-path.ts — the repository pointer grammar.
 *
 * `canonical_path` names the authoritative repository file behind a note that
 * declares `source_of_truth: repository`. Phase 1 only ever proved it was
 * non-empty, which is enough to rank authority locally and NOT enough for a
 * field entering an immutable production projection: once published, the value
 * is fixed in content-addressed bytes and a reader may show it to a human as
 * provenance.
 *
 * ── PROVENANCE ONLY — NEVER DEREFERENCED ─────────────────────────────────────
 * Nothing here opens, resolves, stats or fetches the path. It is a string that
 * must be well-formed, not a file that must exist. Before any future feature
 * dereferences it, three things are required and none of them belong to this
 * slice: this syntax check stays mandatory, existence must be validated against
 * a PINNED application-repo revision, and that feature needs its own review.
 *
 * ── VALIDATED EXACTLY AS SUPPLIED ────────────────────────────────────────────
 * No trim, no normalization, no repair. Validating one string and storing a
 * different one is the defect this codebase has already shipped once (the
 * project-id validator that tested `value.trim()` and resolved `value`).
 *
 * ── HONEST LIMIT OF THE WHITESPACE RULE ──────────────────────────────────────
 * `surrounding_whitespace` is UNREACHABLE through the real vault pipeline, and
 * this module must not be described as the guard that stops it. `stripFrontMatter`
 * (lib/architecture-knowledge/normalize.ts) already does
 * `match[2].trim().replace(/^['"]|['"]$/g, '')` at parse time, and
 * `parseKnowledgeDocument` trims again — so a padded `canonical_path:` in a real
 * note has lost its padding two layers before it could reach here. The rule is
 * kept because this is a pure validator that may later be fed from somewhere
 * other than the frontmatter parser, and a validator that silently accepts
 * padding is worse than one that never sees it.
 *
 * ── THE TRAILING SLASH IS LOAD-BEARING ───────────────────────────────────────
 * Directory pointers are real and in use TODAY: `60 Memory/_index.md` points at
 * `apps/web/lib/atlas/memory/` and `70 References/canonical-sources.md` at
 * `docs/`, both `status: approved` and both currently eligible. The obvious
 * strict grammar — every segment non-empty — would silently make both
 * ineligible, and it would surface as an unexplained drop in a later real-vault
 * run rather than as a decision anyone made. Exactly one optional trailing "/"
 * is therefore allowed, and nothing more.
 */

/** Every distinct way a repository pointer can be malformed. */
export type CanonicalPathViolation =
  | 'not_a_string'
  | 'empty'
  | 'too_long'
  | 'surrounding_whitespace'
  | 'absolute'
  | 'home_relative'
  | 'backslash'
  | 'control_character'
  | 'scheme_or_drive_prefix'
  | 'empty_segment'
  | 'whitespace_segment'
  | 'dot_segment'
  | 'dotdot_segment'

/** Deterministic report order, so two runs describe a bad pointer identically. */
const VIOLATION_ORDER: readonly CanonicalPathViolation[] = [
  'not_a_string',
  'empty',
  'too_long',
  'surrounding_whitespace',
  'absolute',
  'home_relative',
  'backslash',
  'control_character',
  'scheme_or_drive_prefix',
  'empty_segment',
  'whitespace_segment',
  'dot_segment',
  'dotdot_segment',
]

export const CANONICAL_PATH_MAX_LENGTH = 1024

/**
 * One rule catches both `C:\repo` and `file:///x` / `https://x`: a Windows drive
 * letter is syntactically a one-character URI scheme.
 */
const SCHEME_OR_DRIVE_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/

/** NUL and the C0/C1 control ranges. */
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F]/

export interface CanonicalPathCheck {
  valid: boolean
  /** Empty when valid. Every violation, deterministically ordered. */
  violations: CanonicalPathViolation[]
}

/**
 * Check a repository pointer against the grammar. Collects EVERY violation
 * rather than short-circuiting, so an operator fixing a note sees the whole
 * problem in one pass.
 */
export function checkCanonicalPath(value: unknown): CanonicalPathCheck {
  const found = new Set<CanonicalPathViolation>()

  if (typeof value !== 'string') {
    return { valid: false, violations: ['not_a_string'] }
  }
  if (value === '') {
    return { valid: false, violations: ['empty'] }
  }

  if (value.length > CANONICAL_PATH_MAX_LENGTH) found.add('too_long')
  if (value !== value.trim()) found.add('surrounding_whitespace')
  if (value.startsWith('/')) found.add('absolute')
  if (value.startsWith('~')) found.add('home_relative')
  if (value.includes('\\')) found.add('backslash')
  if (CONTROL_RE.test(value)) found.add('control_character')
  if (SCHEME_OR_DRIVE_RE.test(value)) found.add('scheme_or_drive_prefix')

  // Exactly one optional trailing "/" is permitted, so drop at most one trailing
  // empty segment before checking the rest. `a//` therefore still fails: dropping
  // one leaves `['a', '']`, and that remaining empty segment is a real violation.
  const segments = value.split('/')
  if (segments.length > 1 && segments[segments.length - 1] === '') segments.pop()

  for (const segment of segments) {
    if (segment === '') found.add('empty_segment')
    else if (segment.trim() === '') found.add('whitespace_segment')
    else if (segment === '.') found.add('dot_segment')
    else if (segment === '..') found.add('dotdot_segment')
  }

  const violations = VIOLATION_ORDER.filter((v) => found.has(v))
  return { valid: violations.length === 0, violations }
}

/** Narrowing convenience. Same rules, no violation detail. */
export function isValidCanonicalPath(value: unknown): value is string {
  return checkCanonicalPath(value).valid
}

// ─────────────────────────────────────────────────────────────────────────────
// VAULT-RELATIVE SOURCE PATHS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A document's own `path` is REMOTE data, not just a local lookup key: it ships
 * in every record as the provenance an operator uses to find the note behind a
 * citation. So it is checked, not assumed.
 *
 * The failure this prevents is specific and permanent: an absolute path would
 * publish the owner's home directory — `/Users/<name>/...` — into an immutable,
 * content-addressed artifact, where it cannot be edited out. The Slice 3B walk
 * produces relative paths by construction; this is what keeps a future caller
 * from handing over something else.
 *
 * Deliberately NOT the same grammar as a repository pointer: a source path names
 * a file, so unlike `canonical_path` it may not end in a slash.
 */
export type VaultPathViolation =
  | 'not_a_string'
  | 'empty'
  | 'absolute'
  | 'home_relative'
  | 'backslash'
  | 'control_character'
  | 'scheme_or_drive_prefix'
  | 'directory'
  | 'empty_segment'
  | 'dot_segment'
  | 'dotdot_segment'

const VAULT_PATH_VIOLATION_ORDER: readonly VaultPathViolation[] = [
  'not_a_string', 'empty', 'absolute', 'home_relative', 'backslash', 'control_character',
  'scheme_or_drive_prefix', 'directory', 'empty_segment', 'dot_segment', 'dotdot_segment',
]

export interface VaultPathCheck {
  valid: boolean
  violations: VaultPathViolation[]
}

/** Every violation, deterministically ordered, so each rule is provable alone. */
export function checkVaultRelativePath(value: unknown): VaultPathCheck {
  if (typeof value !== 'string') return { valid: false, violations: ['not_a_string'] }
  if (value === '') return { valid: false, violations: ['empty'] }

  const found = new Set<VaultPathViolation>()
  if (value.startsWith('/')) found.add('absolute')
  if (value.startsWith('~')) found.add('home_relative')
  if (value.includes('\\')) found.add('backslash')
  if (CONTROL_RE.test(value)) found.add('control_character')
  if (SCHEME_OR_DRIVE_RE.test(value)) found.add('scheme_or_drive_prefix')
  if (value.endsWith('/')) found.add('directory')

  for (const segment of value.split('/')) {
    if (segment === '') found.add('empty_segment')
    else if (segment === '.') found.add('dot_segment')
    else if (segment === '..') found.add('dotdot_segment')
  }

  const violations = VAULT_PATH_VIOLATION_ORDER.filter((v) => found.has(v))
  return { valid: violations.length === 0, violations }
}
