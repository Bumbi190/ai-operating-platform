/**
 * A third evidence provenance: capability without a producer.
 *
 * The four deployed-source checks need truth that only an account-wide Supabase
 * Management token can read, so the read happens on an Editor's machine. That
 * is a real privileged verification and it is NOT the same fact as a human
 * reporting that they ran ffprobe — so it gets its own provenance rather than
 * borrowing `attested`.
 *
 * Every assertion here is negative. The value exists in the type and in the
 * schema; nothing may write it, no check may accept it, and nothing about
 * reachability or readiness may move because a column got wider.
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { evaluateCheck } from '../workflows/evidence-consumption'
import { recordEvidence } from '../workflows/store'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'
import { projectMonthReleaseBundle } from '../workflows/bundle/project'
import { loadVendoredDefinitions, FAMILJE_STUNDEN_MONTHLY_RELEASE } from '../workflows/definitions'
import type { AttestableCheck } from '../workflows/attestation'
import type {
  EvidenceSource, WorkflowDef, WorkflowEvidence, WorkflowInstance, WorkflowTransition,
} from '../workflows/types'

const NOW = '2026-09-06T12:00:00.000Z'
const PIN = 'a'.repeat(64)
const EDGE_CHECKS = ['shared_manifest_consumers_in_sync', 'deployed_manifest_matches_expected',
                     'sign_protected_asset_source_current', 'get_protected_ebook_source_current'] as const

const row = (source: EvidenceSource, over: Partial<WorkflowEvidence> = {}): WorkflowEvidence => ({
  id: `e-${source}`, instance_id: 'i', state: 'edge_deploy',
  check_key: 'shared_manifest_consumers_in_sync', result: 'pass', source,
  detail: {}, recorded_at: NOW, producer: 'editor', producer_type: 'local_agent',
  observed_at: NOW, payload_hash: null, target_hash: PIN, attestation: {}, ...over,
} as unknown as WorkflowEvidence)

const check = (allowed: EvidenceSource[]): AttestableCheck => ({
  check_key: 'shared_manifest_consumers_in_sync', state: 'edge_deploy',
  description: 'test', allowed_provenance: allowed, binds_artifacts: false, required: true,
})

const MIGRATION = 'supabase/migrations/20260906_workflow_manual_privileged_provenance.sql'
const sql = readFileSync(join(process.cwd(), MIGRATION), 'utf8')

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

// ── M. MIGRATION / SCHEMA ────────────────────────────────────────────────────

describe('M. the migration widens one constraint and touches nothing else', () => {
  it('1/2/3/4. all three values allowed, and only those three', () => {
    const predicate = sql.match(/check \(source in \(([^)]*)\)\)/)![1]
    expect(predicate).toContain("'automated'")
    expect(predicate).toContain("'attested'")
    expect(predicate).toContain("'manual_privileged'")
    // An unknown provenance is still refused by the database.
    expect(predicate).not.toContain("'privileged'")
    expect(sql).not.toMatch(/source\s+text/)          // the column is not redefined
  })

  it('5/6. null behaviour is unchanged and the constraint keeps its name', () => {
    // `source text not null` is declared in the original migration and is not
    // touched here, so nullability is exactly what it was.
    expect(sql).not.toContain('drop not null')
    expect(sql).not.toContain('set not null')
    expect((sql.match(/workflow_evidence_source_check/g) ?? [])).toHaveLength(2)  // drop + add
  })

  it('7. no other constraint, index, trigger or column is altered', () => {
    for (const forbidden of ['workflow_evidence_result_check', 'producer_type_check',
                             'payload_hash_check', 'target_hash_check', 'drop column',
                             'add column', 'drop index', 'create index', 'drop trigger',
                             'create trigger', 'alter column', 'set default']) {
      expect(sql.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase())
    }
  })

  it('8. no data is rewritten, moved or deleted', () => {
    for (const forbidden of ['update ', 'delete ', 'insert ', 'truncate', 'drop table']) {
      expect(sql.toLowerCase(), forbidden).not.toContain(forbidden)
    }
    // One atomic transaction, so a partial application cannot leave the table
    // with no source constraint at all.
    expect(sql).toContain('begin;')
    expect(sql).toContain('commit;')
    expect(sql.indexOf('begin;')).toBeLessThan(sql.indexOf('drop constraint'))
  })
})

// ── N. APPLICATION ───────────────────────────────────────────────────────────

describe('N. the value exists, and nothing can produce it', () => {
  it('1. EvidenceSource includes manual_privileged', () => {
    const v: EvidenceSource = 'manual_privileged'
    expect(v).toBe('manual_privileged')
  })

  it('2/3/4. the resolver distinguishes it from attested and from automated', () => {
    const r = row('manual_privileged')
    expect(evaluateCheck(check(['automated']), r.check_key, [r], PIN).satisfies).toBe(false)
    expect(evaluateCheck(check(['attested']), r.check_key, [r], PIN).satisfies).toBe(false)
    // It is refused for the RIGHT reason — provenance, not staleness or absence.
    expect(evaluateCheck(check(['attested']), r.check_key, [r], PIN).satisfaction)
      .toBe('provenance_refused')
  })

  it('5/6. a check that lists it accepts it, including in a mixed array', () => {
    const r = row('manual_privileged')
    expect(evaluateCheck(check(['manual_privileged']), r.check_key, [r], PIN).satisfies).toBe(true)
    expect(evaluateCheck(check(['automated', 'manual_privileged']), r.check_key, [r], PIN)
      .satisfies).toBe(true)
    // And the mixed array still accepts automated, which is the point of listing
    // both: adopting the manual path must not close the automated one.
    const auto = row('automated', { producer: null, producer_type: null })
    expect(evaluateCheck(check(['automated', 'manual_privileged']), auto.check_key, [auto], PIN)
      .satisfies).toBe(true)
  })

  it('7/8. the ordinary evidence route hard-codes attested and takes no provenance', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/workflows/evidence/route.ts'), 'utf8')
    expect(route).toContain("source: 'attested',")
    expect(route).not.toContain('manual_privileged')
    // No alias by which a caller could select provenance. `body.sourceCommit`
    // is a legitimate attestation field, so the guard names the provenance
    // aliases exactly rather than matching the prefix `body.source`.
    for (const alias of ['body.source ', 'body.source,', 'body.source)', 'body.source;',
                         'body.provenance', 'body.evidence_source', 'body.evidenceSource']) {
      expect(route, alias).not.toContain(alias)
    }
    expect(route).toContain('body.sourceCommit')   // the field that DOES exist
  })

  it('9. the automated executor hard-codes automated', () => {
    const exec = readFileSync(join(process.cwd(), 'lib/workflows/action-executor.ts'), 'utf8')
    expect((exec.match(/source: 'automated'/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(exec).not.toContain('manual_privileged')
    expect(exec).not.toMatch(/source:\s*(input|body|payload|run)\./)
  })

  it('10. THE GUARD — the generic writer refuses it outright', async () => {
    // recordEvidence takes `source: EvidenceSource`, so widening the union made
    // the value type-legal at every call site. A producer that appears as a
    // side effect of a type change is an authority nobody reviewed.
    await expect(recordEvidence({} as never, {
      instanceId: 'i', state: 'edge_deploy', checkKey: 'shared_manifest_consumers_in_sync',
      result: 'pass', source: 'manual_privileged',
    })).rejects.toThrow(/manual_privileged evidence has no producer yet/)
  })

  it('10b. and no other module names it as a value it could write', () => {
    for (const f of ['lib/workflows/store.ts', 'lib/workflows/action-executor.ts',
                     'app/api/workflows/evidence/route.ts', 'lib/workflows/evidence-consumption.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      const assigns = src.match(/source:\s*'manual_privileged'/g) ?? []
      expect(assigns, f).toHaveLength(0)
    }
  })

  it('K. producer_type does not imply privileged provenance', () => {
    // Two independent dimensions. A local_agent row is still attested unless
    // its SOURCE says otherwise, and the resolver reads source alone.
    const localAgentAttested = row('attested', { producer_type: 'local_agent' })
    expect(evaluateCheck(check(['manual_privileged']), localAgentAttested.check_key,
      [localAgentAttested], PIN).satisfies).toBe(false)
  })
})

// ── I/J. NOTHING ADOPTED IT ──────────────────────────────────────────────────

describe('I/J. no check, no reachability, no readiness moved', () => {
  const bundle = () => {
    const v = loadVendoredDefinitions().find(d => d.def_key === FAMILJE_STUNDEN_MONTHLY_RELEASE)!
    const def: WorkflowDef = { id: 'd', def_key: v.def_key, version: v.version,
      def_hash: v.def_hash, spec: v.spec, created_at: NOW }
    const instance: WorkflowInstance = {
      id: 'i', def_id: 'd', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: v.version,
      def_hash: 'h', project_id: 'p', instance_key: '2099-01', current_state: 'edge_deploy',
      status: 'active', wake_at: null, last_tick_at: null, last_tick_outcome: null,
      created_at: NOW, closed_at: null }
    const transitions: WorkflowTransition[] = [{ id: 't', seq: 1, instance_id: 'i',
      from_state: null, to_state: 'planning', reason: 't', actor: 't',
      evidence_ref: null, authorization_id: null, occurred_at: NOW }]
    return projectMonthReleaseBundle({
      month_key: '2099-01', def, instance, transitions, evidence: [],
      declaredChecks: FAMILJE_STUNDEN_CHECKS,
      githubRepository: 'Bumbi190/familje-stunden-v2', now: NOW })
  }

  it('11. the four edge checks are still automated-only, and required', () => {
    for (const key of EDGE_CHECKS) {
      for (const c of FAMILJE_STUNDEN_CHECKS.filter(x => x.check_key === key)) {
        expect([...c.allowed_provenance], `${key}@${c.state}`).toEqual(['automated'])
        expect(c.required, `${key}@${c.state}`).toBe(true)
        expect(c.binds_artifacts, `${key}@${c.state}`).toBe(false)
      }
    }
    // No check anywhere in the catalogue adopted it.
    expect(FAMILJE_STUNDEN_CHECKS.filter(
      c => c.allowed_provenance.includes('manual_privileged'))).toHaveLength(0)
  })

  it('12. reachability is unchanged', () => {
    const b = bundle()
    const expected: [string, string, string][] = [
      ['shared_manifest_consumers_in_sync', 'edge_deploy', 'MANUAL_PRIVILEGED_VERIFICATION'],
      ['deployed_manifest_matches_expected', 'edge_deploy', 'UNREACHABLE'],
      ['sign_protected_asset_source_current', 'edge_deploy', 'UNREACHABLE'],
      ['get_protected_ebook_source_current', 'edge_deploy', 'UNREACHABLE'],
    ]
    for (const [key, state, reach] of expected) {
      const c = b.checks.find(x => x.check_key === key && x.state === state)!
      expect(c.reachability, `${key}@${state}`).toBe(reach)
      expect(c.status, `${key}@${state}`).toBe('NOT_EXERCISED')
    }
  })

  it('13/14. readiness and the passive bundle are unchanged', () => {
    const b = bundle()
    expect(b.readiness.product).toBe('BLOCKED')
    // The bundle legitimately contains the REACHABILITY word
    // MANUAL_PRIVILEGED_VERIFICATION, which shares a prefix. What must be
    // absent is the PROVENANCE: no check may report it as an evidence source.
    // TypeScript itself proves the stronger form: the bundle's `Provenance`
    // union has no manual-privileged member, so a check literally cannot
    // report one. Asserting it at runtime was a comparison with no overlap.
    const types = readFileSync(join(process.cwd(), 'lib/workflows/bundle/types.ts'), 'utf8')
    const provenance = types.match(/export type Provenance =[^\n]*(\n\s*\|[^\n]*)*/)![0]
    expect(provenance).not.toContain('MANUAL_PRIVILEGED')
    expect(JSON.stringify(b)).not.toContain('"manual_privileged"')
  })

  it('15/16. no credential is read and no network surface is added', () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    bundle()
    expect(spy).not.toHaveBeenCalled()
    // The slice adds no route.
    const routes = readFileSync(join(process.cwd(), 'app/api/workflows/evidence/route.ts'), 'utf8')
    for (const forbidden of ['privileged-evidence', 'manual-privileged', 'operator-verification']) {
      expect(routes, forbidden).not.toContain(forbidden)
    }
  })

  it('P. the expected-manifest key now names its hash domain', () => {
    // This guard previously pinned the OPPOSITE — that the provenance slice
    // stayed focused and did not rename anything. The rename has since landed
    // as its own change, so the guard now pins the result rather than the
    // deferral: the live key says which domain it is, and the old ambiguous
    // name is gone from the module entirely.
    const binding = readFileSync(
      join(process.cwd(), 'lib/workflows/bundle/manifest-binding.ts'), 'utf8')
    expect(binding).toContain("expectedSourceSha: 'expected_manifest_source_sha256'")
    expect(binding).not.toContain("'expected_manifest_sha256'")
  })
})
