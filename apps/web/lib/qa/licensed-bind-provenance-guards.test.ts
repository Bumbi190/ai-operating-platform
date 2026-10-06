/**
 * Phase 3B1B2 · M4-B — the licensed-bind provenance may never claim what the
 * database did not derive.
 *
 * Owner ruling (Option B+ §13): a successful M4 V1 bind records the CONSERVATIVE
 * PROOF FACTS — exact licence event, exact current Decision head, the predicates'
 * own success reasons (proof profile), Survival anchor + epoch vector, both commit
 * deadlines, and that the effective authority is at least the required level. It
 * must NOT record a canonical Survival state, a Survival ceiling, an exact
 * effective level, a resolved-licence verdict or a bound — the database derived
 * none of them, and the TypeScript folds remain the only complete interpretation.
 * (This deliberately supersedes the original M4 specification's §15 request to
 * persist a "canonical Survival state".)
 *
 * These guards make that permanent:
 *   1. the bind's provenance INSERT names no state/ceiling/verdict column;
 *   2. the V1 matrix forces every such column NULL on a V1 row;
 *   3. no later migration may re-shape that matrix or the narrowed 3B1A
 *      matrices without failing here (a reviewed change must update this file);
 *   4. the TypeScript licensed admission carries no authority value at all, so no
 *      caller-supplied claim can reach the RPC.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP = process.cwd()
const MIGRATIONS = join(APP, 'supabase/migrations')
const M4B_FILE = '20261004110000_m4b_licensed_bind.sql'
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const sqlCode = (s: string) => s.replace(/--[^\n]*/g, '')
const tsCode = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const m4b = sqlCode(read(join(MIGRATIONS, M4B_FILE)))

/** Columns a V1 row must never carry: they would claim a derivation the database did not make. */
const NEVER_CLAIMED = ['survival_state', 'survival_ceiling', 'survival_reason', 'survival_as_of',
  'effective_level', 'bounded_by', 'license_reason', 'license_resolved_at']
/** Columns a V1 row must always carry: the proof facts. */
const PROOF_FACTS = ['license_id', 'license_generation', 'decision_id', 'decision_record_id', 'decision_version',
  'decision_head_generation', 'decision_proof', 'licence_proof', 'survival_proof', 'survival_anchor',
  'survival_epoch_vector', 'survival_valid_until', 'authority_valid_until', 'proven_min_level',
  'authorization_id', 'authorization_request_event_id', 'authorization_grant_event_id', 'authorization_granted_by',
  'authorization_proof', 'authorization_valid_until']

describe('licensed-bind provenance: proof facts only, never a fabricated canonical state', () => {
  const fn = m4b.slice(m4b.indexOf('function public.bind_licensed_workflow_action_run_v1('))
  const insert = /insert into public\.run_autonomy_decisions \(([\s\S]*?)\)\s*values \(([\s\S]*?)\)\s*returning event_id/.exec(fn)
  const columns = insert ? insert[1].split(',').map(c => c.trim()) : []
  const values = insert ? insert[2].split(',').map(v => v.trim()) : []

  it('the bind writes exactly one provenance row, with as many values as columns', () => {
    expect(insert).not.toBeNull()
    expect(fn.match(/insert into public\.run_autonomy_decisions/g)).toHaveLength(1)
    expect(values).toHaveLength(columns.length)
  })

  it('the INSERT names NO state, ceiling, exact-level, verdict or bound column', () => {
    for (const col of NEVER_CLAIMED) expect(columns, col).not.toContain(col)
  })

  it('the INSERT names EVERY proof fact, and marks the row as a conservative proof', () => {
    for (const col of PROOF_FACTS) expect(columns, col).toContain(col)
    expect(values[columns.indexOf('admission_basis')]).toBe(`'db_conservative_proof_v1'`)
    expect(values[columns.indexOf('policy_mode')]).toBe(`'licensed'`)
  })

  it('every proof value comes from the function\'s own locals or the predicates — never a parameter', () => {
    for (const col of PROOF_FACTS.filter(c => c !== 'authorization_id')) {
      const v = values[columns.indexOf(col)]
      expect(v, col).not.toMatch(/^p_/)
    }
    // The ONE parameter-valued fact: the authorization id the caller used as a
    // SELECTOR. It is written only after the proof admitted that exact chain, and
    // the row also carries the grant event, principal and expiry the PROOF returned.
    expect(values[columns.indexOf('authorization_id')]).toBe('p_authorization_id')
    expect(values[columns.indexOf('authorization_grant_event_id')]).toBe('v_auth.grant_event_id')
    expect(values[columns.indexOf('authorization_granted_by')]).toBe('v_auth.granted_by')
    expect(values[columns.indexOf('authorization_proof')]).toBe('v_auth.reason')
    // The Survival profile is the predicate's OWN success reason, not a constant this function chose.
    expect(values[columns.indexOf('survival_proof')]).toBe('v_srv.reason')
    expect(values[columns.indexOf('licence_proof')]).toBe('v_lic.reason')
  })

  it('the V1 matrix forces every never-claimed column NULL and every proof fact present', () => {
    const matrix = /add constraint run_autonomy_decisions_db_proof_v1_matrix\s*check \(([\s\S]*?)\n    \);/.exec(m4b)?.[1] ?? ''
    const v1Branch = matrix.slice(matrix.indexOf("admission_basis is not distinct from 'db_conservative_proof_v1'"))
    expect(v1Branch.length).toBeGreaterThan(100)
    for (const col of NEVER_CLAIMED) expect(v1Branch, col).toMatch(new RegExp(`\\b${col} is null\\b`))
    for (const col of PROOF_FACTS.filter(c => !['decision_proof', 'licence_proof', 'decision_head_generation', 'proven_min_level', 'authorization_proof'].includes(c))) {
      expect(v1Branch, col).toMatch(new RegExp(`\\b${col} is not null\\b`))
    }
  })
})

