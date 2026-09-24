/**
 * SDF-1C3A — real-filesystem containment primitives.
 *
 * The SDF-1A path policy (apps/web/lib/atlas/code-work/path-policy.ts) is LEXICAL ONLY
 * (`lexical_only_not_symlink_safe`): it cannot see a symlink and must never be presented as
 * filesystem safety. These primitives add the missing checks for reads and for VERIFYING a
 * prospective write target:
 *
 *  - the root is a canonical directory (realpath equals the string, so no ancestor symlink);
 *  - every existing path segment is `lstat`ed and a symlink anywhere is refused (nothing in a
 *    trusted workspace is read or created *through* a link);
 *  - the final realpath must equal root + '/' + relative path (a hardlink to a file elsewhere is
 *    additionally refused for write intent: nlink must be 1);
 *  - a prospective create is verified against its deepest existing ancestor, and the final
 *    component must not exist (lstat ENOENT — a dangling symlink also counts as existing);
 *  - NUL/control characters, `..`, `.`/empty segments, absolute paths, backslashes and any input
 *    that is not already NFC are refused; `.git`, `.env*` and the credential/secret names of the
 *    platform deny-list stay denied (compared case-insensitively, as the macOS volume is).
 *
 * WHAT THIS DOES NOT DO — stated plainly: Node has no `openat`/`*at` family, so a directory in the
 * middle of a verified path can still be swapped for a symlink between the check and a later
 * use. `O_NOFOLLOW` closes the FINAL component only. Therefore this module deliberately offers NO
 * write API: `FILESYSTEM_WRITES_ENABLED` is false and stays false. Repository mutation is designed
 * to happen INSIDE the sandbox volume in a later phase, never through host paths.
 */

import { constants as fsc, closeSync, fstatSync, lstatSync, openSync, realpathSync, type Stats } from 'node:fs'

export const FILESYSTEM_WRITES_ENABLED = false as const
export const FILESYSTEM_RESIDUAL_RISK = 'ancestor_directory_swap_between_check_and_use_not_closable_with_node_fs' as const

export type ContainmentRefusal =
  | 'root_not_canonical' | 'path_not_string' | 'path_nul_or_control' | 'path_empty_or_ambiguous' | 'path_not_posix'
  | 'path_absolute' | 'path_not_nfc' | 'path_dot_segment' | 'path_traversal' | 'path_platform_denied'
  | 'symlink_in_path' | 'not_a_directory_component' | 'escapes_root' | 'not_regular_file' | 'hardlinked_file'
  | 'target_exists' | 'target_missing' | 'parent_missing' | 'io_error'

export type ContainmentResult<T> = { ok: true; value: T } | { ok: false; refusal: ContainmentRefusal }

export interface FsView {
  lstat(path: string): Pick<Stats, 'isDirectory' | 'isFile' | 'isSymbolicLink' | 'nlink'>
  realpath(path: string): string
}
const defaultFs: FsView = { lstat: p => lstatSync(p), realpath: p => realpathSync(p) }

const isEnoent = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'
const isEnotdir = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOTDIR'
const fail = <T>(refusal: ContainmentRefusal): ContainmentResult<T> => ({ ok: false, refusal })

export const PLATFORM_DENIED_SEGMENTS = Object.freeze(['.git', '.ssh', '.aws', '.gnupg', 'credentials', 'secrets', 'secret', 'id_rsa', 'id_ed25519'])

/** Behavioural mirror of apps/web normalizeRepoRelativePath (parity-tested), plus NFC and control-character strictness. */
export function normalizeRelativePath(input: unknown): ContainmentResult<string> {
  if (typeof input !== 'string') return fail('path_not_string')
  if (input.includes('\0') || /[\u0000-\u001f\u007f]/.test(input)) return fail('path_nul_or_control')
  if (input.length === 0 || input.trim() !== input) return fail('path_empty_or_ambiguous')
  if (input.includes('\\')) return fail('path_not_posix')
  if (input.startsWith('/') || /^[A-Za-z]:/.test(input)) return fail('path_absolute')
  if (input !== input.normalize('NFC')) return fail('path_not_nfc')
  const segments = input.split('/')
  if (segments.some(segment => segment === '' || segment === '.')) return fail('path_dot_segment')
  if (segments.includes('..')) return fail('path_traversal')
  for (const raw of segments) {
    const segment = raw.toLowerCase()
    if (PLATFORM_DENIED_SEGMENTS.includes(segment) || segment.startsWith('.env')
        || segment.endsWith('.pem') || segment.endsWith('.key') || /^service[-_]?account.*\.json$/.test(segment)) {
      return fail('path_platform_denied')
    }
  }
  return { ok: true, value: input }
}

