#!/usr/bin/env node
/**
 * validate-evidence-bundle.mjs — check a release-evidence bundle OFFLINE.
 *
 * Structural validation only: shape, vocabularies, hash formats, payload safety.
 * It deliberately does NOT know which checks a definition declares — that is the
 * server's decision, made against the pinned definition version, and a copy of
 * the catalogue in a script is how the two quietly drift apart. A bundle that
 * passes here can still be refused on ingest, and that is correct.
 *
 * Exits non-zero on any problem, so it can gate a producer's own pipeline before
 * anything is submitted.
 *
 *   node scripts/validate-evidence-bundle.mjs release-evidence.json
 */

import { readFileSync } from 'node:fs'

const SCHEMA = 'omnira.workflow.evidence-bundle/v1'
const RESULTS = ['pass', 'fail', 'blocked', 'error']
const PRODUCER_TYPES = ['local_agent', 'ci', 'human']
const SHA256 = /^[a-f0-9]{64}$/
const FORBIDDEN_KEY =
  /(secret|token|password|passwd|api[_-]?key|service[_-]?role|authorization|credential|bearer|private[_-]?key)/i

const file = process.argv[2]
if (!file) {
  console.error('usage: validate-evidence-bundle.mjs <bundle.json>')
  process.exit(2)
}

const errors = []
const warnings = []
const fail = (m) => errors.push(m)

let bundle
try {
  bundle = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  console.error(`❌ ${file}: not valid JSON — ${e.message}`)
  process.exit(1)
}

const isText = (v, max = 200) => typeof v === 'string' && v.trim() && v.length <= max

if (bundle?.schema !== SCHEMA) fail(`schema must be "${SCHEMA}"`)
if (!isText(bundle?.def_key)) fail('def_key is required')
if (!isText(bundle?.instance_key, 64)) fail('instance_key is required')

const producer = bundle?.producer
if (!producer || typeof producer !== 'object') fail('producer is required')
else {
  if (!PRODUCER_TYPES.includes(producer.type)) {
    fail(`producer.type must be one of ${PRODUCER_TYPES.join(', ')}`)
  }
  for (const k of ['tool', 'tool_version']) {
    if (producer[k] != null && !isText(producer[k])) fail(`producer.${k} must be short text`)
  }
}

if (bundle?.source_commit != null && !isText(bundle.source_commit, 64)) {
  fail('source_commit must be short text')
}
if (bundle?.artifact_manifest_hash != null && !SHA256.test(bundle.artifact_manifest_hash)) {
  fail('artifact_manifest_hash must be a sha256 hex digest')
}
if (bundle?.artifact_manifest_hash == null) {
  warnings.push('no artifact_manifest_hash — any check that is a claim about built ' +
                'artefacts will be refused on ingest')
}

/** Recursive payload safety: no credential-shaped keys, bounded size and depth. */
function checkPayload(value, path, depth = 0) {
  if (depth > 6) return fail(`${path}: nested too deeply (max 6)`)
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    if (typeof value === 'string' && value.length > 4000) fail(`${path}: string exceeds 4000 characters`)
    return
  }
  if (Array.isArray(value)) {
    if (value.length > 200) fail(`${path}: array exceeds 200 entries`)
    value.slice(0, 200).forEach((v, i) => checkPayload(v, `${path}[${i}]`, depth + 1))
    return
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length > 100) fail(`${path}: object exceeds 100 keys`)
    for (const [k, v] of entries) {
      if (FORBIDDEN_KEY.test(k)) fail(`${path}.${k}: key name suggests a credential and would be refused`)
      else checkPayload(v, `${path}.${k}`, depth + 1)
    }
    return
  }
  fail(`${path}: unsupported value type`)
}

if (!Array.isArray(bundle?.checks) || bundle.checks.length === 0) {
  fail('checks must be a non-empty array')
} else {
  const seen = new Set()
  bundle.checks.forEach((c, i) => {
    const at = `checks[${i}]`
    if (!isText(c?.state, 128)) fail(`${at}.state is required`)
    if (!isText(c?.check_key, 128)) fail(`${at}.check_key is required`)
    if (!RESULTS.includes(c?.result)) fail(`${at}.result must be one of ${RESULTS.join(', ')}`)
    if (typeof c?.observed_at !== 'string' || Number.isNaN(Date.parse(c.observed_at))) {
      fail(`${at}.observed_at must be an ISO-8601 instant`)
    }
    if (c?.payload != null) {
      if (typeof c.payload !== 'object' || Array.isArray(c.payload)) fail(`${at}.payload must be an object`)
      else checkPayload(c.payload, `${at}.payload`)
    }
    const key = `${c?.state}:${c?.check_key}`
    if (seen.has(key)) warnings.push(`${at}: duplicate ${key} — the later statement wins on ingest`)
    seen.add(key)
  })
}

for (const w of warnings) console.warn(`⚠️  ${w}`)
if (errors.length > 0) {
  console.error(`\n❌ ${file}: ${errors.length} problem(s)`)
  for (const e of errors) console.error(`   • ${e}`)
  console.error('\nStructural validation only — the server still checks that every ' +
                'check is declared and accepts attested provenance.\n')
  process.exit(1)
}

console.log(`✓ ${file}: structurally valid (${bundle.checks.length} check(s))`)
console.log('  Not yet verified: whether each check is declared by the pinned ' +
            'definition and accepts attested provenance. The server decides that.')
