/**
 * lib/workflows/definitions/index.ts — vendored workflow definitions.
 *
 * The canonical definition for the monthly release lives in the Familje-Stunden
 * repository. Omnira runs on Vercel and cannot read it at runtime, so a
 * byte-identical copy of the YAML is vendored here and its JSON form is
 * MACHINE-GENERATED from that copy by scripts/build-workflow-def.mjs. Nothing in
 * this directory was typed by hand from the source: the runbook is explicit that
 * canonical values must never be derived from memory, and 461 lines of
 * governance data is exactly where a transcription error would hide.
 *
 * Only the .json is imported. No YAML parser reaches the runtime bundle.
 *
 * DRIFT IS PINNED IN TWO PLACES:
 *   • `source_sha256` below is the hash of the vendored YAML, asserted against
 *     the file on disk by lib/qa/workflows-definition-familje-stunden.test.ts.
 *   • `expected_def_hash` is the hash of the normalized spec, asserted by the
 *     same test. Reformatting the YAML cannot move it; changing a modelled
 *     value must.
 * Changing the upstream definition therefore fails a test until someone
 * registers a NEW VERSION — it can never edit v1 out from under a live instance.
 */

import rawFamiljeStundenMonthlyReleaseV1 from './familje-stunden.monthly-release.v1.json'
import { computeDefHash, parseWorkflowSpec } from '../spec'
import type { WorkflowSpec } from '../types'

export interface VendoredDefinition {
  def_key: string
  version: number
  /** Where the canonical file lives, for provenance in an audit. */
  source_repo: string
  source_path: string
  /** SHA-256 of the vendored YAML, which is byte-identical to upstream. */
  source_sha256: string
  spec: WorkflowSpec
  def_hash: string
}

interface VendorEntry {
  raw: unknown
  source_repo: string
  source_path: string
  source_sha256: string
}

const VENDORED: VendorEntry[] = [
  {
    raw: rawFamiljeStundenMonthlyReleaseV1,
    source_repo: 'familje-stunden-v2',
    source_path: 'docs/MONTHLY_RELEASE_WORKFLOW_V1.yaml',
    source_sha256: '88d9cc31fe57181e974d1e37c8968eee40bc8cc11e1745fe0a85205e98fa1bed',
  },
]

let cache: VendoredDefinition[] | null = null

/**
 * Parse and validate every vendored definition.
 *
 * THROWS on a malformed definition. That is deliberate and fail-closed: a
 * definition that does not validate must not be registerable, and a silent
 * empty list would look like "nothing to orchestrate" rather than "the
 * governance document is broken".
 */
export function loadVendoredDefinitions(): VendoredDefinition[] {
  if (cache !== null) return cache

  const loaded = VENDORED.map(entry => {
    const parsed = parseWorkflowSpec(entry.raw)
    if (!parsed.ok) {
      throw new Error(
        `vendored workflow definition ${entry.source_path} is invalid:\n  - ${parsed.errors.join('\n  - ')}`,
      )
    }
    return {
      def_key: parsed.spec.def_key,
      version: parsed.spec.version,
      source_repo: entry.source_repo,
      source_path: entry.source_path,
      source_sha256: entry.source_sha256,
      spec: parsed.spec,
      def_hash: computeDefHash(parsed.spec),
    }
  })

  cache = loaded
  return loaded
}

/** One vendored definition by key and version. Null when not vendored. */
export function findVendoredDefinition(defKey: string, version: number): VendoredDefinition | null {
  return loadVendoredDefinitions().find(d => d.def_key === defKey && d.version === version) ?? null
}

export const FAMILJE_STUNDEN_MONTHLY_RELEASE = 'familje-stunden.monthly-release'
