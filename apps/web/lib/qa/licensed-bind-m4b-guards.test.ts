/**
 * Phase 3B1B2 · M4-B — permanent static guards on the single-statement licensed bind.
 *
 * The real-PostgreSQL suite proves the bind refuses, serializes and fences. These
 * guards stop a later edit from quietly undoing the STRUCTURE those proofs rely on:
 *
 *   - one SECURITY DEFINER function, service_role only, empty search_path;
 *   - the Survival anchor + vector come from the database, never a parameter;
 *   - the subject (project, definition, state) is the instance's own;
 *   - M1 lock order: instance FOR UPDATE → current Decision head FOR SHARE →
 *     proofs → deadline → run → provenance → survival_commit_fence() LAST, and
 *     after the fence only the RETURN of local variables;
 *   - no SET CONSTRAINTS, no cron, no licence/Decision creation;
 *   - the run carries the canonical FINANCIAL policy values;
 *   - the provenance records proof facts and never a fabricated state;
 *   - the 3B1A matrices are narrowed only by `admission_basis is not null`;
 *   - no Decision or licence write may follow a bind in its transaction.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ACTION_CLASS_POLICY, policyClassForActionClass } from '@/lib/workflows/action-target'
import { ACTION_REGISTRY } from '@/lib/workflows/action-registry'

const APP = process.cwd()
const MIGRATIONS = join(APP, 'supabase/migrations')
const M4B_FILE = '20261004110000_m4b_licensed_bind.sql'
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const sqlCode = (s: string) => s.replace(/--[^\n]*/g, '')
const m4b = read(join(MIGRATIONS, M4B_FILE))
const code = sqlCode(m4b)
const SIG = 'uuid, text, text, text, text, text, uuid, uuid'

const header = /create or replace function public\.bind_licensed_workflow_action_run_v1\(([\s\S]*?)\)\s*returns table \(bound_run_id uuid, bind_event_id uuid\)([\s\S]*?)as \$\$([\s\S]*?)\$\$;/.exec(code)
const PARAMS = header ? header[1] : ''
const ATTRS = header ? header[2] : ''
const BODY = header ? header[3] : ''
const at = (needle: string | RegExp) => typeof needle === 'string' ? BODY.indexOf(needle) : BODY.search(needle)

describe('M4-B: one reviewed SECURITY DEFINER statement', () => {
  it('exists exactly once, SECURITY DEFINER, empty search_path', () => {
    expect(header).not.toBeNull()
    expect(code.split('create or replace function public.bind_licensed_workflow_action_run_v1(').length - 1).toBe(1)
    expect(ATTRS).toMatch(/security definer/)
    expect(ATTRS).toMatch(/set search_path = ''/)
  })

  it('takes identity and convenience fields only — no project, level, licence, Decision, ceiling, vector, anchor or deadline', () => {
    const names = [...PARAMS.matchAll(/\b(p_[a-z_]+)\s+[a-z]/g)].map(m => m[1])
    expect(names).toEqual(['p_workflow_instance_id', 'p_action_kind', 'p_workflow_def_hash', 'p_workflow_from_state',
      'p_target_version_hash', 'p_idempotency_key', 'p_attempt_group', 'p_authorization_id'])
    expect(PARAMS).not.toMatch(/p_project|level|licen|decision|survival|ceiling|vector|anchor|deadline|invalid/i)
  })

  it('service_role may execute it; nobody else', () => {
    expect(code).toMatch(new RegExp(`revoke all on function public\\.bind_licensed_workflow_action_run_v1\\(${SIG}\\)\\s*from public, anon, authenticated, service_role;`))
    expect(code).toMatch(new RegExp(`grant execute on function public\\.bind_licensed_workflow_action_run_v1\\(${SIG}\\)\\s*to service_role;`))
    expect(code.match(/grant [a-z, ]+ on function public\.bind_licensed_workflow_action_run_v1/gi)).toHaveLength(1)
  })
})

