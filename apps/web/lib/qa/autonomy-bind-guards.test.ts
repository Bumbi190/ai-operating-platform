/**
 * Phase 3B1B — permanent guards: bind is wired, and NOTHING ELSE is.
 *
 * Phase 3B1B wires autonomy into exactly one boundary: run creation. These
 * guards make a later refactor that quietly extends it into readiness,
 * pre-dispatch, the scheduler, the executor, the drain or a provider path fail
 * loudly, and pin the atomic bind writer's security and shape.
 *
 * Paths are normalized to forward slashes so the guards mean the same thing on
 * every platform.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { ACTION_REGISTRY } from '@/lib/workflows/action-registry'
import { ACTION_CLASS_POLICY, policyClassForActionClass } from '@/lib/workflows/action-target'
import {
  AUTONOMY_RUNTIME_POLICY, LICENCE_EXEMPT_OBSERVATION_KINDS,
} from '@/lib/atlas/autonomy-runtime/policy'
import { BIND_RPC_PARAMS } from './bind-rpc-fake'

const APP = process.cwd()
const rel = (abs: string) => abs.slice(APP.length + 1).replace(/\\/g, '/')
const read = (p: string) => readFileSync(join(APP, p), 'utf8')
/** Strip comments, so naming a thing in prose is never mistaken for using it. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    if (['node_modules', '.next', '.turbo', '.git'].includes(entry)) return []
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx|mjs|js)$/.test(entry) ? [full] : []
  })
}
const SOURCE = ['lib', 'app', 'components', 'scripts']
  .flatMap(r => walk(join(APP, r)))
  .map(f => ({ rel: rel(f), code: codeOnly(readFileSync(f, 'utf8')) }))
  .filter(f => !f.rel.startsWith('lib/qa/'))

const MIGRATION_DIR = 'supabase/migrations'
const BIND_MIGRATION = '20260926120000_autonomy_bind_atomic.sql'
/** sha256 of the reviewed 3B1B migration, LF-normalized. Immutable after the production apply. */
const BIND_MIGRATION_SHA256 = '601c24b756bd096ebfb268fd91457bd326239c71ce830e025573817eca16b5a2'
const TRACE_MIGRATION = '20260925120000_autonomy_trace_decisions.sql'
const ALL_MIGRATIONS = readdirSync(join(APP, MIGRATION_DIR)).filter(f => f.endsWith('.sql')).sort()
const BIND_WRITER_DEF = 'create or replace function public.bind_workflow_action_run('

/**
 * The EFFECTIVE bind surface: the LAST migration (in apply order) that defines
 * `bind_workflow_action_run`. Once 3B1B is applied it is immutable, so a
 * reviewed widening or narrowing arrives as a FORWARD migration that redefines
 * the function — and every structural guard below then judges THAT definition,
 * never a stale one. Nothing here makes widening easier: the effective
 * snapshot must stay SET-EQUAL to current canonical TypeScript policy.
 */
const BIND_WRITER_MIGRATIONS = ALL_MIGRATIONS
  .filter(f => read(`${MIGRATION_DIR}/${f}`).replace(/--.*$/gm, '').includes(BIND_WRITER_DEF))
const EFFECTIVE_BIND_MIGRATION = BIND_WRITER_MIGRATIONS[BIND_WRITER_MIGRATIONS.length - 1]
/** The migration holding the effective definition (each defines it exactly once). */
const bindSql = read(`${MIGRATION_DIR}/${EFFECTIVE_BIND_MIGRATION}`)
const bindSqlCode = bindSql.replace(/--.*$/gm, '')
/** The full 3B1B migration text (index, trigger, privileges). */
const bindMigrationSql = read(`${MIGRATION_DIR}/${BIND_MIGRATION}`)
const bindMigrationCode = bindMigrationSql.replace(/--.*$/gm, '')

const runSrc = read('lib/workflows/action-run.ts')
const runCode = codeOnly(runSrc)