/** A canonical directory: absolute, an actual directory (not a link), and equal to its own realpath. */
export function verifyCanonicalDirectory(path: string, fs: FsView = defaultFs): ContainmentResult<string> {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\0') || (path.length > 1 && path.endsWith('/'))) return fail('root_not_canonical')
  try {
    const st = fs.lstat(path)
    if (st.isSymbolicLink() || !st.isDirectory()) return fail('root_not_canonical')
    if (fs.realpath(path) !== path) return fail('root_not_canonical')
  } catch { return fail('root_not_canonical') }
  return { ok: true, value: path }
}

export interface VerifiedExistingPath { absolute: string; relative: string }
export interface VerifiedCreatePath { absolute: string; relative: string; parent: string }

/** Walks every EXISTING segment with lstat; a symlink anywhere is refused. Returns how many exist. */
function walk(root: string, segments: readonly string[], fs: FsView): ContainmentResult<{ existing: number; lastExisting: string }> {
  let current = root
  let existing = 0
  for (const [index, segment] of segments.entries()) {
    const next = `${current}/${segment}`
    let st: ReturnType<FsView['lstat']>
    try { st = fs.lstat(next) } catch (error) {
      if (isEnoent(error)) return { ok: true, value: { existing, lastExisting: current } }
      if (isEnotdir(error)) return fail('not_a_directory_component')
      return fail('io_error')
    }
    if (st.isSymbolicLink()) return fail('symlink_in_path')
    if (index < segments.length - 1 && !st.isDirectory()) return fail('not_a_directory_component')
    current = next
    existing += 1
  }
  return { ok: true, value: { existing, lastExisting: current } }
}

/** Verify an EXISTING regular file or directory for reading (write intent additionally refuses hardlinks). */
export function verifyExistingPath(root: string, relative: unknown, intent: 'read' | 'write_check' = 'read', fs: FsView = defaultFs): ContainmentResult<VerifiedExistingPath> {
  const canonicalRoot = verifyCanonicalDirectory(root, fs)
  if (!canonicalRoot.ok) return canonicalRoot
  const rel = normalizeRelativePath(relative)
  if (!rel.ok) return rel
  const segments = rel.value.split('/')
  const walked = walk(root, segments, fs)
  if (!walked.ok) return walked
  if (walked.value.existing !== segments.length) return fail('target_missing')
  const absolute = `${root}/${rel.value}`
  try {
    if (fs.realpath(absolute) !== absolute) return fail('escapes_root')
    const st = fs.lstat(absolute)
    if (st.isSymbolicLink()) return fail('symlink_in_path')
    if (intent === 'write_check') {
      if (!st.isFile()) return fail('not_regular_file')
      if (st.nlink !== 1) return fail('hardlinked_file')
    }
  } catch { return fail('io_error') }
  return { ok: true, value: { absolute, relative: rel.value } }
}

/** Verify a PROSPECTIVE create: every existing ancestor is a real directory inside root and the target does not exist. */
export function verifyCreatePath(root: string, relative: unknown, fs: FsView = defaultFs): ContainmentResult<VerifiedCreatePath> {
  const canonicalRoot = verifyCanonicalDirectory(root, fs)
  if (!canonicalRoot.ok) return canonicalRoot
  const rel = normalizeRelativePath(relative)
  if (!rel.ok) return rel
  const segments = rel.value.split('/')
  const walked = walk(root, segments, fs)
  if (!walked.ok) return walked
  if (walked.value.existing === segments.length) return fail('target_exists')
  if (walked.value.existing < segments.length - 1) return fail('parent_missing')
  const parent = walked.value.lastExisting
  try {
    if (fs.realpath(parent) !== parent) return fail('escapes_root')
    if (!fs.lstat(parent).isDirectory()) return fail('not_a_directory_component')
  } catch { return fail('io_error') }
  return { ok: true, value: { absolute: `${root}/${rel.value}`, relative: rel.value, parent } }
}

/**
 * Open an existing file for READING without following a final-component symlink (O_NOFOLLOW),
 * then re-verify by fd: it must be a regular file and its path must still resolve inside root.
 * The caller owns the descriptor. There is intentionally no write counterpart.
 */
export function openForReadNoFollow(root: string, relative: unknown, fs: FsView = defaultFs): ContainmentResult<{ fd: number; relative: string }> {
  const verified = verifyExistingPath(root, relative, 'read', fs)
  if (!verified.ok) return verified
  if (typeof fsc.O_NOFOLLOW !== 'number') return fail('io_error')       // platform without O_NOFOLLOW: fail closed
  let fd: number
  try { fd = openSync(verified.value.absolute, fsc.O_RDONLY | fsc.O_NOFOLLOW) } catch { return fail('symlink_in_path') }
  try {
    if (!fstatSync(fd).isFile()) { closeSync(fd); return fail('not_regular_file') }
    if (realpathSync(verified.value.absolute) !== verified.value.absolute) { closeSync(fd); return fail('escapes_root') }
  } catch { try { closeSync(fd) } catch { /* ignore */ } return fail('io_error') }
  return { ok: true, value: { fd, relative: verified.value.relative } }
}
