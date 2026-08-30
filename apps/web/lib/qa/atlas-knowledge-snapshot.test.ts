/**
 * Knowledge Projection Slice 3A — the deterministic snapshot core.
 *
 * Pure and local. No vault is opened, no worktree created, nothing uploaded,
 * nothing published. Every artifact here is built from explicit fixture input.
 *
 * The load-bearing property is BYTE identity, not JSON equivalence. These bytes
 * are hashed into `snapshot_id`, so a test that parses both sides and compares
 * objects would pass while the two files differed in key order, indentation or
 * line endings — which is exactly the failure that would make a snapshot
 * unverifiable by a reader implemented from the spec in another language.
 * Comparisons below are therefore against exact strings and exact bytes.
 *
 * The golden fixtures in `__fixtures__/knowledge-snapshot/` were derived
 * INDEPENDENTLY of the code under test — hand-ordered object literals plus
 * node:crypto — so agreeing with them is evidence, not a tautology.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

import {
  canonicalCompactJson, canonicalPrettyJson, deepCanonicalValue, utf8Bytes,
  isArrayIndexKey, CanonicalValueError,
} from '@/lib/atlas/knowledge/projection/canonical-json'
import {
  checkCanonicalPath, isValidCanonicalPath, checkVaultRelativePath, CANONICAL_PATH_MAX_LENGTH,
} from '@/lib/atlas/knowledge/projection/canonical-path'
import {
  buildKnowledgeSnapshot, buildRemoteRecord, renderDocumentsJsonl, renderIdentityPreimage,
  assertNoCollisions, compareDocumentPath, verifyManifest, sourceBytesHash, decodeSourceBytes,
  SnapshotBuildError, KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION,
  type SnapshotDocumentInput,
} from '@/lib/atlas/knowledge/projection/snapshot'
import { parseKnowledgeDocument } from '@/lib/atlas/knowledge/document'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, '__fixtures__/knowledge-snapshot')
const KNOWLEDGE_DIR = join(HERE, '../atlas/knowledge')

const sha = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex')
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const PROJECT_UUID = '9f2c1e84-3b7a-4d51-8c6e-2a0f7b93d145'

// ── fixture documents, matching the goldens exactly ──────────────────────────

const DOC_BOUNDARY: SnapshotDocumentInput = {
  path: '10 Architecture/Boundary.md',
  title: 'Boundary',
  type: 'architecture',
  classification: 'internal',
  scope: { kind: 'platform' },
  sourceOfTruth: 'repository',
  canonicalPath: 'apps/web/lib/atlas/memory/',
  content: '# Boundary\n\nKnowledge is data, never authority.\n',
}

const DOC_ALPHA: SnapshotDocumentInput = {
  path: '10 Architecture/alpha.md',
  title: 'Alpha',
  type: 'reference',
  classification: 'public',
  scope: { kind: 'platform' },
  sourceOfTruth: 'vault',
  content: '# Alpha\n\nCRLF och LF ger samma innehåll.\nRad två.\n',
}

const DOC_PILOT: SnapshotDocumentInput = {
  path: '30 Projects/pilot.md',
  title: 'Pilot',
  type: 'project',
  classification: 'internal',
  scope: { kind: 'project', projectId: PROJECT_UUID },
  sourceOfTruth: 'external',
  content: '# Pilot\n\nScoped to one project.\n',
}

const ALL_DOCS = [DOC_BOUNDARY, DOC_ALPHA, DOC_PILOT]

/** Strip comments so a structural scan reads code, not the prose about it. */
function codeOf(file: string): string {
  return readFileSync(join(KNOWLEDGE_DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// ═════════════════════════════════════════════════════════════════════════════
// 1–5, 45. Canonical serializer — exact bytes and ordering
// ═════════════════════════════════════════════════════════════════════════════

describe('canonical serializers — exact bytes', () => {
  it('1. compact output is byte-exact, with no whitespace and no terminal newline', () => {
    expect(canonicalCompactJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(canonicalCompactJson([])).toBe('[]')
    expect(canonicalCompactJson({})).toBe('{}')
    expect(canonicalCompactJson({ a: 1 }).endsWith('\n')).toBe(false)
  })

  it('2. pretty output is byte-exact: 2-space indent and exactly one terminal LF', () => {
    expect(canonicalPrettyJson({ b: 1, a: 2 })).toBe('{\n  "a": 2,\n  "b": 1\n}\n')
    const rendered = canonicalPrettyJson({ nested: { z: 1, a: 2 } })
    expect(rendered).toBe('{\n  "nested": {\n    "a": 2,\n    "z": 1\n  }\n}\n')
    expect(rendered.endsWith('\n')).toBe(true)
    expect(rendered.endsWith('\n\n')).toBe(false)
  })

  it('3. key ordering is recursive, at every depth', () => {
    expect(canonicalCompactJson({ b: { d: 1, c: { f: 1, e: 2 } }, a: 3 }))
      .toBe('{"a":3,"b":{"c":{"e":2,"f":1},"d":1}}')
  })

  it('4. arrays preserve declared order — order is data, never sorted', () => {
    expect(canonicalCompactJson(['c', 'a', 'b'])).toBe('["c","a","b"]')
    expect(canonicalCompactJson([3, 1, 2])).toBe('[3,1,2]')
    expect(canonicalCompactJson({ list: [{ b: 1, a: 2 }, { d: 1, c: 2 }] }))
      .toBe('{"list":[{"a":2,"b":1},{"c":2,"d":1}]}')
  })

  it('5. ordering is UTF-16 code unit, NOT locale collation', () => {
    // The discriminating pair: code units put 'B' (0x42) before 'a' (0x61);
    // every locale collation puts 'a' before 'B'.
    expect(canonicalCompactJson({ a: 1, B: 2 })).toBe('{"B":2,"a":1}')
    expect(['a', 'B'].sort((x, y) => x.localeCompare(y))).toEqual(['a', 'B'])
    expect(['a', 'B'].sort()).toEqual(['B', 'a'])
  })

  it('45. code-unit ordering places non-ASCII keys by code unit', () => {
    // 'A'=0x41, 'z'=0x7A, 'ö'=0xF6 — every non-ASCII key sorts after plain ASCII.
    expect(canonicalCompactJson({ 'ö': 1, z: 2, A: 3 })).toBe('{"A":3,"z":2,"ö":1}')
    // Non-ASCII is emitted literally, never \u-escaped. The escape set is fixed
    // by spec, so this is deterministic across engines.
    expect(canonicalCompactJson({ k: 'två' })).toBe('{"k":"två"}')
  })

  it('the serializers do not use stableJson or localeCompare', () => {
    // stableJson orders keys with localeCompare, so the same input could hash
    // differently after an ICU update. This is the guard against someone
    // "simplifying" the module back onto the repo's existing helper.
    for (const file of ['projection/canonical-json.ts', 'projection/snapshot.ts']) {
      expect(codeOf(file).includes('stableJson'), `${file} uses stableJson`).toBe(false)
      expect(codeOf(file).includes('localeCompare'), `${file} uses localeCompare`).toBe(false)
      expect(codeOf(file).includes('toLocaleLowerCase'), `${file} uses locale casing`).toBe(false)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 6–13. Value domain — everything JSON.stringify would silently mangle
// ═════════════════════════════════════════════════════════════════════════════

describe('canonical value domain — rejects every silent JSON.stringify behaviour', () => {
  it('6. forbidden value types throw', () => {
    const forbidden: Array<[string, unknown]> = [
      ['undefined', { k: undefined }],
      ['NaN', { k: NaN }],
      ['Infinity', { k: Infinity }],
      ['-Infinity', { k: -Infinity }],
      ['BigInt', { k: BigInt(1) }],
      ['Date', { k: new Date(0) }],
      ['Map', { k: new Map() }],
      ['Set', { k: new Set() }],
      ['function', { k: () => 1 }],
      ['symbol value', { k: Symbol('s') }],
      ['bare undefined', undefined],
    ]
    for (const [label, value] of forbidden) {
      expect(() => canonicalCompactJson(value), label).toThrow(CanonicalValueError)
    }
  })

  it('7. unsafe integers and non-integers throw', () => {
    expect(() => canonicalCompactJson({ k: 1.5 })).toThrow(CanonicalValueError)
    expect(() => canonicalCompactJson({ k: Number.MAX_SAFE_INTEGER + 1 })).toThrow(CanonicalValueError)
    expect(() => canonicalCompactJson({ k: 1e21 })).toThrow(CanonicalValueError)
    // Safe integers, including negative and zero, are fine.
    expect(canonicalCompactJson({ k: Number.MAX_SAFE_INTEGER })).toBe('{"k":9007199254740991}')
    expect(canonicalCompactJson({ k: -7 })).toBe('{"k":-7}')
    expect(canonicalCompactJson({ k: 0 })).toBe('{"k":0}')
  })

  it('8. -0 throws — JSON.stringify would collapse it to 0', () => {
    expect(() => canonicalCompactJson({ k: -0 })).toThrow(/-0 is not canonical/)
    expect(JSON.stringify({ k: -0 })).toBe('{"k":0}') // the behaviour being refused
  })

  it('9. an own toJSON throws — a value may not rewrite its own bytes', () => {
    expect(() => canonicalCompactJson({ toJSON: () => 'hijacked' })).toThrow(/toJSON/)
    expect(() => canonicalCompactJson({ inner: { toJSON: () => 1 } })).toThrow(/toJSON/)
  })

  it('10. accessor properties throw — hashing must not invoke caller code', () => {
    let invoked = 0
    const withGetter = { get k() { invoked += 1; return 1 } }
    expect(() => canonicalCompactJson(withGetter)).toThrow(/accessor/)
    expect(invoked).toBe(0)
  })

  it('11. symbol-keyed own properties throw', () => {
    const value: Record<string, unknown> = { a: 1 }
    ;(value as Record<symbol, unknown>)[Symbol('hidden')] = 2
    expect(() => canonicalCompactJson(value)).toThrow(/symbol-keyed/)
  })

  it('12. non-enumerable own properties throw', () => {
    const value = { visible: 1 }
    Object.defineProperty(value, 'hidden', { value: 2, enumerable: false })
    expect(() => canonicalCompactJson(value)).toThrow(/non-enumerable/)
  })

  it('13. class instances and custom prototypes throw', () => {
    class Note { constructor(public title = 't') {} }
    expect(() => canonicalCompactJson(new Note())).toThrow(/not a plain object/)
    expect(() => canonicalCompactJson(Object.create({ inherited: 1 }))).toThrow(/not a plain object/)
    expect(() => canonicalCompactJson({ k: new Note() })).toThrow(/not a plain object/)
  })

  it('a null prototype is accepted deliberately — it is the repo idiom for safe maps', () => {
    const safe = Object.create(null) as Record<string, unknown>
    safe.b = 1
    safe.a = 2
    expect(canonicalCompactJson(safe)).toBe('{"a":2,"b":1}')
  })

  it('array holes throw — JSON.stringify would silently emit null', () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 3]
    expect(() => canonicalCompactJson(sparse)).toThrow(/hole/)
    expect(JSON.stringify(sparse)).toBe('[1,null,3]') // the behaviour being refused
  })

  it('non-index own properties on an array throw — silently dropped otherwise', () => {
    const arr: unknown[] = [1, 2]
    ;(arr as unknown as Record<string, unknown>).extra = 3
    expect(() => canonicalCompactJson(arr)).toThrow(/non-index own property/)
    expect(JSON.stringify(arr)).toBe('[1,2]') // the behaviour being refused
  })

  it('array-index keys on a plain object throw — JS would reorder them ahead of the sort', () => {
    // Documented ordering says "10" < "9". The engine disagrees and wins, so the
    // ambiguous case is refused rather than silently contradicting the spec.
    expect(JSON.stringify({ '10': 1, '9': 2 })).toBe('{"9":2,"10":1}')
    expect(['10', '9'].sort()).toEqual(['10', '9'])
    expect(() => canonicalCompactJson({ '10': 1, '9': 2 })).toThrow(/array-index key/)
    expect(() => canonicalCompactJson({ '0': 1 })).toThrow(/array-index key/)
    // Non-canonical numeric strings are ordinary keys and stay allowed.
    expect(canonicalCompactJson({ '01': 1, '-1': 2, '1.5': 3 }))
      .toBe('{"-1":2,"01":1,"1.5":3}')
    expect(isArrayIndexKey('0')).toBe(true)
    expect(isArrayIndexKey('4294967294')).toBe(true)
    expect(isArrayIndexKey('4294967295')).toBe(false)
    expect(isArrayIndexKey('01')).toBe(false)
  })

  it('a "__proto__" data key survives serialization instead of vanishing', () => {
    // A plain {} accumulator would invoke the inherited __proto__ setter: the
    // prototype changes, no own property is created, and the key silently
    // disappears from the hashed bytes.
    const source = {} as Record<string, unknown>
    Object.defineProperty(source, '__proto__', {
      value: 'plain-string', enumerable: true, writable: true, configurable: true,
    })
    expect(canonicalCompactJson(source)).toBe('{"__proto__":"plain-string"}')
    const naive = {} as Record<string, unknown>
    naive['__proto__'] = { a: 1 }
    expect(JSON.stringify(naive)).toBe('{}') // the behaviour being refused
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 14–16. Cycle vs DAG
// ═════════════════════════════════════════════════════════════════════════════

describe('cycles and DAGs are different things', () => {
  it('14. a true cycle throws', () => {
    const a: Record<string, unknown> = {}
    a.self = a
    expect(() => canonicalCompactJson(a)).toThrow(/contains itself/)

    const x: Record<string, unknown> = {}
    const y: Record<string, unknown> = { x }
    x.y = y
    expect(() => canonicalCompactJson(x)).toThrow(/contains itself/)

    const arr: unknown[] = []
    arr.push(arr)
    expect(() => canonicalCompactJson(arr)).toThrow(/contains itself/)
  })

  it('15. a shared reference without a cycle serializes normally', () => {
    const shared = { value: 1 }
    expect(canonicalCompactJson({ a: shared, b: shared }))
      .toBe('{"a":{"value":1},"b":{"value":1}}')
    // Repeated in an array, and repeated deeper than one level.
    expect(canonicalCompactJson([shared, shared, shared]))
      .toBe('[{"value":1},{"value":1},{"value":1}]')
    expect(canonicalCompactJson({ outer: { inner: shared }, also: shared }))
      .toBe('{"also":{"value":1},"outer":{"inner":{"value":1}}}')
  })

  it('16. DAG bytes are identical to the equivalent duplicated tree', () => {
    const shared = { z: 1, a: 2 }
    const dag = { p: shared, q: shared }
    const duplicated = { p: { z: 1, a: 2 }, q: { z: 1, a: 2 } }
    expect(canonicalCompactJson(dag)).toBe(canonicalCompactJson(duplicated))
    expect(canonicalCompactJson(dag)).toBe('{"p":{"a":2,"z":1},"q":{"a":2,"z":1}}')
  })

  it('the active path unwinds — a sibling reuse after a deep descent is not a cycle', () => {
    const leaf = { v: 1 }
    const deep = { l1: { l2: { l3: leaf } } }
    expect(() => canonicalCompactJson({ deep, leaf })).not.toThrow()
    expect(deepCanonicalValue({ a: leaf, b: leaf })).toEqual({ a: { v: 1 }, b: { v: 1 } })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 17–21. documents.jsonl bytes
// ═════════════════════════════════════════════════════════════════════════════

describe('documents.jsonl — exact bytes', () => {
  it('17. zero records is exactly 0 bytes, and hashes as the empty string', () => {
    const snapshot = buildKnowledgeSnapshot([])
    expect(snapshot.documentsJsonl).toBe('')
    expect(utf8Bytes(snapshot.documentsJsonl).length).toBe(0)
    expect(snapshot.documentsHash).toBe(EMPTY_SHA256)
    expect(snapshot.documentsHash).toBe(sha(Buffer.alloc(0)))
    expect(snapshot.manifest.document_count).toBe(0)
  })

  it('18. one record is exactly one LF-terminated physical line', () => {
    const jsonl = buildKnowledgeSnapshot([DOC_ALPHA]).documentsJsonl
    expect(jsonl.endsWith('\n')).toBe(true)
    expect(jsonl.endsWith('\n\n')).toBe(false)
    expect(jsonl.split('\n').filter((l) => l !== '')).toHaveLength(1)
    expect(utf8Bytes(jsonl).filter((b) => b === 0x0a)).toHaveLength(1)
  })

  it('19. embedded LF, CR, CRLF and U+2028 cannot make a record span physical lines', () => {
    const jsonl = buildKnowledgeSnapshot([{
      ...DOC_ALPHA,
      content: 'line one\nline two\r\nline three\rline four\u2028line five\u2029end',
    }]).documentsJsonl
    const bytes = utf8Bytes(jsonl)
    // Exactly one LF byte: the terminator. JSON.stringify escaped every other.
    expect(bytes.filter((b) => b === 0x0a)).toHaveLength(1)
    expect(bytes.includes(0x0d)).toBe(false)
    expect(jsonl.split('\n').filter((l) => l !== '')).toHaveLength(1)
    // The content survives intact through a round trip.
    const parsed = JSON.parse(jsonl.trimEnd()) as { content: string }
    expect(parsed.content).toContain('\r\n')
    expect(parsed.content).toContain('\u2028')
  })

  it('20. multiple records have no blank lines and exactly one terminal LF', () => {
    const jsonl = buildKnowledgeSnapshot(ALL_DOCS).documentsJsonl
    const lines = jsonl.split('\n')
    expect(lines[lines.length - 1]).toBe('') // the terminator, nothing after it
    const records = lines.slice(0, -1)
    expect(records).toHaveLength(3)
    expect(records.every((l) => l !== '')).toBe(true)
    expect(utf8Bytes(jsonl).filter((b) => b === 0x0a)).toHaveLength(3)
    for (const line of records) expect(() => JSON.parse(line)).not.toThrow()
  })

  it('21. documents_hash hashes the exact JSONL bytes, not a logical representation', () => {
    const snapshot = buildKnowledgeSnapshot(ALL_DOCS)
    expect(snapshot.documentsHash).toBe(sha(Buffer.from(snapshot.documentsJsonl, 'utf8')))
    // Not the hash of the record array, and not of a re-stringified parse.
    expect(snapshot.documentsHash)
      .not.toBe(sha(Buffer.from(JSON.stringify(snapshot.records), 'utf8')))
  })

  it('documents are ordered by path code unit, independent of input order', () => {
    const forward = buildKnowledgeSnapshot([DOC_BOUNDARY, DOC_ALPHA, DOC_PILOT])
    const shuffled = buildKnowledgeSnapshot([DOC_PILOT, DOC_ALPHA, DOC_BOUNDARY])
    expect(shuffled.documentsJsonl).toBe(forward.documentsJsonl)
    expect(forward.records.map((r) => r.path)).toEqual([
      '10 Architecture/Boundary.md', // 'B' (0x42) before 'a' (0x61)
      '10 Architecture/alpha.md',
      '30 Projects/pilot.md',
    ])
    // Under locale collation 'alpha.md' would come first. It must not.
    const localeOrder = ['10 Architecture/Boundary.md', '10 Architecture/alpha.md']
      .sort((a, b) => a.localeCompare(b))
    expect(localeOrder[0]).toBe('10 Architecture/alpha.md')
    expect(compareDocumentPath('10 Architecture/Boundary.md', '10 Architecture/alpha.md')).toBe(-1)
  })

  it('the ordering comparator matches the expression Slice 1 pinned in source.ts', () => {
    // source.ts:  (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    const slice1 = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
    const sample = ['b', 'B', 'a', 'A', 'ö', '0', '10', '9', 'z Z', 'z-z']
    expect([...sample].sort(compareDocumentPath)).toEqual([...sample].sort(slice1))
    expect(codeOf('projection/source.ts')).toContain('a.path < b.path')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 22–27. Identity and manifest
// ═════════════════════════════════════════════════════════════════════════════

describe('snapshot identity — Model B', () => {
  it('22. the identity preimage is exact compact bytes with no terminal newline', () => {
    const snapshot = buildKnowledgeSnapshot(ALL_DOCS)
    expect(snapshot.identityPreimage).toBe(
      `{"document_count":3,"documents_hash":"${snapshot.documentsHash}",` +
      `"schema_version":"${KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION}"}`,
    )
    expect(snapshot.identityPreimage.endsWith('\n')).toBe(false)
    expect(snapshot.snapshotId).toBe(sha(Buffer.from(snapshot.identityPreimage, 'utf8')))
    expect(renderIdentityPreimage(KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION, 3, snapshot.documentsHash))
      .toBe(snapshot.identityPreimage)
  })

  it('23. publisher provenance cannot reach identity — same content, same snapshot_id', () => {
    const clean = buildKnowledgeSnapshot(ALL_DOCS)
    // There is no publisher_version parameter to vary: provenance lives on the
    // publication event, which this slice does not implement. Prove it three ways.
    expect(Object.keys(clean.manifest)).not.toContain('publisher_version')
    expect(clean.manifest).not.toHaveProperty('vault_git_commit')
    expect(clean.manifest).not.toHaveProperty('published_at')
    expect(clean.identityPreimage).not.toContain('publisher')
    expect(buildKnowledgeSnapshot(ALL_DOCS).snapshotId).toBe(clean.snapshotId)
  })

  it('24. any change to remote content changes documents_hash and snapshot_id', () => {
    const base = buildKnowledgeSnapshot(ALL_DOCS)
    const edited = buildKnowledgeSnapshot([
      { ...DOC_BOUNDARY, content: `${DOC_BOUNDARY.content}One more line.\n` },
      DOC_ALPHA, DOC_PILOT,
    ])
    expect(edited.documentsHash).not.toBe(base.documentsHash)
    expect(edited.snapshotId).not.toBe(base.snapshotId)
    // A title-only change moves it too — every whitelisted field is in the bytes.
    const retitled = buildKnowledgeSnapshot([
      { ...DOC_BOUNDARY, title: 'Boundaries' }, DOC_ALPHA, DOC_PILOT,
    ])
    expect(retitled.snapshotId).not.toBe(base.snapshotId)
    // Removing a document moves both count and hash.
    const fewer = buildKnowledgeSnapshot([DOC_BOUNDARY, DOC_ALPHA])
    expect(fewer.manifest.document_count).toBe(2)
    expect(fewer.snapshotId).not.toBe(base.snapshotId)
  })

  it('a schema_version change alters identity even when the bytes are identical', () => {
    const v1 = buildKnowledgeSnapshot(ALL_DOCS)
    const v2 = buildKnowledgeSnapshot(ALL_DOCS, { schemaVersion: 'knowledge-projection-v2' })
    expect(v2.documentsHash).toBe(v1.documentsHash)
    expect(v2.snapshotId).not.toBe(v1.snapshotId)
  })
})

describe('knowledge-manifest.json — exact schema and bytes', () => {
  it('25. the manifest has exactly four keys', () => {
    const snapshot = buildKnowledgeSnapshot(ALL_DOCS)
    expect(Object.keys(snapshot.manifest).sort())
      .toEqual(['document_count', 'documents_hash', 'schema_version', 'snapshot_id'])
    const parsed = JSON.parse(snapshot.manifestJson) as Record<string, unknown>
    expect(Object.keys(parsed).sort())
      .toEqual(['document_count', 'documents_hash', 'schema_version', 'snapshot_id'])
    for (const forbidden of [
      'publisher_version', 'vault_git_commit', 'published_at', 'operator', 'created_at',
    ]) {
      expect(parsed, forbidden).not.toHaveProperty(forbidden)
    }
  })

  it('26. the manifest is pretty-printed with exactly one trailing LF and no BOM', () => {
    const { manifestJson } = buildKnowledgeSnapshot(ALL_DOCS)
    expect(manifestJson.endsWith('\n')).toBe(true)
    expect(manifestJson.endsWith('\n\n')).toBe(false)
    expect(manifestJson.startsWith('{\n  "document_count": 3,\n')).toBe(true)
    const bytes = utf8Bytes(manifestJson)
    expect(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf).toBe(false)
    expect(bytes.includes(0x0d)).toBe(false)
  })

  it('27. the manifest self-verifies, and rejects tampering', () => {
    const snapshot = buildKnowledgeSnapshot(ALL_DOCS)
    expect(verifyManifest(snapshot.manifest, snapshot.documentsJsonl)).toBe(true)
    // Tampered snapshot_id.
    expect(verifyManifest(
      { ...snapshot.manifest, snapshot_id: EMPTY_SHA256 }, snapshot.documentsJsonl,
    )).toBe(false)
    // Tampered count, hash untouched.
    expect(verifyManifest(
      { ...snapshot.manifest, document_count: 2 }, snapshot.documentsJsonl,
    )).toBe(false)
    // Payload reordered: same records, different bytes.
    const reordered = snapshot.documentsJsonl.trimEnd().split('\n').reverse().join('\n') + '\n'
    expect(verifyManifest(snapshot.manifest, reordered)).toBe(false)
    // A record removed.
    const truncated = snapshot.documentsJsonl.split('\n').slice(0, 2).join('\n') + '\n'
    expect(verifyManifest(snapshot.manifest, truncated)).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 28–37. Canonical pointer grammar and the record's pointer contract
// ═════════════════════════════════════════════════════════════════════════════

describe('canonical_path grammar', () => {
  it('28. a repository file pointer is valid', () => {
    for (const value of [
      'apps/web/lib/atlas/memory/record-event.ts',
      'docs/architecture/executive-intelligence/README.md',
      'decisions/adr-014.md',
      'docs/My File With Spaces.md',
    ]) {
      expect(checkCanonicalPath(value), value).toEqual({ valid: true, violations: [] })
    }
  })

  it('29. a directory pointer with exactly one trailing slash is valid', () => {
    // Both are live in the vault today on approved, currently-eligible notes.
    expect(isValidCanonicalPath('docs/')).toBe(true)
    expect(isValidCanonicalPath('apps/web/lib/atlas/memory/')).toBe(true)
    // A second trailing slash is not a directory pointer, it is a malformed one.
    expect(checkCanonicalPath('docs//').violations).toContain('empty_segment')
  })

  it('30. traversal and dot segments are rejected', () => {
    expect(checkCanonicalPath('../x').violations).toContain('dotdot_segment')
    expect(checkCanonicalPath('a/../b').violations).toContain('dotdot_segment')
    expect(checkCanonicalPath('a/./b').violations).toContain('dot_segment')
    expect(checkCanonicalPath('.').violations).toContain('dot_segment')
    expect(checkCanonicalPath('..').violations).toContain('dotdot_segment')
    expect(checkCanonicalPath('a/..').violations).toContain('dotdot_segment')
  })

  it('31. absolute and home-relative paths are rejected', () => {
    expect(checkCanonicalPath('/etc/passwd').violations).toContain('absolute')
    expect(checkCanonicalPath('/').violations).toContain('absolute')
    expect(checkCanonicalPath('~/x').violations).toContain('home_relative')
    expect(checkCanonicalPath('~').violations).toContain('home_relative')
  })

  it('32. backslashes are rejected', () => {
    expect(checkCanonicalPath('apps\\web').violations).toContain('backslash')
    expect(checkCanonicalPath('a/b\\c').violations).toContain('backslash')
  })

  it('33. URI schemes and Windows drive prefixes are rejected by one rule', () => {
    for (const value of ['C:\\x', 'c:/x', 'file:///x', 'https://x', 'data:text/plain,x']) {
      expect(checkCanonicalPath(value).violations, value).toContain('scheme_or_drive_prefix')
    }
    // A colon that is not a prefix is fine — it is a legal filename character.
    expect(isValidCanonicalPath('docs/a:b.md')).toBe(true)
  })

  it('34. NUL and C0/C1 control characters are rejected', () => {
    expect(checkCanonicalPath('a\u0000b').violations).toContain('control_character')
    expect(checkCanonicalPath('a\nb').violations).toContain('control_character')
    expect(checkCanonicalPath('a\tb').violations).toContain('control_character')
    expect(checkCanonicalPath('a\u007Fb').violations).toContain('control_character')
    expect(checkCanonicalPath('a\u009Fb').violations).toContain('control_character')
  })

  it('35. empty interior segments are rejected', () => {
    expect(checkCanonicalPath('a//b').violations).toContain('empty_segment')
    expect(checkCanonicalPath('a// ').violations).toContain('empty_segment')
    expect(checkCanonicalPath('a/ /b').violations).toContain('whitespace_segment')
  })

  it('non-strings, empties and over-long values are rejected', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(checkCanonicalPath(value)).toEqual({ valid: false, violations: ['not_a_string'] })
    }
    expect(checkCanonicalPath('')).toEqual({ valid: false, violations: ['empty'] })
    expect(checkCanonicalPath('a'.repeat(CANONICAL_PATH_MAX_LENGTH)).valid).toBe(true)
    expect(checkCanonicalPath('a'.repeat(CANONICAL_PATH_MAX_LENGTH + 1)).violations)
      .toContain('too_long')
  })

  it('surrounding whitespace is rejected, and every violation is collected at once', () => {
    // NOTE: this rule is unreachable through the real vault pipeline —
    // stripFrontMatter trims values at parse time. It is kept for inputs that do
    // not come from the frontmatter parser, and must not be described as the
    // guard that stops padded pointers from the vault.
    expect(checkCanonicalPath(' docs/x.md').violations).toContain('surrounding_whitespace')
    expect(checkCanonicalPath('docs/x.md ').violations).toContain('surrounding_whitespace')
    // The leading '/' contributes an empty segment as well as `absolute`; every
    // independent violation is reported, not just the first that explains it.
    expect(checkCanonicalPath('/a/../b\\c').violations)
      .toEqual(['absolute', 'backslash', 'empty_segment', 'dotdot_segment'])
  })
})

describe('the record pointer contract', () => {
  it('36. a pointer on a non-repository note fails closed', () => {
    for (const sourceOfTruth of ['vault', 'external'] as const) {
      let caught: SnapshotBuildError | null = null
      try {
        buildRemoteRecord({ ...DOC_ALPHA, sourceOfTruth, canonicalPath: 'docs/x.md' })
      } catch (error) { caught = error as SnapshotBuildError }
      expect(caught?.reason, sourceOfTruth).toBe('canonical_pointer_unexpected')
    }
  })

  it('37. a non-repository record omits the canonical_path key entirely', () => {
    const record = buildRemoteRecord(DOC_ALPHA)
    expect('canonical_path' in record).toBe(false)
    expect(Object.keys(record)).not.toContain('canonical_path')
    // Not null, not undefined — absent. Absence is checkable; a third state is not.
    const line = renderDocumentsJsonl([record]).trimEnd()
    expect(line).not.toContain('canonical_path')
    expect(Object.keys(JSON.parse(line) as object)).not.toContain('canonical_path')
  })

  it('a repository note without a pointer fails closed', () => {
    for (const canonicalPath of [undefined, null]) {
      let caught: SnapshotBuildError | null = null
      try {
        buildRemoteRecord({ ...DOC_BOUNDARY, canonicalPath })
      } catch (error) { caught = error as SnapshotBuildError }
      expect(caught?.reason).toBe('canonical_pointer_missing')
    }
  })

  it('a malformed repository pointer blocks publication and never echoes the value', () => {
    let caught: SnapshotBuildError | null = null
    try {
      buildRemoteRecord({ ...DOC_BOUNDARY, canonicalPath: '../../etc/sk-secret-value' })
    } catch (error) { caught = error as SnapshotBuildError }
    expect(caught?.reason).toBe('canonical_pointer_malformed')
    expect(caught?.message).not.toContain('sk-secret-value')
    expect(caught?.documentPath).toBe(DOC_BOUNDARY.path)
  })

  it('the source path must be vault-relative, and every rule stands on its own', () => {
    // Asserting the reason code alone is not enough: an absolute path also trips
    // empty_segment, so a test that only checked `path_invalid` would still pass
    // with the absolute rule deleted. The violation list is asserted exactly, so
    // each rule is independently provable.
    const cases: Array<[string, string[]]> = [
      ['/Users/someone/Vault/note.md', ['absolute', 'empty_segment']],
      ['/etc/passwd', ['absolute', 'empty_segment']],
      ['~/vault/note.md', ['home_relative']],
      ['C:\\vault\\note.md', ['backslash', 'scheme_or_drive_prefix']],
      ['file:///note.md', ['scheme_or_drive_prefix', 'empty_segment']],
      ['a\\b.md', ['backslash']],
      ['note\u0000.md', ['control_character']],
      ['dir/', ['directory', 'empty_segment']],
      ['a//b.md', ['empty_segment']],
      ['a/./b.md', ['dot_segment']],
      ['../outside.md', ['dotdot_segment']],
      ['a/../b.md', ['dotdot_segment']],
    ]
    for (const [path, violations] of cases) {
      expect(checkVaultRelativePath(path), path).toEqual({ valid: false, violations })
      let caught: SnapshotBuildError | null = null
      try { buildRemoteRecord({ ...DOC_ALPHA, path }) }
      catch (error) { caught = error as SnapshotBuildError }
      expect(caught?.reason, path).toBe('path_invalid')
      // Rule names come back; the rejected value never does.
      expect(caught?.message ?? '', path).not.toContain('someone')
      expect(caught?.message ?? '', path).not.toContain('passwd')
    }
    expect(checkVaultRelativePath('')).toEqual({ valid: false, violations: ['empty'] })
    expect(checkVaultRelativePath(null)).toEqual({ valid: false, violations: ['not_a_string'] })
    // Ordinary vault-relative paths, including spaces and non-ASCII, stay valid.
    for (const path of ['10 Architecture/Note.md', '30 Projects/Överblick.md', 'a.md']) {
      expect(checkVaultRelativePath(path), path).toEqual({ valid: true, violations: [] })
      expect(() => buildRemoteRecord({ ...DOC_ALPHA, path }), path).not.toThrow()
    }
  })

  it('no absolute or home path appears anywhere in the artifacts', () => {
    const snapshot = buildKnowledgeSnapshot(ALL_DOCS)
    for (const artifact of [snapshot.documentsJsonl, snapshot.manifestJson, snapshot.identityPreimage]) {
      expect(artifact).not.toContain('/Users/')
      expect(artifact).not.toContain('/home/')
      expect(artifact).not.toMatch(/"path":"\//)
    }
  })

  it('nothing dereferences canonical_path — no filesystem API in the snapshot core', () => {
    const source = ['projection/snapshot.ts', 'projection/canonical-path.ts', 'projection/canonical-json.ts']
      .map(codeOf).join('\n')
    for (const banned of [
      'readFileSync', 'readFile', 'existsSync', 'statSync', 'readdirSync', 'node:fs',
      'writeFileSync', 'child_process', 'fetch(', 'node:http',
    ]) {
      expect(source.includes(banned), `snapshot core references ${banned}`).toBe(false)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 38–40. Collision guards
// ═════════════════════════════════════════════════════════════════════════════

describe('collision guards', () => {
  it('38. a duplicate exact source path aborts', () => {
    let caught: SnapshotBuildError | null = null
    try { buildKnowledgeSnapshot([DOC_ALPHA, DOC_BOUNDARY, { ...DOC_ALPHA }]) }
    catch (error) { caught = error as SnapshotBuildError }
    expect(caught?.reason).toBe('duplicate_source_path')
    expect(caught?.documentPath).toBe(DOC_ALPHA.path)
  })

  it('39. the same id across different paths aborts', () => {
    // id is a 64-bit truncation of sha256(path): the same path always gives the
    // same id, but different paths MAY theoretically collide. That implication
    // runs one way, so the guard is checked with a crafted pair rather than
    // assumed impossible.
    let caught: SnapshotBuildError | null = null
    try {
      assertNoCollisions([
        { id: 'b2e4e6efddde0cf5', path: 'a.md' },
        { id: 'b2e4e6efddde0cf5', path: 'b.md' },
      ])
    } catch (error) { caught = error as SnapshotBuildError }
    expect(caught?.reason).toBe('document_id_collision')
    expect(caught?.message).toContain('a.md')
    expect(caught?.message).toContain('b.md')
    // The same path twice is reported as a duplicate path, not an id collision.
    expect(() => assertNoCollisions([{ id: 'x', path: 'a.md' }, { id: 'x', path: 'a.md' }]))
      .toThrow(/duplicate source path/)
  })

  it('40. paths differing only by case abort', () => {
    let caught: SnapshotBuildError | null = null
    try {
      buildKnowledgeSnapshot([DOC_ALPHA, { ...DOC_ALPHA, path: '10 Architecture/ALPHA.md' }])
    } catch (error) { caught = error as SnapshotBuildError }
    expect(caught?.reason).toBe('path_case_collision')
  })

  it('collision registries are prototype-safe — Map/Set, never object keys', () => {
    // An object-keyed registry would resolve these against Object.prototype and
    // report collisions that do not exist.
    expect(() => assertNoCollisions([
      { id: 'i1', path: '__proto__' },
      { id: 'i2', path: 'constructor' },
      { id: 'i3', path: 'toString' },
      { id: 'i4', path: 'hasOwnProperty' },
      { id: 'i5', path: 'valueOf' },
    ])).not.toThrow()
    const code = codeOf('projection/snapshot.ts')
    expect(code).toMatch(/new Map</)
    expect(code).toMatch(/new Set</)
    // and no object-keyed registry for source-controlled strings
    expect(code).not.toMatch(/Object\.create\(null\)/)
  })

  it('a legitimate distinct set passes', () => {
    expect(() => assertNoCollisions(
      ALL_DOCS.map((d) => ({ id: buildRemoteRecord(d).id, path: d.path })),
    )).not.toThrow()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 41–44. The whitelist holds under pressure
// ═════════════════════════════════════════════════════════════════════════════

describe('the remote whitelist cannot be widened by the caller', () => {
  const EXPECTED_KEYS = [
    'canonical_path', 'classification', 'content', 'id', 'path', 'scope',
    'source_of_truth', 'title', 'type',
  ]

  it('41–44. extra input properties cannot leak into the bytes', () => {
    const polluted = ALL_DOCS.map((doc) => ({
      ...doc,
      status: 'approved',
      modifiedAt: '2026-08-30T12:00:00.000Z',
      source_bytes_hash: EMPTY_SHA256,
      source_content_hash: EMPTY_SHA256,
      publisher_version: '9.9.9',
      vault_git_commit: 'a2a9ae428ac84227ae845dd96456f0abc99b61ad',
      declaredSourceOfTruth: 'repository',
      rawFrontMatter: { secret: 'sk-live-should-never-appear' },
      diagnostics: [{ issue: 'field_missing', field: 'x', detail: 'y' }],
      operator: 'andre',
    })) as SnapshotDocumentInput[]

    const clean = buildKnowledgeSnapshot(ALL_DOCS)
    const dirty = buildKnowledgeSnapshot(polluted)

    // Byte identity is the assertion. Explicit construction, never a spread.
    expect(dirty.documentsJsonl).toBe(clean.documentsJsonl)
    expect(dirty.documentsHash).toBe(clean.documentsHash)
    expect(dirty.snapshotId).toBe(clean.snapshotId)
    expect(dirty.manifestJson).toBe(clean.manifestJson)
    expect(dirty.documentsJsonl).not.toContain('sk-live-should-never-appear')
  })

  it('42. status is absent from every record', () => {
    for (const line of buildKnowledgeSnapshot(ALL_DOCS).documentsJsonl.trimEnd().split('\n')) {
      const parsed = JSON.parse(line) as Record<string, unknown>
      expect(parsed).not.toHaveProperty('status')
      // Presence in documents.jsonl IS the approval statement — a constant field
      // would only invite a reader to build a second, weaker approval gate.
    }
  })

  it('every record carries exactly the whitelisted keys and nothing else', () => {
    const lines = buildKnowledgeSnapshot(ALL_DOCS).documentsJsonl.trimEnd().split('\n')
    const keySets = lines.map((l) => Object.keys(JSON.parse(l) as object).sort())
    // Repository-sourced note: all nine.
    expect(keySets[0]).toEqual(EXPECTED_KEYS)
    // Non-repository notes: the same eight, minus the pointer.
    expect(keySets[1]).toEqual(EXPECTED_KEYS.filter((k) => k !== 'canonical_path'))
    expect(keySets[2]).toEqual(EXPECTED_KEYS.filter((k) => k !== 'canonical_path'))
    for (const forbidden of [
      'status', 'modifiedAt', 'diagnostics', 'rawFrontMatter', 'declaredSourceOfTruth',
      'source_bytes_hash', 'source_content_hash', 'contentHash', 'publisher_version',
      'vault_git_commit', 'authorityRank', 'eligibility', 'project',
    ]) {
      for (const keys of keySets) expect(keys, forbidden).not.toContain(forbidden)
    }
  })

  it('scope is reconstructed, so extra properties on it cannot ride along', () => {
    const record = buildRemoteRecord({
      ...DOC_PILOT,
      scope: { kind: 'project', projectId: PROJECT_UUID, leaked: 'secret' } as never,
    })
    expect(Object.keys(record.scope).sort()).toEqual(['kind', 'projectId'])
    expect(canonicalCompactJson(record)).not.toContain('leaked')
    const platform = buildRemoteRecord({
      ...DOC_ALPHA, scope: { kind: 'platform', leaked: 'secret' } as never,
    })
    expect(Object.keys(platform.scope)).toEqual(['kind'])
  })

  it('the builder refuses input the eligibility gate should already have refused', () => {
    // Defence in depth: the builder must not depend on having been called
    // correctly, or a publisher bug upstream ships confidential material.
    const cases: Array<[string, SnapshotDocumentInput]> = [
      ['classification_not_remotely_publishable',
        { ...DOC_ALPHA, classification: 'confidential' as never }],
      ['classification_not_remotely_publishable',
        { ...DOC_ALPHA, classification: 'local_only' as never }],
      ['classification_unrecognized',
        { ...DOC_ALPHA, classification: 'prohibited' as never }],
      ['type_unrecognized', { ...DOC_ALPHA, type: 'invented' as never }],
      ['source_of_truth_unrecognized', { ...DOC_ALPHA, sourceOfTruth: 'guess' as never }],
      ['scope_invalid', { ...DOC_ALPHA, scope: { kind: 'global' } as never }],
      ['scope_invalid', { ...DOC_PILOT, scope: { kind: 'project', projectId: 'proj-1' } as never }],
      ['scope_invalid',
        { ...DOC_PILOT, scope: { kind: 'project', projectId: ` ${PROJECT_UUID} ` } as never }],
      ['path_invalid', { ...DOC_ALPHA, path: '' }],
    ]
    for (const [reason, input] of cases) {
      let caught: SnapshotBuildError | null = null
      try { buildRemoteRecord(input) } catch (error) { caught = error as SnapshotBuildError }
      expect(caught?.reason, `${reason} for ${JSON.stringify(input.classification)}`).toBe(reason)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 46 + goldens. Determinism against independently derived bytes
// ═════════════════════════════════════════════════════════════════════════════

describe('golden artifacts — independently derived bytes', () => {
  // Built inside each test, never in the describe body: a throw at collection
  // time reports "no tests" for the whole file instead of naming the assertion
  // that broke, which is exactly the wrong signal for a reviewer.
  const snapshotOf = (): ReturnType<typeof buildKnowledgeSnapshot> =>
    buildKnowledgeSnapshot(ALL_DOCS)

  it('documents.jsonl matches the golden byte for byte', () => {
    const golden = readFileSync(join(FIXTURES, 'documents.jsonl'))
    expect(utf8Bytes(snapshotOf().documentsJsonl).equals(golden)).toBe(true)
    expect(snapshotOf().documentsJsonl).toBe(golden.toString('utf8'))
  })

  it('knowledge-manifest.json matches the golden byte for byte', () => {
    const golden = readFileSync(join(FIXTURES, 'knowledge-manifest.json'))
    expect(utf8Bytes(snapshotOf().manifestJson).equals(golden)).toBe(true)
  })

  it('the identity preimage matches the golden byte for byte, with no trailing LF', () => {
    const golden = readFileSync(join(FIXTURES, 'identity-preimage.json'))
    expect(utf8Bytes(snapshotOf().identityPreimage).equals(golden)).toBe(true)
    expect(golden[golden.length - 1]).not.toBe(0x0a)
    expect(snapshotOf().snapshotId).toBe(sha(golden))
    expect(snapshotOf().documentsHash).toBe(sha(readFileSync(join(FIXTURES, 'documents.jsonl'))))
  })

  it('46. rebuilding from identical input is byte-identical, every time', () => {
    const runs = Array.from({ length: 5 }, () => buildKnowledgeSnapshot(ALL_DOCS))
    for (const run of runs) {
      expect(run.documentsJsonl).toBe(snapshotOf().documentsJsonl)
      expect(run.manifestJson).toBe(snapshotOf().manifestJson)
      expect(run.identityPreimage).toBe(snapshotOf().identityPreimage)
      expect(run.snapshotId).toBe(snapshotOf().snapshotId)
    }
    expect(new Set(runs.map((r) => r.snapshotId)).size).toBe(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Local build evidence — raw bytes, strict decoding, and the CRLF outcome
// ═════════════════════════════════════════════════════════════════════════════

describe('source bytes are local evidence, never remote', () => {
  it('source_bytes_hash hashes the actual file bytes, before any decoding', () => {
    const bytes = Buffer.from('# Title\n', 'utf8')
    expect(sourceBytesHash(bytes)).toBe(sha(bytes))
    // Distinct from Phase 1 contentHash, which hashes the DECODED string: for
    // invalid UTF-8 the two differ, because decoding already replaced the bytes.
    const invalid = Buffer.from([0x23, 0x20, 0xff, 0x0a])
    expect(sourceBytesHash(invalid)).toBe(sha(invalid))
    expect(sourceBytesHash(invalid))
      .not.toBe(sha(Buffer.from(invalid.toString('utf8'), 'utf8')))
  })

  it('a leading UTF-8 BOM is a hard build error — refused, not stripped', () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('---\n', 'utf8')])
    let caught: SnapshotBuildError | null = null
    try { decodeSourceBytes(withBom, 'x.md') } catch (error) { caught = error as SnapshotBuildError }
    expect(caught?.reason).toBe('source_bom_present')
    expect(caught?.documentPath).toBe('x.md')
    // TextDecoder would have silently swallowed it — that is what is being refused.
    expect(new TextDecoder('utf-8', { fatal: true }).decode(withBom)).toBe('---\n')
  })

  it('invalid UTF-8 aborts instead of decoding to replacement characters', () => {
    const invalid = Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a])
    let caught: SnapshotBuildError | null = null
    try { decodeSourceBytes(invalid) } catch (error) { caught = error as SnapshotBuildError }
    expect(caught?.reason).toBe('source_encoding_invalid')
    expect(invalid.toString('utf8')).toContain('\uFFFD') // the lossy default, refused
  })

  it('valid UTF-8 decodes unchanged, including non-ASCII', () => {
    expect(decodeSourceBytes(Buffer.from('# Rubrik\n\nHär är två rader.\n', 'utf8')))
      .toBe('# Rubrik\n\nHär är två rader.\n')
    expect(decodeSourceBytes(Buffer.alloc(0))).toBe('')
  })

  it('a CRLF-only source change moves the local hash but NOT snapshot_id', () => {
    // Adversarial case 12, as corrected. The file genuinely changed, so the local
    // evidence hash moves. Every REMOTE field is derived from the LF-normalized,
    // frontmatter-free body, so the record — and therefore identity — does not.
    const lf =
      '---\ntype: reference\nstatus: approved\nclassification: public\nscope: platform\n---\n\n' +
      '# Alpha\n\nRad ett.\nRad två.\n'
    const crlf = lf.replace(/\n/g, '\r\n')

    const lfBytes = Buffer.from(lf, 'utf8')
    const crlfBytes = Buffer.from(crlf, 'utf8')
    expect(sourceBytesHash(crlfBytes)).not.toBe(sourceBytesHash(lfBytes))

    // parseKnowledgeDocument is pure — no vault is touched here.
    const parsedLf = parseKnowledgeDocument(decodeSourceBytes(lfBytes), 'x.md')
    const parsedCrlf = parseKnowledgeDocument(decodeSourceBytes(crlfBytes), 'x.md')
    expect(parsedCrlf.body).toBe(parsedLf.body)

    const asInput = (body: string): SnapshotDocumentInput => ({
      path: 'x.md', title: 'Alpha', type: 'reference', classification: 'public',
      scope: { kind: 'platform' }, sourceOfTruth: 'vault', content: body,
    })
    const fromLf = buildKnowledgeSnapshot([asInput(parsedLf.body)])
    const fromCrlf = buildKnowledgeSnapshot([asInput(parsedCrlf.body)])
    expect(fromCrlf.documentsJsonl).toBe(fromLf.documentsJsonl)
    expect(fromCrlf.snapshotId).toBe(fromLf.snapshotId)
  })

  it('no source hash reaches the snapshot bytes', () => {
    const snapshot = buildKnowledgeSnapshot(ALL_DOCS)
    const bodyHashes = ALL_DOCS.map((d) => sha(Buffer.from(d.content, 'utf8')))
    for (const hash of bodyHashes) {
      expect(snapshot.documentsJsonl).not.toContain(hash)
      expect(snapshot.manifestJson).not.toContain(hash)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Slice boundary — 3A implements no transport and no consumer
// ═════════════════════════════════════════════════════════════════════════════

describe('SLICE BOUNDARY — 3A uploads nothing and activates nothing', () => {
  it('the snapshot core reaches no transport, storage or pointer surface', () => {
    const source = ['projection/snapshot.ts', 'projection/canonical-json.ts', 'projection/canonical-path.ts']
      .map(codeOf).join('\n')
    for (const banned of [
      'supabase', 'createClient', 'storage.from', 'upload', 'bucket',
      'current.json', 'server-only', 'process.env', 'Date.now', 'new Date(',
    ]) {
      expect(source.toLowerCase().includes(banned.toLowerCase()), `snapshot core references ${banned}`)
        .toBe(false)
    }
  })

  it('nothing in the snapshot is time-dependent', () => {
    const first = buildKnowledgeSnapshot(ALL_DOCS)
    expect(JSON.stringify(first.manifest)).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(first.documentsJsonl).not.toMatch(/"modified/i)
  })
})
