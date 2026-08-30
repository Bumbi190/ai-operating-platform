/**
 * scripts/knowledge-projection-report.ts — Slice 1 operator harness.
 *
 * Answers one question against a real vault, read-only:
 *   which notes would be remotely publishable today, and why is each of the
 *   others held back?
 *
 * It PUBLISHES NOTHING. There is no snapshot, no manifest, no upload and no
 * pointer in this slice — those are later, separate decisions. This script also
 * writes nothing to the vault; it opens files for reading and stops there.
 *
 *   npm run knowledge:projection -- --vault=<path>
 *   npm run knowledge:projection -- --vault=<path> --json
 *   npm run knowledge:projection -- --vault=<path> --eligible-only
 *
 * The vault root comes from --vault or ATLAS_KNOWLEDGE_VAULT_ROOT and is never
 * defaulted to anyone's home directory.
 */

import { createKnowledgeProjectionSource } from '../lib/atlas/knowledge/projection/source'
import { renderProjectionReport } from '../lib/atlas/knowledge/projection/report'

interface Args {
  vaultRoot: string | undefined
  json: boolean
  eligibleOnly: boolean
}

function parseArgs(argv: string[]): Args {
  let vaultRoot = process.env.ATLAS_KNOWLEDGE_VAULT_ROOT
  let json = false
  let eligibleOnly = false
  for (const arg of argv) {
    if (arg.startsWith('--vault=')) vaultRoot = arg.slice(8)
    else if (arg === '--json') json = true
    else if (arg === '--eligible-only') eligibleOnly = true
  }
  return { vaultRoot, json, eligibleOnly }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))

  if (!args.vaultRoot) {
    console.error(
      'knowledge-projection-report: no vault root.\n' +
        '  pass --vault=<absolute path> or set ATLAS_KNOWLEDGE_VAULT_ROOT',
    )
    process.exit(2)
  }

  // Slice 1 has no project-slug → project-id map; Slice 2 introduces it with
  // owner approval. Until then every project-scoped note reports
  // project_scope_unmapped rather than being given an invented id.
  const source = createKnowledgeProjectionSource({ vaultRoot: args.vaultRoot })
  const listing = source.listAll()

  if (args.json) {
    const payload = args.eligibleOnly
      ? { ...listing, candidates: listing.candidates.filter((c) => c.eligibility.eligible) }
      : listing
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  if (args.eligibleOnly) {
    const eligible = listing.candidates.filter((c) => c.eligibility.eligible)
    console.log(`eligible: ${eligible.length} of ${listing.accounting.candidatesEvaluated}`)
    for (const c of eligible) console.log(`  ${c.path}`)
    if (eligible.length === 0) {
      console.log('  (none — expected while classification and scope are undefined)')
    }
    return
  }

  console.log(renderProjectionReport(listing, { vaultRoot: args.vaultRoot }))
}

try {
  main()
} catch (err) {
  console.error(`knowledge-projection-report: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
