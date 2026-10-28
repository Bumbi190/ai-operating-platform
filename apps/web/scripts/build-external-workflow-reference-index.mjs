/**
 * Explicit, offline-at-runtime build of metadata-only n8n reference catalog.
 * Usage: node scripts/build-external-workflow-reference-index.mjs --update
 * No execution/import of third-party workflows. No tokens, env or DB access.
 * This never runs in Next.js build, cron or normal Atlas requests.
 */
import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PINNED_SHA = '94007c1445d9258a7da116646b79473e7c7c3282'
const REPO = 'Zie619/n8n-workflows'
const GIT_API = `https://api.github.com/repos/${REPO}/git/trees/${PINNED_SHA}?recursive=1`
const UPSTREAM_INDEX = `https://raw.githubusercontent.com/${REPO}/${PINNED_SHA}/docs/api/search-index.json`
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../lib/atlas/workflow-references/catalog-index.json')

function clean(value, limit) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
}

async function loadJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Omnira-Atlas-Reference-Indexer', Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} while reading pinned source`)
  const size = Number(response.headers.get('content-length') || 0)
  if (size > 8_000_000) throw new Error('Source exceeds fixed size bound')
  const body = await response.text()
  if (body.length > 8_000_000) throw new Error('Source exceeds fixed size bound')
  return JSON.parse(body)
}

function validWorkflowPath(path) {
  return typeof path === 'string' &&
    /^workflows\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.json$/.test(path)
}

function fallbackTitle(path) {
  return path.split('/').pop().replace(/\.json$/, '').replace(/^\d+_/, '').replace(/_/g, ' ')
}

export async function buildIndex(fetchSource = loadJson) {
  const [tree, upstream] = await Promise.all([fetchSource(GIT_API), fetchSource(UPSTREAM_INDEX)])
  if (tree.truncated !== false || !Array.isArray(tree.tree) || !Array.isArray(upstream.workflows)) {
    throw new Error('Invalid or truncated upstream metadata')
  }
  const paths = tree.tree
    .filter(item => item.type === 'blob' && validWorkflowPath(item.path))
    .map(item => item.path).sort()
  if (paths.length < 1000 || upstream.workflows.length < 1000) {
    throw new Error('Unexpectedly small upstream index; refusing silent replacement')
  }

  const byFile = new Map()
  for (const item of upstream.workflows) {
    const filename = clean(item.filename, 180)
    if (!/^[A-Za-z0-9_.-]+\.json$/.test(filename)) continue
    const entries = byFile.get(filename) ?? []
    entries.push(item)
    byFile.set(filename, entries)
  }

  const pathFilenameCounts = new Map()
  for (const path of paths) {
    const filename = path.split('/').pop()
    pathFilenameCounts.set(filename, (pathFilenameCounts.get(filename) ?? 0) + 1)
  }

  let incomplete = 0
  const workflows = paths.map(path => {
    const filename = path.split('/').pop()
    const items = byFile.get(filename) ?? []
    const meta = items.length === 1 && pathFilenameCounts.get(filename) === 1 ? items[0] : null
    if (!meta) incomplete++
    return {
      path,
      name: clean(meta?.name, 120) || fallbackTitle(path),
      description: clean(meta?.description, 240),
      category: clean(meta?.category, 80),
      integrations: Array.isArray(meta?.integrations)
        ? [...new Set(meta.integrations.map(v => clean(v, 45)).filter(Boolean))].slice(0, 20)
        : [],
      nodeCountClaim: Number.isSafeInteger(meta?.node_count) && meta.node_count >= 0
        ? meta.node_count : null,
      metadataPresent: !!meta,
    }
  })

  return {
    schemaVersion: 1,
    source: { repository: `https://github.com/${REPO}`, pinnedSha: PINNED_SHA,
      upstreamIndexGeneratedAt: clean(upstream.generated_at, 40) || null },
    counts: {
      validatedTreePaths: paths.length,
      upstreamMetadataRows: upstream.workflows.length,
      upstreamClaimedTotal: Number.isInteger(upstream.stats?.total_workflows)
        ? upstream.stats.total_workflows : null,
      indexed: workflows.length,
      filenameOnly: incomplete,
    },
    trust: 'external_unverified_metadata_only',
    workflows,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--update') {
    console.error('Explicit --update is required. No changes made.')
    process.exitCode = 2
  } else {
    const index = await buildIndex()
    await writeFile(OUTPUT, JSON.stringify(index) + '\n', { encoding: 'utf8', flag: 'w' })
    console.log(JSON.stringify({ output: OUTPUT, counts: index.counts, pin: PINNED_SHA }))
  }
}
