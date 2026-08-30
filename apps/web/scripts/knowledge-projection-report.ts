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
 *   npm run knowledge:projection -- --vault=<path> --project-map=<file.json>
 *
 * The vault root comes from --vault or ATLAS_KNOWLEDGE_VAULT_ROOT and is never
 * defaulted to anyone's home directory.
 *
 * ── PROJECT MAPPING IS A TRUSTED INPUT, NOT A REGISTRY ───────────────────────
 * `--project-map` takes a JSON object of canonical slug → project-id (uuid),
 * mirroring `public.projects` (`slug` UNIQUE, `id` uuid PK). Supplying it does
 * NOT prove database membership — it bounds what this evaluation will accept.
 * With no map supplied, project-scoped notes report
 * `project_scope_mapping_unavailable`, which is an honest "nothing was
 * consulted" rather than the false claim that a slug is not a project.
 *
 * ── ALL OUTPUT IS REDACTED ───────────────────────────────────────────────────
 * Both text and --json go through the redaction rules in report.ts. Printing a
 * listing directly would hand over the very credential the secret gate just
 * blocked.
 */

import { readFileSync } from 'node:fs'

import { createKnowledgeProjectionSource } from '../lib/atlas/knowledge/projection/source'
import {
  renderProjectionReport, toSafeProjectionReportJson,
} from '../lib/atlas/knowledge/projection/report'

interface Args {
  vaultRoot: string | undefined
  json: boolean
  eligibleOnly: boolean
  projectMapPath: string | undefined
}

function parseArgs(argv: string[]): Args {
  let vaultRoot = process.env.ATLAS_KNOWLEDGE_VAULT_ROOT
  let json = false
  let eligibleOnly = false
  let projectMapPath: string | undefined
  for (const arg of argv) {
    if (arg.startsWith('--vault=')) vaultRoot = arg.slice(8)
    else if (arg.startsWith('--project-map=')) projectMapPath = arg.slice(14)
    else if (arg === '--json') json = true
    else if (arg === '--eligible-only') eligibleOnly = true
  }
  return { vaultRoot, json, eligibleOnly, projectMapPath }
}

/** Load a trusted slug → project-id map, or undefined when none was supplied. */
function loadProjectMap(path: string | undefined): Record<string, string> | undefined {
  if (!path) return undefined
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--project-map must be a JSON object of slug -> project id: ${path}`)
  }
  // Own properties only, mirroring the evaluator's own lookup discipline.
  const map: Record<string, string> = Object.create(null)
  for (const [slug, id] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof id !== 'string') throw new Error(`--project-map: "${slug}" must map to a string id`)
    map[slug] = id
  }
  return map
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

  const projectScopeMap = loadProjectMap(args.projectMapPath)
  const source = createKnowledgeProjectionSource({ vaultRoot: args.vaultRoot, projectScopeMap })
  const listing = source.listAll()

  if (args.json) {
    // Never the raw listing — only the redacted representation.
    const safe = toSafeProjectionReportJson(listing)
    const payload = args.eligibleOnly
      ? { ...safe, candidates: safe.candidates.filter((c) => c.eligible) }
      : safe
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  if (args.eligibleOnly) {
    const eligible = listing.candidates.filter((c) => c.eligibility.eligible)
    console.log(`eligible: ${eligible.length} of ${listing.accounting.candidatesEvaluated}`)
    for (const c of eligible) console.log(`  ${c.path}`)
    if (eligible.length === 0) {
      console.log('  (none — an empty eligible set is a valid result; curate notes to change it)')
    }
    return
  }

  console.log(renderProjectionReport(listing, { vaultRoot: args.vaultRoot }))
  if (!projectScopeMap) {
    console.log(
      'NOTE: no --project-map was supplied, so project-scoped notes report ' +
      'project_scope_mapping_unavailable. That is "nothing was consulted", not ' +
      '"this slug is not a project".',
    )
  }
}

try {
  main()
} catch (err) {
  console.error(`knowledge-projection-report: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
