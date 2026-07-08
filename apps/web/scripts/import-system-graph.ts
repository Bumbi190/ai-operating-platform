/**
 * Import + sanitize a Graphify graph.json into Omnira's local System Map artifact.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/import-system-graph.ts [path/to/graphify-out/graph.json]
 *
 * Default input:  ../../graphify-out/graph.json   (repo root scan output)
 * Output:         apps/web/data/intelligence/system-graph.json  (GITIGNORED dev artifact)
 *
 * This is the LOCAL/DEV pipeline. The production path (private Supabase Storage
 * artifact, uploaded by CI, schema+size validated on read) is documented in
 * docs/intelligence-graph.md and is intentionally NOT auto-provisioned here.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importGraphifyGraph } from '../lib/intelligence/graphify-import'
import { LIMITS } from '../lib/intelligence/graph-contract'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')

const inputPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(webRoot, '../../graphify-out/graph.json')
const outputPath = join(webRoot, 'data/intelligence/system-graph.json')

function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

const size = (() => {
  try { return statSync(inputPath).size } catch { return -1 }
})()
if (size < 0) fail(`input not found: ${inputPath}`)
if (size > LIMITS.MAX_ARTIFACT_BYTES) fail(`input is ${size} bytes — exceeds cap ${LIMITS.MAX_ARTIFACT_BYTES}`)

console.log(`Importing ${inputPath} (${(size / 1024 / 1024).toFixed(1)} MB)…`)

const raw = readFileSync(inputPath, 'utf8')
const { graph, issues, droppedNodes, droppedEdges } = importGraphifyGraph(raw)

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, JSON.stringify(graph))

console.log('✓ System graph artifact written')
console.log(`  output:      ${outputPath}`)
console.log(`  nodes:       ${graph.meta.nodeCount} (dropped ${droppedNodes})`)
console.log(`  edges:       ${graph.meta.edgeCount} (dropped ${droppedEdges})`)
console.log(`  communities: ${graph.meta.communities?.length ?? 0}`)
console.log(`  commit:      ${graph.meta.builtAtCommit ?? 'unknown'}`)
if (issues.length > 0) {
  console.log('  import notes:')
  for (const issue of issues) console.log(`    - ${issue.reason} ×${issue.count}`)
}