/** The body of one exported function in action-run.ts. */
function fnBody(name: string): string {
  const at = runCode.indexOf(`export async function ${name}(`)
  expect(at, name).toBeGreaterThan(-1)
  const next = runCode.indexOf('\nexport ', at + 10)
  return runCode.slice(at, next === -1 ? undefined : next)
}

// ── Bind is wired exactly once, after every existing gate ────────────────────

describe('bind is wired — exactly once, in the right place', () => {
  it('createWorkflowActionRun calls the bind admission exactly once', () => {
    const body = fnBody('createWorkflowActionRun')
    expect(body.match(/admitAutonomyAtBind\(/g)).toHaveLength(1)
    expect(runCode.match(/admitAutonomyAtBind\(/g)).toHaveLength(1)
  })

  it('the veto sits AFTER the last existing gate and BEFORE identity and the write', () => {
    const body = fnBody('createWorkflowActionRun')
    const veto = body.indexOf('admitAutonomyAtBind(')
    for (const earlier of ['lookupAction(input.actionKind)', 'readInstance(db, input.instanceId)',
      "refusal: 'project_paused'", "refusal: 'state_not_in_definition'",
      'assertWorkflowAuthorizationValid(', "refusal: 'target_hash_mismatch'",
      "refusal: 'evidence_not_satisfied'", "refusal: 'spend_enforcement_required'",
      "refusal: 'financial_execution_disabled'"]) {
      const at = body.indexOf(earlier)
      expect(at, `${earlier} must exist`).toBeGreaterThan(-1)
      expect(at, `${earlier} must precede the autonomy veto`).toBeLessThan(veto)
    }
    expect(veto).toBeLessThan(body.indexOf('computeActionIdempotencyKey('))
    expect(veto).toBeLessThan(body.indexOf("db.rpc('bind_workflow_action_run'"))
  })

  it('the run is written ONLY through the atomic bind RPC — no bare runs insert', () => {
    expect(runCode).not.toMatch(/from\('runs'\)\s*\.insert/)
    expect(runCode.match(/db\.rpc\('bind_workflow_action_run'/g)).toHaveLength(1)
  })

  it('no other production file names the atomic bind RPC', () => {
    const naming = SOURCE.filter(f => f.code.includes('bind_workflow_action_run')).map(f => f.rel)
    // The generated type surface may DECLARE it once the function exists in
    // production; it never calls it.
    expect(naming.filter(f => f !== 'lib/supabase/database.types.ts'))
      .toEqual(['lib/workflows/action-run.ts'])
  })

  it('no production file outside the bind seam inserts a workflow-bound run', () => {
    // A bound run without bind provenance must not be expressible in code.
    const offenders = SOURCE
      .filter(f => /from\('runs'\)[\s\S]{0,400}?\.insert\([\s\S]{0,800}?workflow_instance_id/.test(f.code))
      .map(f => f.rel)
    expect(offenders).toEqual([])
  })
})

// ── Everything else stays UNWIRED ────────────────────────────────────────────

describe('readiness, pre_dispatch, scheduler, executor and providers stay unwired', () => {
  it('readiness (assertWorkflowActionReady) consults no autonomy', () => {
    const body = fnBody('assertWorkflowActionReady')
    expect(body).not.toMatch(/admitAutonomy|autonomy-runtime|resolveAutonomyLicense|readPlatformSurvivalCeiling|record_run_autonomy_decision/)
  })

  it('pre_dispatch (assertWorkflowActionStillAuthorized) consults no autonomy', () => {
    const body = fnBody('assertWorkflowActionStillAuthorized')
    expect(body).not.toMatch(/admitAutonomy|autonomy-runtime|resolveAutonomyLicense|readPlatformSurvivalCeiling|record_run_autonomy_decision/)
  })

  it('no execution-path file other than the bind seam reaches autonomy at all', () => {
    const ROOTS = ['lib/workflows/', 'lib/cost/', 'lib/media/', 'lib/os/', 'lib/governance/',
                   'lib/ai/', 'app/api/']
    const offenders = SOURCE
      .filter(f => ROOTS.some(r => f.rel.startsWith(r)))
      .filter(f => f.rel !== 'lib/workflows/action-run.ts')
      .filter(f => /autonomy-runtime|autonomy-license|admitAutonomy|record_run_autonomy_decision|run_autonomy_decisions/.test(f.code))
      .map(f => f.rel)
    expect(offenders).toEqual([])
  })

  it('the named later-phase roots are untouched', () => {
    for (const p of ['lib/workflows/action-executor.ts', 'lib/workflows/action-scheduling.ts',
                     'lib/workflows/effect/effect-execution.ts', 'app/api/runs/drain/route.ts',
                     'lib/governance/run-execution-checkpoint.ts']) {
      expect(codeOnly(read(p)), p).not.toMatch(/autonomy|bind_workflow_action_run/i)
    }
  })

  it('nothing records a claimed-boundary autonomy decision yet', () => {
    const callers = SOURCE.filter(f => f.code.includes('record_run_autonomy_decision')).map(f => f.rel)
    expect(callers.filter(f => f !== 'lib/supabase/database.types.ts')).toEqual([])
  })
})

// ── The bind admission module itself ─────────────────────────────────────────

describe('bind.ts composes canonical systems and writes nothing', () => {
  const src = read('lib/atlas/autonomy-runtime/bind.ts')
  const code = codeOnly(src)

  it('imports exactly the canonical sources and nothing else', () => {
    const specs = [...code.matchAll(/from '([^']+)'/g)].map(m => m[1]).sort()
    // NO licence resolver, NO Survival reader, NO Decision Ledger: licensed kinds
    // fail closed at bind, so no mutable authority input is ever read here.
    expect(specs).toEqual(['./admission', './policy'])
    expect(code).toMatch(/^import 'server-only'/m)
  })

  it('has no write path, no client, no env, no clock and no level table of its own', () => {
    expect(code).not.toMatch(/\.rpc\(|\.insert\(|\.update\(|createAdminClient|createClient/)
    expect(code).not.toMatch(/process\.env|Date\.now|new Date\(/)
    expect(code).not.toMatch(/'L[1-6]'/)       // no hand-written levels: they come from the core
    expect(code).not.toMatch(/action_class|actionClass|READ_ONLY|FINANCIAL/) // no class→level mapping
  })

  it('never asks for a caller-supplied level, licence, ceiling or clock', () => {
    expect(code).toMatch(/export async function admitAutonomyAtBind\(\s*actionKind: string, workflowInstanceId: string,\s*\)/)
  })
})

// ── The migration ────────────────────────────────────────────────────────────

describe('the atomic bind migration', () => {
  it('is the only BIND migration after Phase 3B1A (M0, 3B1B2 M1 and M2 are the reviewed successors)', () => {
    const files = readdirSync(join(APP, MIGRATION_DIR)).filter(f => f.endsWith('.sql')).sort()
    expect(files.slice(files.indexOf(TRACE_MIGRATION) + 1))
      .toEqual([BIND_MIGRATION, '20261001160000_m0_durable_spend_settlement.sql', '20261002140000_autonomy_authority_serialization.sql',
        '20261002190000_survival_input_epoch.sql'])
    // M0 is spend accounting only: it must not touch the bind surface or the trace.
    const m0 = read(`${MIGRATION_DIR}/20261001160000_m0_durable_spend_settlement.sql`)
    expect(m0).not.toMatch(/bind_workflow_action_run|run_autonomy_decisions|autonomy_license/)
    // 3B1B2 M1 adds serialization primitives (decision head, licence-writer
    // instance lock) and must not touch the bind surface, the run or the trace.
    const m1 = read(`${MIGRATION_DIR}/20261002140000_autonomy_authority_serialization.sql`).replace(/--[^\n]*/g, '')
    expect(m1).not.toMatch(/bind_workflow_action_run|run_autonomy_decisions|public\.runs\b/)
    // 3B1B2 M2 adds the Survival input epoch and must not touch the bind surface, the run,
    // the trace, the licence or the Decision Ledger.
    const m2 = read(`${MIGRATION_DIR}/20261002190000_survival_input_epoch.sql`).replace(/--[^\n]*/g, '')
    expect(m2).not.toMatch(/bind_workflow_action_run|run_autonomy_decisions|public\.runs\b|autonomy_license|atlas_decision/)
  })

  it('the EFFECTIVE bind surface is the last definition in apply order, and every definition is closed', () => {
    // Today exactly one migration defines it. A future reviewed change adds a
    // FORWARD migration; this guard then judges that one (and requires it to
    // carry the same closed snapshot markers), never the applied 3B1B file.
    expect(BIND_WRITER_MIGRATIONS[0]).toBe(BIND_MIGRATION)
    expect(EFFECTIVE_BIND_MIGRATION).toBe(BIND_WRITER_MIGRATIONS[BIND_WRITER_MIGRATIONS.length - 1])
    for (const f of BIND_WRITER_MIGRATIONS) {
      const text = read(`${MIGRATION_DIR}/${f}`)
      const code = text.replace(/--.*$/gm, '')
      expect(code.split(BIND_WRITER_DEF).length - 1, `${f}: exactly one definition`).toBe(1)
      expect(text.split('-- bind-exempt-placements:begin').length - 1, `${f}: one snapshot`).toBe(1)
      expect(text.split('-- bind-exempt-placements:end').length - 1, `${f}: one snapshot`).toBe(1)
    }
  })

  it('3B1B is immutable once applied: its bytes are pinned (line endings normalized)', () => {
    // Pinned at the reviewed content. After the production apply this file is
    // history: any change to the bind surface or the provenance trigger must be
    // a FORWARD migration, and this hash must never move again.
    const bytes = bindMigrationSql.replace(/\r\n/g, '\n')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(BIND_MIGRATION_SHA256)
  })

  it('only the 3B1A writer and the bind writer(s) ever INSERT into the provenance ledger', () => {
    const writers = ALL_MIGRATIONS.filter(f =>
      /insert into public\.run_autonomy_decisions/.test(read(`${MIGRATION_DIR}/${f}`).replace(/--.*$/gm, '')))
    expect(writers.sort()).toEqual([TRACE_MIGRATION, ...BIND_WRITER_MIGRATIONS].sort())
  })

  it('the bind-provenance constraint trigger is DEFERRED, INSERT-only, bound-runs-only, and nobody may weaken it', () => {
    expect(bindMigrationCode).toMatch(/create constraint trigger runs_require_bind_provenance_trg\s+after insert on public\.runs\s+deferrable initially deferred\s+for each row\s+when \(new\.workflow_instance_id is not null\)\s+execute function public\.runs_require_bind_provenance\(\);/)
    const fn = bindMigrationCode.slice(bindMigrationCode.indexOf('function public.runs_require_bind_provenance()'))
    expect(fn).toMatch(/security definer\s*\n\s*set search_path = ''/)
    expect(fn).toMatch(/where d\.run_id = new\.id and d\.boundary = 'bind'/)
    expect(bindMigrationCode).toMatch(/revoke all on function public\.runs_require_bind_provenance\(\)\s+from public, anon, authenticated, service_role;/)
    expect(bindMigrationCode).not.toMatch(/grant [^;]*runs_require_bind_provenance/i)
    // No other migration may drop, disable or replace it.
    for (const f of ALL_MIGRATIONS.filter(x => x !== BIND_MIGRATION)) {
      expect(read(`${MIGRATION_DIR}/${f}`).replace(/--.*$/gm, ''), f).not.toMatch(/runs_require_bind_provenance/)
    }
  })

  it('does NOT touch the 3B1A generic writer — it still refuses bind', () => {
    expect(bindSqlCode).not.toMatch(/record_run_autonomy_decision/)
    const trace = read(`${MIGRATION_DIR}/${TRACE_MIGRATION}`)
    expect(trace).toMatch(/if p_boundary is null or p_boundary not in \('readiness', 'pre_dispatch'\)/)
  })

  it('3B1A is byte-identical to its merged form (line endings normalized)', () => {
    const bytes = read(`${MIGRATION_DIR}/${TRACE_MIGRATION}`).replace(/\r\n/g, '\n')
    expect(createHash('sha256').update(bytes).digest('hex'))
      // sha256 of the blob merged in 29c88f0 (`git show 29c88f0:<path> | sha256sum`).
      .toBe('a7ecff5bf6593e38d4585ef6fb767b3032b2986171d951dfe7252a6584eb3a17')
  })

  it('is SECURITY DEFINER with an empty search_path, executable by service_role only', () => {
    expect(bindSqlCode).toMatch(/create or replace function public\.bind_workflow_action_run\(/)
    expect(bindSqlCode).toMatch(/security definer\s*\n\s*set search_path = ''/)
    expect(bindSqlCode).toMatch(/\) from public, anon, authenticated, service_role;/)
    expect(bindSqlCode).toMatch(/\) to service_role;/)
    expect(bindSqlCode).not.toMatch(/grant[^;]*\bto\s+(public|anon|authenticated)\b/i)
    expect(bindSqlCode).not.toMatch(/create policy/i)
    // No grant of any table privilege: the RPC is the only new write path.
    expect(bindSqlCode).not.toMatch(/grant (insert|update|delete|select|all) on/i)
  })

  it('accepts NO caller classification: identity parameters only', () => {
    const params = [...bindSqlCode.slice(
      bindSqlCode.indexOf('bind_workflow_action_run('), bindSqlCode.indexOf('returns table'))
      .matchAll(/\b(p_[a-z_]+)\s+(uuid|text|integer|bigint|timestamptz)/g)].map(m => m[1])
    expect(params).toEqual([...BIND_RPC_PARAMS])
    expect(params.filter(p => /class|attempt|authorization|policy|reason|level|mode/.test(p)
      && p !== 'p_attempt_group')).toEqual([])
    // Licensed binds have no representation at all.
    expect(bindSqlCode).not.toMatch(/'licensed'|'allowed'/)
  })

  it('writes FIXED READ_ONLY run values equal to ACTION_CLASS_POLICY.READ_ONLY', () => {
    const p = ACTION_CLASS_POLICY.READ_ONLY
    expect(p.requiresAuthorization).toBe(false)
    const values = bindSqlCode.slice(bindSqlCode.indexOf('insert into public.runs'),
      bindSqlCode.indexOf('returning id into v_run_id'))
    expect(values).toMatch(new RegExp(`'\\{\\}', '\\{\\}',\\s+${p.maxAttempts}, '${policyClassForActionClass('READ_ONLY')}',`))
    expect(values).toMatch(/p_action_kind, 'READ_ONLY', p_target_version_hash, null,/)
    // Subject columns come from the INSTANCE row, never the caller.
    expect(values).toMatch(/v_inst\.id, v_inst\.def_hash, v_inst\.current_state,/)
  })

  it('writes FIXED exempt provenance — never a caller value', () => {
    expect(bindSqlCode).toMatch(/v_run_id, 'bind', null, 'license_exempt_observation', 'canonical_read_only_observation',\s+'exempt_observation', 'L0'/)
  })

  it('the SQL exempt placement snapshot is SET-EQUAL to LICENCE_EXEMPT_OBSERVATION_KINDS × ACTION_REGISTRY placements', () => {
    const block = bindSql.slice(bindSql.indexOf('-- bind-exempt-placements:begin'),
      bindSql.indexOf('-- bind-exempt-placements:end'))
    const sqlSet = [...block.matchAll(/\('([a-z_]+)',\s*'([a-z0-9.-]+)',\s*'([a-z_]+)'\)/g)]
      .map(m => `${m[1]}|${m[2]}|${m[3]}`)
    const tsSet = LICENCE_EXEMPT_OBSERVATION_KINDS.flatMap(k =>
      ACTION_REGISTRY[k].placements.map(p => `${k}|${p.def_key}|${p.state}`))
    expect(new Set(sqlSet).size, 'no duplicate rows').toBe(sqlSet.length)
    expect([...sqlSet].sort(), 'SQL may not be wider OR narrower than the reviewed TS set').toEqual([...tsSet].sort())
    // Every kind in it is canonically READ_ONLY and exempt — the snapshot never
    // admits a kind merely because of its class.
    for (const k of new Set(sqlSet.map(r => r.split('|')[0]))) {
      expect(ACTION_REGISTRY[k as keyof typeof ACTION_REGISTRY]?.action_class, k).toBe('READ_ONLY')
      expect(AUTONOMY_RUNTIME_POLICY[k as keyof typeof AUTONOMY_RUNTIME_POLICY]?.mode, k).toBe('license_exempt_observation')
    }
  })

  it('a future READ_ONLY kind does NOT become bindable by being READ_ONLY', () => {
    // There is no class predicate anywhere in the function: membership is the
    // literal snapshot, checked against the instance's own definition/state.
    expect(bindSqlCode).not.toMatch(/action_class\s*(=|is not distinct from|in)\s*\(?'READ_ONLY'/)
    expect(bindSqlCode).toMatch(/\(p_action_kind, v_inst\.def_key, v_inst\.current_state\) not in \(/)
    const readOnlyNotExempt = Object.entries(ACTION_REGISTRY)
      .filter(([k, m]) => m.action_class === 'READ_ONLY'
        && !(LICENCE_EXEMPT_OBSERVATION_KINDS as readonly string[]).includes(k)).map(([k]) => k)
    for (const k of readOnlyNotExempt) expect(bindSql, k).not.toContain(`'${k}'`)
  })

  it('writes the run and its bind provenance in ONE function body, run first', () => {
    const runAt = bindSqlCode.indexOf('insert into public.runs')
    const traceAt = bindSqlCode.indexOf('insert into public.run_autonomy_decisions')
    expect(runAt).toBeGreaterThan(-1)
    expect(traceAt).toBeGreaterThan(runAt)
    // The boundary and claim are fixed by the function, never a parameter.
    expect(bindSqlCode).not.toMatch(/p_boundary|p_claim_id/)
    expect(bindSqlCode).toMatch(/v_run_id, 'bind', null,/)
  })

  it('proves subject identity before writing', () => {
    expect(bindSqlCode).toMatch(/v_inst\.project_id is distinct from p_project_id/)
    expect(bindSqlCode).toMatch(/v_inst\.def_hash is distinct from p_workflow_def_hash/)
    expect(bindSqlCode).toMatch(/v_inst\.current_state is distinct from p_workflow_from_state/)
  })

  it('takes NO licence, Survival or level-composition input — nothing mutable can narrow before commit', () => {
    const params = bindSqlCode.slice(
      bindSqlCode.indexOf('bind_workflow_action_run('), bindSqlCode.indexOf('returns table'))
    expect(params).not.toMatch(/license|survival|effective|bounded|watermark|decision/i)
    // …and the bind row it writes is bare: only the exemption itself.
    expect(bindSqlCode).toMatch(
      /run_id, boundary, claim_id, policy_mode, policy_reason, reason, required_level\s*\)/)
  })

  it('bind is exactly-once per run; readiness/pre_dispatch keep repeated observations', () => {
    expect(bindMigrationCode).toMatch(/create unique index if not exists run_autonomy_decisions_one_bind_per_run\s+on public\.run_autonomy_decisions \(run_id\)\s+where boundary = 'bind';/)
    expect(bindMigrationCode).not.toMatch(/unique[^;]*\(run_id, boundary\)/)
  })

  it('creates no rollout flag', () => {
    const flag = ['H1', 'AUTONOMY', 'GATE'].join('_')
    expect(bindSql).not.toContain(flag)
    for (const f of SOURCE) expect(f.code, f.rel).not.toContain(flag)
  })
})
