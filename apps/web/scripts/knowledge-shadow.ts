/**
 * scripts/knowledge-shadow.ts — local operator harness for the Knowledge Provider.
 *
 * SHADOW ONLY. There is no production endpoint, no Vercel route and no public
 * API for Knowledge in this phase — this script is how a human or Claude
 * exercises the provider while it has zero production consumers, exactly as
 * Memory was exercised before injection.
 *
 * It goes through the KnowledgeProvider interface and never reaches around it,
 * so what you see here is what a future consumer would see. Metadata by default;
 * note bodies only when you explicitly ask for one.
 *
 *   npm run knowledge:shadow -- --vault=<path> "architecture"
 *   npm run knowledge:shadow -- --vault=<path> --read="10 Architecture/note.md"
 *
 * The vault root comes from --vault or ATLAS_KNOWLEDGE_VAULT_ROOT. It is never
 * defaulted to anyone's home directory.
 */

import { createVaultKnowledgeProvider } from '../lib/atlas/knowledge/vault-provider'
import type { KnowledgeQuery } from '../lib/atlas/knowledge/types'

interface Args {
  vaultRoot: string | undefined
  query: string
  readPath: string | null
  project: string | undefined
  limit: number | undefined
  includeExcluded: boolean
  json: boolean
}

function parseArgs(argv: string[]): Args {
  let vaultRoot = process.env.ATLAS_KNOWLEDGE_VAULT_ROOT
  let readPath: string | null = null
  let project: string | undefined
  let limit: number | undefined
  let includeExcluded = false
  let json = false
  const rest: string[] = []

  for (const arg of argv) {
    if (arg.startsWith('--vault=')) vaultRoot = arg.slice(8)
    else if (arg.startsWith('--read=')) readPath = arg.slice(7)
    else if (arg.startsWith('--project=')) project = arg.slice(10)
    else if (arg.startsWith('--limit=')) limit = Number.parseInt(arg.slice(8), 10)
    else if (arg === '--include-excluded') includeExcluded = true
    else if (arg === '--json') json = true
    else rest.push(arg)
  }
  return { vaultRoot, query: rest.join(' '), readPath, project, limit, includeExcluded, json }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (!args.vaultRoot) {
    console.error(
      'knowledge-shadow: no vault root.\n' +
        '  pass --vault=<absolute path> or set ATLAS_KNOWLEDGE_VAULT_ROOT',
    )
    process.exit(2)
  }

  const provider = createVaultKnowledgeProvider({ vaultRoot: args.vaultRoot })

  if (args.readPath) {
    const doc = await provider.get(args.readPath)
    if (!doc) {
      console.error(`knowledge-shadow: no readable note at "${args.readPath}" (absent or out of policy)`)
      process.exit(1)
    }
    if (args.json) { console.log(JSON.stringify(doc, null, 2)); return }
    console.log(`# ${doc.title}`)
    console.log(`  path            ${doc.path}`)
    console.log(`  type/status     ${doc.type ?? '—'} / ${doc.status ?? '—'}`)
    console.log(`  project         ${doc.project ?? '—'}`)
    console.log(`  source of truth ${doc.provenance.sourceOfTruth}`)
    console.log(`  canonical path  ${doc.provenance.canonicalPath ?? '—'}`)
    console.log(`  authority rank  ${doc.authorityRank}`)
    console.log(`  content hash    ${doc.provenance.contentHash.slice(0, 16)}…`)
    console.log(`  truncated       ${doc.contentTruncated}`)
    if (doc.diagnostics.length) {
      console.log('  diagnostics:')
      for (const d of doc.diagnostics) console.log(`    - [${d.issue}] ${d.field}: ${d.detail}`)
    }
    console.log('\n--- content ---')
    console.log(doc.content)
    return
  }

  const query: KnowledgeQuery = {
    query: args.query,
    project: args.project,
    limit: args.limit,
    includeExcludedFolders: args.includeExcluded,
  }
  const result = await provider.search(query)

  if (args.json) { console.log(JSON.stringify(result, null, 2)); return }

  console.log(`provider   ${provider.id}`)
  console.log(`vault      ${args.vaultRoot}`)
  console.log(`query      ${args.query ? `"${args.query}"` : '(empty — listing in-policy knowledge)'}`)
  console.log(
    `results    ${result.hits.length} of ${result.totalMatched} matched` +
      `${result.unreadable ? `, ${result.unreadable} unreadable` : ''}`,
  )
  console.log(
    `bounds     maxHits=${result.bounds.maxHits} excerpt=${result.bounds.maxExcerptChars} ` +
      `aggregate=${result.bounds.maxAggregateChars}`,
  )
  console.log(
    `truncated  hits=${result.truncated.hits} excerpt=${result.truncated.excerpt} ` +
      `aggregate=${result.truncated.aggregate}`,
  )
  console.log('')

  if (result.hits.length === 0) {
    console.log('(no results — a legitimate answer for a small vault)')
    return
  }

  for (const [i, hit] of result.hits.entries()) {
    console.log(`${String(i + 1).padStart(2)}. ${hit.title}   [score ${hit.score}]`)
    console.log(`    path       ${hit.path}`)
    console.log(`    type       ${hit.type ?? '—'}    status ${hit.status ?? '—'}    project ${hit.project ?? '—'}`)
    console.log(`    authority  rank ${hit.authorityRank}   source-of-truth ${hit.provenance.sourceOfTruth}`)
    if (hit.provenance.canonicalPath) console.log(`    canonical  ${hit.provenance.canonicalPath}`)
    console.log(`    hash       ${hit.provenance.contentHash.slice(0, 16)}…   modified ${hit.modifiedAt}`)
    console.log(`    excerpt    ${hit.excerpt.length} chars${hit.excerptTruncated ? ' (truncated)' : ''}`)
    for (const d of hit.diagnostics) console.log(`    ! ${d.issue} — ${d.field}: ${d.detail}`)
    console.log('')
  }
  console.log('Use --read="<path>" to inspect one note in full.')
}

main().catch((err) => {
  console.error(`knowledge-shadow: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