describe('no later migration may silently re-shape the provenance claims', () => {
  const later = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort().filter(f => f > M4B_FILE)

  it('M4-B is the only migration that defines the V1 matrix or narrows the 3B1A matrices', () => {
    const NAMES = ['run_autonomy_decisions_db_proof_v1_matrix', 'run_autonomy_decisions_licensed_common',
      'run_autonomy_decisions_licensed_effective_requires_identity', 'run_autonomy_decisions_survival_observed_or_failed_closed',
      'run_autonomy_decisions_admission_basis_vocabulary']
    for (const f of later) {
      const code = sqlCode(read(join(MIGRATIONS, f)))
      for (const n of NAMES) expect(code, `${f} touches ${n}: a reviewed change must update this guard`).not.toContain(n)
      expect(code, `${f} alters run_autonomy_decisions`).not.toMatch(/alter table public\.run_autonomy_decisions/)
    }
  })

  it('the admission-basis vocabulary is closed to the one V1 profile', () => {
    expect(m4b).toMatch(/check \(admission_basis is null or admission_basis in \('db_conservative_proof_v1'\)\)/)
  })
})

describe('the TypeScript licensed admission carries no authority value', () => {
  it('LicensedV1BindAdmission has exactly two fields, neither of which is a level, state, ceiling or identity', () => {
    const bind = tsCode(read(join(APP, 'lib/atlas/autonomy-runtime/bind.ts')))
    const iface = /export interface LicensedV1BindAdmission \{([\s\S]*?)\}/.exec(bind)?.[1] ?? ''
    const fields = [...iface.matchAll(/readonly (\w+):/g)].map(m => m[1])
    expect(fields).toEqual(['policy_mode', 'admission_basis'])
  })

  it('the seam sends the licensed RPC no provenance or authority field', () => {
    const run = tsCode(read(join(APP, 'lib/workflows/action-run.ts')))
    const call = run.slice(run.indexOf("db.rpc('bind_licensed_workflow_action_run_v1'"))
    // The argument object only (the RPC's own name contains "licensed").
    const args = call.slice(call.indexOf('{'), call.indexOf('})'))
    expect([...args.matchAll(/(p_\w+):/g)].map(m => m[1])).toEqual(['p_workflow_instance_id', 'p_action_kind',
      'p_workflow_def_hash', 'p_workflow_from_state', 'p_target_version_hash', 'p_idempotency_key', 'p_attempt_group',
      'p_authorization_id'])
    expect(args).not.toMatch(/survival|ceiling|level|licen[cs]e|decision|state'|provenance|anchor|vector/i)
  })
})