describe('M4-B: the subject and the Survival observation are the database\'s own', () => {
  it('the anchor and epoch vector come from survival_observation_anchor(), read inside the function', () => {
    expect(BODY).toMatch(/select a\.anchor, a\.epoch_vector into v_anchor, v_vector from public\.survival_observation_anchor\(\) a;/)
    expect(BODY).toMatch(/perform public\.survival_commit_fence\(v_vector, v_anchor\);/)
  })

  it('every proof is evaluated at the anchor', () => {
    expect(BODY).toMatch(/licensed_bind_v1_licence_proof\(v_inst\.id, p_action_kind, v_anchor\)/)
    expect(BODY).toMatch(/licensed_bind_v1_survival_proof\(v_anchor\)/)
    expect(BODY).toMatch(/survival_clock_invalid_at\(v_anchor\)/)
  })

  it('project, definition and state are read from the instance; caller fields are only compared', () => {
    expect(BODY).toMatch(/v_inst\.def_hash is distinct from p_workflow_def_hash/)
    expect(BODY).toMatch(/v_inst\.current_state is distinct from p_workflow_from_state/)
    // The run is written from the instance, never from the caller's copy.
    const insert = BODY.slice(at('insert into public.runs'), at('returning id into v_run_id'))
    expect(insert).toMatch(/v_inst\.project_id/)
    expect(insert).toMatch(/v_inst\.def_hash, v_inst\.current_state/)
    expect(insert).not.toMatch(/p_workflow_def_hash|p_workflow_from_state/)
  })

  it('kind, definition and state must be a V1 supported placement; the required level comes from that set', () => {
    expect(BODY).toMatch(/from public\.licensed_bind_v1_supported\(\) s\s*where s\.action_kind = p_action_kind\s*and s\.bound_def_key = v_inst\.def_key\s*and s\.placement_state = v_inst\.current_state;/)
    expect(BODY).toMatch(/v_v1\.minimum_level/)
    expect(BODY).not.toMatch(/'L[0-6]'/)
  })
})

