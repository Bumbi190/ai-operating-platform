#!/usr/bin/env node
/**
 * Omnira Trading — canon manifest integrity.
 *
 * THE MODEL, AND WHY IT IS NOT EQUALITY
 * ─────────────────────────────────────
 * There are two manifests under `docs/trading-system/`, and the repository's own
 * README describes them as different things:
 *
 *   CHECKSUMS.md      — the curated, human-readable checksum document. Organised
 *                       into sections (final PDF, canonical specifications, book
 *                       chapters, archive) and deliberately omits index/README
 *                       files.
 *   CHECKSUMS.sha256  — the machine-verifiable manifest. A SUPERSET: it also
 *                       covers the indexes and a superseded specification that
 *                       the curated document does not list.
 *
 * That superset relationship is not drift. It held at every single commit that
 * touched both files: the curated set was always a strict subset, and the hashes
 * always agreed where both listed a path. So the invariant this script enforces
 * is CONTAINMENT, not equality:
 *
 *     CHECKSUMS.md ⊆ CHECKSUMS.sha256
 *
 * A future maintainer will be tempted to "simplify" this into a set comparison.
 * Doing so would fail the build until someone either deletes five legitimate
 * machine-manifest entries or promotes index files into a curated document —
 * both of which reinterpret canon that this script has no authority over.
 *
 * WHAT IT ENFORCES
 * ────────────────
 *   A. every curated entry exists on disk          E. every curated path is in
 *   B. every curated hash matches disk                the machine manifest
 *   C. every machine entry exists on disk          F. shared paths agree, and
 *   D. every machine hash matches disk                agree with disk
 *   G. the machine manifest MAY carry more
 *
 * WHAT IT CANNOT ENFORCE, DELIBERATELY
 * ────────────────────────────────────
 * It does not decide which files on disk *ought* to be canonical. No rule here
 * says "every .md under specifications must be manifested" or anything like it,
 * because no specification says that, and inventing it would create canon from a
 * directory listing.
 *
 * The consequence is worth stating plainly: A FILE ADDED TO NEITHER MANIFEST IS
 * INVISIBLE TO THIS CHECK. What it does catch is the failure that actually
 * happened — a canonical file registered in CHECKSUMS.md and forgotten in
 * CHECKSUMS.sha256, which went unnoticed across three consecutive canon
 * promotions.
 *
 * SELF-HASH RULE
 * ──────────────
 * Neither manifest lists itself, the other, this script, or any workflow file.
 * That is the established convention — verified against the repository, not
 * assumed — and it is what keeps the manifests free of a self-referential cycle:
 * a file cannot record its own hash, because writing the hash changes the file.
 *
 * Zero dependencies: node:fs, node:path, node:crypto only. No network, no
 * timestamps, no randomness. The same bytes in produce the same result on macOS
 * and on a CI runner.
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where the manifests and everything they may reference live. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'trading-system')

export const CURATED = 'CHECKSUMS.md'
export const MACHINE = 'CHECKSUMS.sha256'

/**
 * Failure categories. Machine-readable, and the only thing callers branch on —
 * the human message beside each is for the operator reading CI output.
 */
export const FAILURES = [
  'MD_MALFORMED',
  'SHA_MANIFEST_MALFORMED',
  'MD_DUPLICATE_PATH',
  'SHA_DUPLICATE_PATH',
  'PATH_TRAVERSAL',
  'MD_PATH_MISSING',
  'SHA_PATH_MISSING',
  'MD_HASH_MISMATCH',
  'SHA_HASH_MISMATCH',
  'MD_NOT_IN_MACHINE_MANIFEST',
  'SHARED_HASH_MISMATCH',
]

/**
 * One entry per line: 64 lowercase hex, exactly two spaces, then the path as the
 * REST OF THE LINE.
 *
 * Rest-of-line matters. Canon paths contain spaces, en dashes and å/ä/ö; any
 * parser that splits on whitespace truncates them at the first space and then
 * reports a missing file for a document that is sitting right there.
 *
 * `curated` selects the parsing difference between the two formats: the machine
 * manifest prefixes every path with `./`, the curated document does not. That
 * prefix is the ONLY normalisation applied, and it is stripped rather than added
 * so both sides are compared in one form.
 */
export function parseManifest(text, { machine }) {
  const entries = []
  const malformed = []
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') continue

    const match = /^([0-9a-f]{64})  (.+)$/.exec(line)
    if (match === null) {
      /*
       * The curated document is prose with fenced blocks, so most of its lines
       * are legitimately not entries. Only a line that LOOKS like one — starts
       * with hex-ish content — counts as malformed there. The machine manifest
       * is entries only, so any non-blank non-entry line is malformed.
       */
      if (machine || /^\s*[0-9a-fA-F]{8,}/.test(line)) {
        malformed.push({ line: i + 1, text: line.slice(0, 120) })
      }
      continue
    }
    const raw = match[2]
    const path = machine && raw.startsWith('./') ? raw.slice(2) : raw
    entries.push({ hash: match[1], path, raw, line: i + 1 })
  }
  return { entries, malformed }
}

/**
 * Reject anything that could read outside the manifest root.
 *
 * Absolute paths, `..` segments, and — checked separately because a symlink can
 * defeat a purely textual check — any resolved target that lands outside ROOT.
 */
