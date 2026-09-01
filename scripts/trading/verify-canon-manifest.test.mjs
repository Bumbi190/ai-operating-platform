#!/usr/bin/env node
/**
 * Omnira Trading — self-tests for the canon manifest verifier.
 *
 * WHY THIS IS A SCRIPT AND NOT A VITEST SUITE
 * ───────────────────────────────────────────
 * The repo's vitest config scopes `include` to `apps/web/**`, and the verifier
 * lives at the repository root because the documents it checks do. Pulling it
 * into the app's suite would mean either widening that config or moving a
 * repo-level tool under `apps/web`, and neither is worth it for a script whose
 * whole point is to have no dependencies. So the tests run the same way the
 * verifier does — `node`, built-ins only — and the CI job runs both.
 *
 * Every case builds a THROWAWAY fixture tree in os.tmpdir(). The real
 * `docs/trading-system` is read once, by the final case, and never written to.
 */

import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { verify, parseManifest } from './verify-canon-manifest.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

let passed = 0
const failures = []

function check(name, fn) {
  try {
    fn()
    passed += 1
    process.stdout.write(`  PASS  ${name}\n`)
  } catch (error) {
    failures.push({ name, error })
    process.stdout.write(`  FAIL  ${name}\n        ${error.message}\n`)
  }
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
const sha = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex')

/**
 * A fixture root with UTF-8, spaces and an en dash in the filenames — the exact
 * shapes canon uses, so a parser that word-splits fails here rather than in
 * production.
 */
const UNICODE = 'specifications/Omnira – Spec med å ä ö v1.0.md'
const PLAIN = 'README.md'
const MACHINE_ONLY = 'specifications/README.md'

function fixture({ mdEntries, shaEntries, files }) {
  const root = mkdtempSync(join(tmpdir(), 'omnira-manifest-'))
  for (const [path, body] of Object.entries(files)) {
    const abs = join(root, path)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body, 'utf8')
  }
  writeFileSync(
    join(root, 'CHECKSUMS.md'),
    '# Checksums\n\n```\n' + mdEntries.map(([h, p]) => `${h}  ${p}`).join('\n') + '\n```\n',
    'utf8',
  )
  writeFileSync(
    join(root, 'CHECKSUMS.sha256'),
    shaEntries.map(([h, p]) => `${h}  ./${p}`).join('\n') + '\n',
    'utf8',
  )
  return root
}

/** The clean baseline every negative control mutates exactly one thing from. */
function cleanFixture(overrides = {}) {
  const files = {
    [PLAIN]: 'hello\n',
    [UNICODE]: 'kanon\n',
    [MACHINE_ONLY]: 'index\n',
  }
  const md = [[sha(files[PLAIN]), PLAIN], [sha(files[UNICODE]), UNICODE]]
  const machine = [...md, [sha(files[MACHINE_ONLY]), MACHINE_ONLY]]
  return fixture({ mdEntries: overrides.md ?? md, shaEntries: overrides.sha ?? machine, files })
}

const codes = (root) => new Set(verify({ root }).problems.map((p) => p.code))

process.stdout.write('canon manifest verifier — self-tests\n\n')

// ─── Parser ───────────────────────────────────────────────────────────────────

check('parses 64-hex + two spaces + rest-of-line', () => {
  const { entries, malformed } = parseManifest(`${'a'.repeat(64)}  dir/a b – c.md\n`, { machine: false })
  assert(entries.length === 1, 'one entry')
  assert(entries[0].path === 'dir/a b – c.md', `path kept whole, got ${entries[0].path}`)
  assert(malformed.length === 0, 'no malformed')
})

check('strips the ./ prefix in the machine manifest only', () => {
  const m = parseManifest(`${'b'.repeat(64)}  ./x.md\n`, { machine: true })
  const c = parseManifest(`${'b'.repeat(64)}  ./x.md\n`, { machine: false })
  assert(m.entries[0].path === 'x.md', 'machine strips')
  assert(c.entries[0].path === './x.md', 'curated does not')
})

check('ignores prose in the curated document but not in the machine manifest', () => {
  const prose = parseManifest('# Heading\n\nSome text.\n', { machine: false })
  assert(prose.malformed.length === 0, 'prose is not malformed in a document')
  const junk = parseManifest('not an entry\n', { machine: true })
  assert(junk.malformed.length === 1, 'machine manifest rejects a non-entry line')
})

