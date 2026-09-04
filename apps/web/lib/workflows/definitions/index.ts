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
import rawFamiljeStundenMonthlyReleaseV2 from './familje-stunden.monthly-release.v2.json'
import rawOmniraProbeValidationV1 from './omnira.probe-validation.v1.json'
import rawOmniraReleaseGateProofV1 from './omnira.release-gate-proof.v1.json'
import rawOmniraExecutionProofV1 from './omnira.execution-proof.v1.json'
import { computeDefHash, parseWorkflowSpec } from '../spec'
import type { WorkflowSpec } from '../types'

export interface VendoredDefinition {
  def_key: string
  version: number
  /** Where the canonical file lives, for provenance in an audit. */
  source_repo: string
  source_path: string
  /**
   * SHA-256 of the file. For `vendored_upstream` it is byte-identical to the
   * upstream document; for `authored_here` it is simply this repo's own file.
   */
  source_sha256: string
  provenance: DefinitionProvenance
  spec: WorkflowSpec
  def_hash: string
}

interface VendorEntry {
  raw: unknown
  source_repo: string
  source_path: string
  source_sha256: string
  provenance: DefinitionProvenance
}

/**
 * Where a definition came from, and therefore what its hash MEANS.
 *
 * `vendored_upstream` — copied byte-identically from a product repository that
 *   owns the process. Omnira may not edit it; a change upstream is a NEW
 *   VERSION, and `source_sha256` is the proof of fidelity.
 *
 * `authored_here` — written in this repository, describing something Omnira
 *   itself does. It is NOT a product process and must never be presented as
 *   one. Kept in the same array so registration, pinning and immutability are
 *   identical, but labelled so an audit can never mistake the two.
 */
export type DefinitionProvenance = 'vendored_upstream' | 'authored_here'

const VENDORED: VendorEntry[] = [
  {
    raw: rawFamiljeStundenMonthlyReleaseV1,
    source_repo: 'familje-stunden-v2',
    source_path: 'docs/MONTHLY_RELEASE_WORKFLOW_V1.yaml',
    source_sha256: '88d9cc31fe57181e974d1e37c8968eee40bc8cc11e1745fe0a85205e98fa1bed',
    provenance: 'vendored_upstream',
  },
  {
    // v2 adds canonical STORY authority — language, audience, page structure and
    // content-page text density — plus pointers to the story and character
    // contracts. Upstream merge 3aaffc1 (familje-stunden-v2 PR #63).
    //
    // A NEW VERSION, never an edit: v1 is registered in production and the entry
    // above is untouched. v2's state graph is deliberately IDENTICAL to v1 —
    // same 19 states, same ids, same automated_actions — because
    // `assertRegistryMatchesDefinition` resolves a placement by `def_key` alone.
    // Two versions whose states diverged would make that lookup's answer depend
    // on array order.
    raw: rawFamiljeStundenMonthlyReleaseV2,
    source_repo: 'familje-stunden-v2',
    source_path: 'docs/MONTHLY_RELEASE_WORKFLOW_V2.yaml',
    source_sha256: '0cfd18242b8bdc3a285ccca164b6a89d1a508dd54c57a63f9202d566b7ea1e76',
    provenance: 'vendored_upstream',
  },
  {
    // Omnira's governed-effect proof. Phase 2B-1. Authored here for the same
    // reason the release-gate proof is: proving that Omnira can govern an
    // irreversible act must not require a product state to become live.
    raw: rawOmniraExecutionProofV1,
    source_repo: 'ai-operating-platform',
    source_path: 'apps/web/lib/workflows/definitions/omnira.execution-proof.v1.json',
    source_sha256: '81aecb5b986dca76c443d09f8b331d6c8e4384d2be3da101e011721c1706137d',
    provenance: 'authored_here',
  },
  {
    // Omnira's own capability test. Deliberately NOT attributed to
    // Familje-Stunden: it describes no release and owns no product process.
    raw: rawOmniraProbeValidationV1,
    source_repo: 'ai-operating-platform',
    source_path: 'apps/web/lib/workflows/definitions/omnira.probe-validation.v1.json',
    source_sha256: '713ba6e3a06d432e46d6d129de2680cc48426541742f7b1a188f0e6b663dad86',
    provenance: 'authored_here',
  },
  {
    // Omnira's release-gate verification. Also `authored_here`, and SEPARATE
    // from the capability test for a reason the two contracts make unavoidable:
    // this instance key IS a canonical YYYY-MM month, while
    // `omnira.probe-validation` states in its own adapter that its key is not a
    // month and that it has no calendar. One definition cannot mean both.
    raw: rawOmniraReleaseGateProofV1,
    source_repo: 'ai-operating-platform',
    source_path: 'apps/web/lib/workflows/definitions/omnira.release-gate-proof.v1.json',
    source_sha256: 'e7379aba12603da1277473cc32b50e5b2b677e0e8db8e35da5e9f8e3472f75df',
    provenance: 'authored_here',
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
      provenance: entry.provenance,
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
export const OMNIRA_RELEASE_GATE_PROOF = 'omnira.release-gate-proof'
export const OMNIRA_EXECUTION_PROOF = 'omnira.execution-proof'