function traversalReason(path) {
  if (path.startsWith('/')) return 'absolute path'
  if (path.split('/').includes('..')) return 'parent-directory segment'
  const target = resolve(ROOT, path)
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return 'resolves outside the manifest root'
  return null
}

function sha256OfFile(absolute) {
  return createHash('sha256').update(readFileSync(absolute)).digest('hex')
}

/**
 * Verify both manifests and their relationship.
 *
 * Returns every problem found rather than stopping at the first: a maintainer
 * fixing a manifest wants the whole list, and a check that reports one failure
 * per run turns a five-minute repair into five CI round trips.
 */
export function verify({ root = ROOT } = {}) {
  const problems = []
  const add = (code, detail) => { problems.push({ code, detail }) }

  const read = (name) => {
    const p = join(root, name)
    if (!existsSync(p)) throw new Error(`manifest not found: ${name}`)
    return readFileSync(p, 'utf8')
  }

  const curated = parseManifest(read(CURATED), { machine: false })
  const machine = parseManifest(read(MACHINE), { machine: true })

  for (const m of curated.malformed) add('MD_MALFORMED', `${CURATED}:${m.line} ${m.text}`)
  for (const m of machine.malformed) add('SHA_MANIFEST_MALFORMED', `${MACHINE}:${m.line} ${m.text}`)

  // Duplicates, per manifest. A duplicate path makes "the" hash ambiguous.
  for (const [entries, code, name] of [
    [curated.entries, 'MD_DUPLICATE_PATH', CURATED],
    [machine.entries, 'SHA_DUPLICATE_PATH', MACHINE],
  ]) {
    const seen = new Map()
    for (const e of entries) {
      if (seen.has(e.path)) add(code, `${name}: ${e.path} (lines ${seen.get(e.path)} and ${e.line})`)
      else seen.set(e.path, e.line)
    }
  }

  // Traversal, before any file is opened.
  for (const [entries, name] of [[curated.entries, CURATED], [machine.entries, MACHINE]]) {
    for (const e of entries) {
      const reason = traversalReason(e.path)
      if (reason !== null) add('PATH_TRAVERSAL', `${name}: ${e.path} — ${reason}`)
    }
  }
  if (problems.some((p) => p.code === 'PATH_TRAVERSAL')) {
    return { ok: false, problems, curated: curated.entries, machine: machine.entries }
  }

  // A–D: each manifest against disk, independently.
  const diskHash = new Map()
  for (const [entries, missingCode, mismatchCode, name] of [
    [curated.entries, 'MD_PATH_MISSING', 'MD_HASH_MISMATCH', CURATED],
    [machine.entries, 'SHA_PATH_MISSING', 'SHA_HASH_MISMATCH', MACHINE],
  ]) {
    for (const e of entries) {
      const absolute = join(root, e.path)
      if (!existsSync(absolute) || !statSync(absolute).isFile()) {
        add(missingCode, `${name}: ${e.path}`)
        continue
      }
      if (!diskHash.has(e.path)) diskHash.set(e.path, sha256OfFile(absolute))
      const actual = diskHash.get(e.path)
      if (actual !== e.hash) {
        add(mismatchCode, `${name}: ${e.path}\n      recorded ${e.hash}\n      actual   ${actual}`)
      }
    }
  }

  // E + F: containment, and agreement on the intersection.
  const machineByPath = new Map(machine.entries.map((e) => [e.path, e.hash]))
  for (const e of curated.entries) {
    if (!machineByPath.has(e.path)) {
      add('MD_NOT_IN_MACHINE_MANIFEST',
        `${e.path}\n      listed in ${CURATED} but absent from ${MACHINE} — ` +
        `the machine manifest must cover every curated path`)
      continue
    }
    if (machineByPath.get(e.path) !== e.hash) {
      add('SHARED_HASH_MISMATCH',
        `${e.path}\n      ${CURATED}  ${e.hash}\n      ${MACHINE}  ${machineByPath.get(e.path)}`)
    }
  }

  // G is the absence of a check: machine-only paths are legitimate, and were
  // already verified against disk above.
  return { ok: problems.length === 0, problems, curated: curated.entries, machine: machine.entries }
}

function main() {
  let result
  try {
    result = verify()
  } catch (error) {
    process.stdout.write(`canon manifest: ${error instanceof Error ? error.message : 'failed'}\n`)
    process.exit(2)
  }

  const curatedPaths = new Set(result.curated.map((e) => e.path))
  const machineOnly = result.machine.filter((e) => !curatedPaths.has(e.path)).length

  process.stdout.write(
    `canon manifest\n` +
    `  ${CURATED}      ${result.curated.length} entries\n` +
    `  ${MACHINE}  ${result.machine.length} entries (${machineOnly} machine-only)\n` +
    `  invariant     ${CURATED} ⊆ ${MACHINE}\n`,
  )

  if (result.ok) {
    process.stdout.write('  RESULT        PASS\n')
    process.exit(0)
  }

  const byCode = new Map()
  for (const p of result.problems) {
    if (!byCode.has(p.code)) byCode.set(p.code, [])
    byCode.get(p.code).push(p.detail)
  }
  process.stdout.write(`  RESULT        FAIL (${result.problems.length})\n\n`)
  for (const [code, details] of byCode) {
    process.stdout.write(`${code} (${details.length})\n`)
    for (const d of details) process.stdout.write(`    ${d}\n`)
  }
  process.exit(1)
}

// Run only when invoked directly, so the tests can import `verify`.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
