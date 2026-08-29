#!/usr/bin/env node
/**
 * build-workflow-def.mjs — regenerate the JSON form of a vendored workflow YAML.
 *
 * WHY A GENERATED JSON EXISTS AT ALL. The canonical definition is a YAML file in
 * another repository. Omnira runs on Vercel and cannot read that file at
 * runtime, so the definition must be vendored. Hand-transcribing 461 lines of
 * governance data is exactly the class of error the runbook spends pages
 * warning about ("canonical values must never be derived from memory"), so the
 * JSON is MACHINE-GENERATED from the vendored YAML and committed alongside it.
 *
 * The runtime imports only the .json. `js-yaml` is therefore a maintenance-time
 * dependency (resolved from the monorepo root), never a runtime one — no YAML
 * parser ships to production.
 *
 * Usage:
 *   node scripts/build-workflow-def.mjs                 # regenerate all
 *   node scripts/build-workflow-def.mjs --check         # fail if any is stale
 *
 * Drift is caught two ways: `--check` proves the committed JSON still matches
 * the vendored YAML, and lib/qa/workflows-definition-familje-stunden.test.ts
 * pins the vendored YAML's own sha256 against upstream. Changing the upstream
 * definition must therefore become a new VERSION, never an edit in place.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let yaml
try {
  yaml = require('js-yaml')
} catch {
  console.error('\n❌ build-workflow-def: js-yaml is not resolvable.')
  console.error('   This is a maintenance script; install dev deps at the monorepo root and retry.\n')
  process.exit(1)
}

const DIR = fileURLToPath(new URL('../lib/workflows/definitions/', import.meta.url))
const check = process.argv.includes('--check')

const sources = readdirSync(DIR).filter(f => f.endsWith('.yaml')).sort()
if (sources.length === 0) {
  console.error('❌ build-workflow-def: no .yaml definitions found in lib/workflows/definitions/')
  process.exit(1)
}

let stale = 0
for (const src of sources) {
  const yamlPath = join(DIR, src)
  const jsonPath = join(DIR, src.replace(/\.yaml$/, '.json'))
  const raw = readFileSync(yamlPath, 'utf8')
  const doc = yaml.load(raw)

  // Two trailing newline-free stringifies would differ only by whitespace; pin
  // the exact serialization so --check compares content, not formatting.
  const out = JSON.stringify(doc, null, 2) + '\n'

  let existing = null
  try { existing = readFileSync(jsonPath, 'utf8') } catch { /* first generation */ }

  if (existing === out) {
    console.log(`✓ ${src} → ${src.replace(/\.yaml$/, '.json')} (up to date)`)
    continue
  }
  if (check) {
    console.error(`❌ stale: ${jsonPath} does not match ${src}. Run: node scripts/build-workflow-def.mjs`)
    stale++
    continue
  }
  writeFileSync(jsonPath, out)
  console.log(`↻ ${src} → ${src.replace(/\.yaml$/, '.json')}`)
  console.log(`  yaml sha256: ${createHash('sha256').update(raw).digest('hex')}`)
}

process.exit(stale > 0 ? 1 : 0)