describe('M4-B: lock order and FENCE LAST', () => {
  const ORDER = [
    'from public.survival_observation_anchor()',
    /from public\.workflow_instances where id = p_workflow_instance_id for update;/,
    'from public.licensed_bind_v1_supported()',
    /from public\.atlas_decision_lineage_heads h\s*where h\.decision_id = v_pin\.decision_id\s*for share;/,
    'public.licensed_bind_v1_licence_proof(',
    /from public\.atlas_authorization_heads ah\s*where ah\.authorization_id = p_authorization_id\s*for share;/,
    'public.licensed_bind_v1_authorization_proof(',
    'public.licensed_bind_v1_survival_proof(',
    'public.licensed_bind_register_authority_deadline(',
    'insert into public.runs',
    'insert into public.run_autonomy_decisions',
    'perform public.survival_commit_fence(',
  ]

  it('anchor → instance FOR UPDATE → supported set → Decision head FOR SHARE → licence proof → authorization head FOR SHARE → authorization proof → Survival proof → deadline → run → provenance → fence', () => {
    const positions = ORDER.map(n => at(n))
    for (const [i, p] of positions.entries()) expect(p, String(ORDER[i])).toBeGreaterThan(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('exactly one fence call, and after it ONLY the return of two local variables', () => {
    expect(BODY.match(/survival_commit_fence\(/g)).toHaveLength(1)
    const tail = BODY.slice(at('perform public.survival_commit_fence(')).replace(/\s+/g, ' ').trim()
    expect(tail).toBe('perform public.survival_commit_fence(v_vector, v_anchor); return query select v_run_id, v_event_id; end')
  })

  it('takes no lock other than the instance row, the Decision head and the authorization head — in that order', () => {
    expect(BODY.match(/\bfor (update|share|no key update|key share)\b/gi)).toEqual(['for update', 'for share', 'for share'])
    expect(BODY).not.toMatch(/lock table|pg_advisory/i)
  })

  it('the deadline is the EARLIEST proven expiry — licence/Decision and human authorization — and nothing else', () => {
    expect(BODY).toMatch(/v_deadline := least\(v_lic\.authority_invalid_at, v_auth\.authority_invalid_at\);/)
    expect(BODY).toMatch(/perform public\.licensed_bind_register_authority_deadline\(v_deadline\);/)
    expect(BODY.match(/v_deadline :=/g)).toHaveLength(1)
  })

  it('the authorization id is only a SELECTOR: it reaches the proof and the head lock, and is written only after the proof admitted', () => {
    const proof = at('public.licensed_bind_v1_authorization_proof(')
    expect(BODY).toMatch(/if v_auth\.admissible is not true then\s*raise exception 'licensed bind: human execution authorization not proven/)
    // The proof is fed the INSTANCE's facts and the run identity, never another caller field.
    expect(BODY).toMatch(/licensed_bind_v1_authorization_proof\(\s*p_authorization_id, v_inst\.project_id, v_inst\.id, v_inst\.def_key, v_inst\.def_version, v_inst\.def_hash,\s*v_inst\.current_state, p_action_kind, 'FINANCIAL', p_target_version_hash, p_attempt_group, v_anchor\)/)
    expect(at('insert into public.runs')).toBeGreaterThan(proof)
  })

  it('no SET CONSTRAINTS, cron, scheduler, licence issuance or Decision creation anywhere in M4-B', () => {
    expect(code).not.toMatch(/set\s+constraints/i)
    expect(code).not.toMatch(/\bcron\b|pg_cron|pg_net|net\.http/i)
    expect(code).not.toMatch(/autonomy_license_append\s*\(|atlas_decision_ledger_append\s*\(/)
    expect(code).not.toMatch(/insert into public\.(atlas_autonomy_license_events|atlas_decision_ledger)\b/)
  })

  it('every refusal raises — a refused bind has nothing to roll back to', () => {
    expect(BODY).not.toMatch(/exception\s+when/i)
    expect(BODY.match(/using errcode = 'LB010'/g)!.length).toBeGreaterThanOrEqual(5)
  })
})

describe('M4-B: the run is a canonical FINANCIAL run', () => {
  it('the V1 kind is FINANCIAL, and the run carries ACTION_CLASS_POLICY.FINANCIAL values', () => {
    expect(ACTION_REGISTRY.proof_governed_effect.action_class).toBe('FINANCIAL')
    const insert = BODY.slice(at('insert into public.runs'), at('returning id into v_run_id'))
    expect(insert).toContain(`${ACTION_CLASS_POLICY.FINANCIAL.maxAttempts}, '${policyClassForActionClass('FINANCIAL')}'`)
    expect(insert).toContain(`p_action_kind, 'FINANCIAL', p_target_version_hash, p_authorization_id`)
    expect(ACTION_CLASS_POLICY.FINANCIAL.requiresAuthorization).toBe(true)
    // The authorization is required, never optional.
    expect(BODY).toMatch(/or p_authorization_id is null then/)
  })
})

describe('M4-B provenance: proof facts, never fabricated states', () => {
  const matrix = /add constraint run_autonomy_decisions_db_proof_v1_matrix\s*check \(([\s\S]*?)\n    \);/.exec(code)?.[1] ?? ''

  it('a V1 row claims no Survival state, ceiling, exact level, resolver verdict or bound', () => {
    for (const col of ['license_reason', 'license_resolved_at', 'effective_level', 'bounded_by',
      'survival_state', 'survival_ceiling', 'survival_reason', 'survival_as_of']) {
      expect(matrix, col).toMatch(new RegExp(`\\b${col} is null\\b`))
    }
  })

  it('a V1 row carries every proof fact, and a 3B1A row carries none', () => {
    for (const col of ['decision_id', 'decision_record_id', 'decision_version', 'survival_anchor',
      'survival_epoch_vector', 'survival_valid_until', 'authority_valid_until']) {
      expect(matrix, col).toMatch(new RegExp(`\\b${col} is not null\\b`))
      expect(matrix, col).toMatch(new RegExp(`\\b${col} is null\\b`))
    }
    expect(matrix).toMatch(/boundary\s+is not distinct from 'bind'/)
    expect(matrix).toMatch(/policy_mode\s+is not distinct from 'licensed'/)
    expect(matrix).toMatch(/reason\s+is not distinct from 'allowed'/)
  })

  it('the bind writes the predicates\' OWN success reasons, never a constant it could invent for Survival', () => {
    const insert = BODY.slice(at('insert into public.run_autonomy_decisions'), at('returning event_id into v_event_id'))
    expect(insert).toMatch(/v_lic\.reason, v_srv\.reason/)
    expect(insert).toMatch(/v_anchor, v_vector, v_srv_inv, v_deadline, v_v1\.minimum_level/)
    expect(insert).toMatch(/p_authorization_id, v_auth\.request_event_id, v_auth\.grant_event_id, v_auth\.granted_by,\s*v_auth\.reason, v_auth\.authority_invalid_at/)
  })

  it('the three narrowed 3B1A matrices are their original expressions guarded only by admission_basis', () => {
    const trace = sqlCode(read(join(MIGRATIONS, '20260925120000_autonomy_trace_decisions.sql')))
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
    for (const name of ['run_autonomy_decisions_licensed_common',
      'run_autonomy_decisions_licensed_effective_requires_identity',
      'run_autonomy_decisions_survival_observed_or_failed_closed']) {
      const original = new RegExp(`constraint ${name}\\s*check \\(([\\s\\S]*?)\\),\\n\\n`).exec(trace)?.[1]
        ?? new RegExp(`constraint ${name}\\s*check \\(([\\s\\S]*?)\\)\\n\\);`).exec(trace)?.[1]
      const replaced = new RegExp(`add constraint ${name}\\s*check \\(admission_basis is not null\\s*or ([\\s\\S]*?)\\);\\n`).exec(code)?.[1]
      expect(original, name).toBeTruthy()
      expect(replaced, name).toBeTruthy()
      expect(norm(replaced!), name).toBe(norm(original!))
    }
  })
})

describe('M4-B: no authority write after a bind in the same transaction', () => {
  it('both authority ledgers carry the BEFORE INSERT refusal, keyed on this transaction\'s intent row', () => {
    expect(code).toMatch(/before insert on public\.atlas_decision_ledger\s*for each row execute function public\.licensed_bind_no_authority_write_after_bind\(\);/)
    expect(code).toMatch(/before insert on public\.atlas_autonomy_license_events\s*for each row execute function public\.licensed_bind_no_authority_write_after_bind\(\);/)
    expect(code).toMatch(/where i\.xact = pg_catalog\.pg_current_xact_id\(\)/)
    expect(code).toMatch(/using errcode = 'LB004'/)
  })
})

describe('M4-B is the last migration and leaves the exempt bind untouched', () => {
  it('no migration after M4-B, and M4-B does not redefine the exempt bind', () => {
    const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
    expect(files[files.length - 1]).toBe(M4B_FILE)
    expect(code).not.toMatch(/function public\.bind_workflow_action_run\(/)
    expect(code).not.toMatch(/runs_require_bind_provenance/)
  })
})

describe('M4: the TypeScript bind preflight checks the SAME human authorization the database proves', () => {
  const run = read(join(APP, 'lib/workflows/action-run.ts')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
  const create = run.slice(run.indexOf('export async function createWorkflowActionRun('), run.indexOf('\nexport ', run.indexOf('export async function createWorkflowActionRun(') + 10))

  it('a governed effect is checked at BIND with assertExecutionAuthorized over the run\'s own identity, attempt group required', () => {
    expect(create).toMatch(/if \(policy\.requiresAuthorization && canonical\.executor_family === 'governed_effect'\) \{/)
    expect(create).toMatch(/if \(!input\.authorizationId \|\| !input\.attemptGroup\) \{/)
    const call = create.slice(create.indexOf('await assertExecutionAuthorized({'))
    const args = call.slice(0, call.indexOf('})'))
    for (const field of ['authorizationId: input.authorizationId', 'projectId: instance.project_id', 'instanceId: instance.id',
      'defKey: instance.def_key', 'defVersion: instance.def_version', 'defHash: instance.def_hash', 'state: instance.current_state',
      'actionKind: input.actionKind', 'actionClass', 'targetVersionHash: target.versionHash', 'attemptGroup: input.attemptGroup']) {
      expect(args, field).toContain(field)
    }
    // …before identity is computed and before anything is written.
    expect(create.indexOf('await assertExecutionAuthorized({')).toBeLessThan(create.indexOf('computeActionIdempotencyKey('))
  })

  it('the attempt group bound is the one the authorization pinned (no fresh uuid for a governed effect)', () => {
    expect(create).toMatch(/const attemptGroup = input\.attemptGroup \?\? uuid\(\)/)
    // For a governed effect the earlier branch already refused a missing attempt group,
    // so `?? uuid()` can only apply to classes that need no execution authorization.
  })
})