check('rejects a short or uppercase hash', () => {
  const short = parseManifest(`${'a'.repeat(63)}  x.md\n`, { machine: true })
  const upper = parseManifest(`${'A'.repeat(64)}  x.md\n`, { machine: true })
  assert(short.entries.length === 0 && short.malformed.length === 1, 'short rejected')
  assert(upper.entries.length === 0 && upper.malformed.length === 1, 'uppercase rejected')
})

// ─── Clean baseline ───────────────────────────────────────────────────────────

check('a clean containment fixture passes', () => {
  const root = cleanFixture()
  const r = verify({ root })
  assert(r.ok, `expected pass, got ${JSON.stringify(r.problems)}`)
  assert(r.curated.length === 2 && r.machine.length === 3, 'subset of superset')
  rmSync(root, { recursive: true, force: true })
})

// ─── §10 Negative controls ────────────────────────────────────────────────────

check('A. altered machine-manifest hash → SHA_HASH_MISMATCH', () => {
  const root = cleanFixture()
  const p = join(root, 'CHECKSUMS.sha256')
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^[0-9a-f]{64}/m, 'f'.repeat(64)), 'utf8')
  const c = codes(root)
  assert(c.has('SHA_HASH_MISMATCH'), [...c].join())
  rmSync(root, { recursive: true, force: true })
})

check('B. curated path missing from the machine manifest → MD_NOT_IN_MACHINE_MANIFEST', () => {
  const files = { [PLAIN]: 'hello\n', [UNICODE]: 'kanon\n' }
  const md = [[sha(files[PLAIN]), PLAIN], [sha(files[UNICODE]), UNICODE]]
  const root = fixture({ mdEntries: md, shaEntries: [md[0]], files })   // UNICODE dropped
  const c = codes(root)
  assert(c.has('MD_NOT_IN_MACHINE_MANIFEST'), [...c].join())
  rmSync(root, { recursive: true, force: true })
})

check('C. a valid machine-only entry PASSES — containment, not equality', () => {
  const root = cleanFixture()
  const r = verify({ root })
  assert(r.ok, 'machine-only entry must not fail')
  const curated = new Set(r.curated.map((e) => e.path))
  assert(r.machine.some((e) => !curated.has(e.path)), 'fixture really has a machine-only entry')
  rmSync(root, { recursive: true, force: true })
})

check('D. machine-only entry with a wrong hash → SHA_HASH_MISMATCH', () => {
  const files = { [PLAIN]: 'hello\n', [MACHINE_ONLY]: 'index\n' }
  const md = [[sha(files[PLAIN]), PLAIN]]
  const root = fixture({
    mdEntries: md,
    shaEntries: [...md, ['0'.repeat(64), MACHINE_ONLY]],
    files,
  })
  assert(codes(root).has('SHA_HASH_MISMATCH'), 'machine-only is still verified')
  rmSync(root, { recursive: true, force: true })
})

check('E. machine-only entry pointing at a missing file → SHA_PATH_MISSING', () => {
  const files = { [PLAIN]: 'hello\n' }
  const md = [[sha(files[PLAIN]), PLAIN]]
  const root = fixture({ mdEntries: md, shaEntries: [...md, [sha('x'), 'gone.md']], files })
  assert(codes(root).has('SHA_PATH_MISSING'), 'missing machine-only file caught')
  rmSync(root, { recursive: true, force: true })
})

check('F. altered curated hash → MD_HASH_MISMATCH and SHARED_HASH_MISMATCH', () => {
  const root = cleanFixture()
  const p = join(root, 'CHECKSUMS.md')
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^[0-9a-f]{64}/m, 'e'.repeat(64)), 'utf8')
  const c = codes(root)
  assert(c.has('MD_HASH_MISMATCH'), 'disk mismatch')
  assert(c.has('SHARED_HASH_MISMATCH'), 'and the two manifests disagree')
  rmSync(root, { recursive: true, force: true })
})

check('G. duplicate path in either manifest → *_DUPLICATE_PATH', () => {
  const files = { [PLAIN]: 'hello\n' }
  const e = [sha(files[PLAIN]), PLAIN]
  const dupMachine = fixture({ mdEntries: [e], shaEntries: [e, e], files })
  assert(codes(dupMachine).has('SHA_DUPLICATE_PATH'), 'machine duplicate')
  rmSync(dupMachine, { recursive: true, force: true })

  const dupCurated = fixture({ mdEntries: [e, e], shaEntries: [e], files })
  assert(codes(dupCurated).has('MD_DUPLICATE_PATH'), 'curated duplicate')
  rmSync(dupCurated, { recursive: true, force: true })
})

check('H. path traversal is rejected before any file is opened → PATH_TRAVERSAL', () => {
  const files = { [PLAIN]: 'hello\n' }
  for (const evil of ['../../etc/passwd', '/etc/passwd', 'a/../../b.md']) {
    const root = fixture({
      mdEntries: [[sha(files[PLAIN]), PLAIN]],
      shaEntries: [[sha(files[PLAIN]), PLAIN], [sha('x'), evil]],
      files,
    })
    const c = codes(root)
    assert(c.has('PATH_TRAVERSAL'), `${evil} not rejected: ${[...c].join()}`)
    rmSync(root, { recursive: true, force: true })
  }
})

check('I. UTF-8 path with spaces and an en dash verifies correctly', () => {
  const root = cleanFixture()
  const r = verify({ root })
  assert(r.ok, 'clean')
  assert(r.curated.some((e) => e.path === UNICODE), 'the unicode path parsed whole')

  // And a single byte changed in that file is caught.
  writeFileSync(join(root, UNICODE), 'kanon ändrad\n', 'utf8')
  assert(codes(root).has('MD_HASH_MISMATCH'), 'byte change in a unicode-named file caught')
  rmSync(root, { recursive: true, force: true })
})

check('J. shared path correct in machine manifest, wrong in curated → SHARED_HASH_MISMATCH', () => {
  const files = { [PLAIN]: 'hello\n' }
  const root = fixture({
    mdEntries: [['1'.repeat(64), PLAIN]],          // wrong
    shaEntries: [[sha(files[PLAIN]), PLAIN]],      // right
    files,
  })
  const c = codes(root)
  assert(c.has('SHARED_HASH_MISMATCH'), 'disagreement caught')
  assert(c.has('MD_HASH_MISMATCH'), 'and the curated side is wrong against disk')
  rmSync(root, { recursive: true, force: true })
})

check('changing a real fixture file byte → MD_HASH_MISMATCH', () => {
  const root = cleanFixture()
  writeFileSync(join(root, PLAIN), 'hello!\n', 'utf8')
  assert(codes(root).has('MD_HASH_MISMATCH'), 'content drift caught')
  rmSync(root, { recursive: true, force: true })
})

check('a malformed machine-manifest line → SHA_MANIFEST_MALFORMED', () => {
  const root = cleanFixture()
  const p = join(root, 'CHECKSUMS.sha256')
  writeFileSync(p, readFileSync(p, 'utf8') + 'garbage line\n', 'utf8')
  assert(codes(root).has('SHA_MANIFEST_MALFORMED'), 'malformed caught')
  rmSync(root, { recursive: true, force: true })
})

// ─── The real repository ──────────────────────────────────────────────────────

check('the canonical repository passes', () => {
  const r = verify()
  assert(r.ok, `real manifests failed: ${JSON.stringify(r.problems, null, 2)}`)
  assert(r.curated.length > 0 && r.machine.length >= r.curated.length, 'superset holds')
  const curated = new Set(r.curated.map((e) => e.path))
  const only = r.machine.filter((e) => !curated.has(e.path)).map((e) => e.path)
  process.stdout.write(
    `        ${r.curated.length} curated ⊆ ${r.machine.length} machine (${only.length} machine-only)\n`,
  )
})

check('neither manifest hashes itself, this script, or a workflow', () => {
  // The self-hash exclusion rule, asserted rather than assumed.
  const r = verify()
  const all = [...r.curated, ...r.machine].map((e) => e.path)
  for (const forbidden of ['CHECKSUMS.md', 'CHECKSUMS.sha256']) {
    assert(!all.includes(forbidden), `${forbidden} must not appear in a manifest`)
  }
  for (const p of all) {
    assert(!p.startsWith('scripts/') && !p.startsWith('.github/'),
      `manifests cover documents only, found ${p}`)
  }
  assert(REPO.length > 0, 'repo root resolved')
})

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`)
process.exit(failures.length === 0 ? 0 : 1)
