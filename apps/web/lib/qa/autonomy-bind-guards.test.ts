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
const TRACE_MIGRATION = '20260925120000_autonomy_trace_decisions.sql'
const bindSql = read(`${MIGRATION_DIR}/${BIND_MIGRATION}`)
const bindSqlCode = bindSql.replace(/--.*$/gm, '')

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
    expect(specs).toEqual([
      './admission', './platform-survival', './policy',
      '@/lib/atlas/autonomy-license/resolve',
    ].sort())
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
  it('is the only migration after Phase 3B1A', () => {
    const files = readdirSync(join(APP, MIGRATION_DIR)).filter(f => f.endsWith('.sql')).sort()
    expect(files.slice(files.indexOf(TRACE_MIGRATION) + 1)).toEqual([BIND_MIGRATION])
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

  it('accepts ONLY the two permissive representations — a refusal has nothing to persist', () => {
    expect(bindSqlCode).toMatch(/p_policy_mode is not distinct from 'license_exempt_observation'\s+and p_reason is not distinct from 'exempt_observation'/)
    expect(bindSqlCode).toMatch(/p_policy_mode is not distinct from 'licensed'\s+and p_reason is not distinct from 'allowed'/)
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

  it('proves the licence under lock: FOR SHARE, watermark, head, subject, scope, expiry', () => {
    expect(bindSqlCode).toMatch(/where workflow_instance_id = p_workflow_instance_id\s+for share;/)
    expect(bindSqlCode).toMatch(/v_max_seq is distinct from p_license_watermark/)
    expect(bindSqlCode).toMatch(/v_head_gen is distinct from p_license_generation/)
    expect(bindSqlCode).toMatch(/v_licence\.project_id is distinct from v_inst\.project_id/)
    expect(bindSqlCode).toMatch(/v_licence\.workflow_instance_id is distinct from p_workflow_instance_id/)
    expect(bindSqlCode).toMatch(/v_licence\.bound_def_hash is distinct from v_inst\.def_hash/)
    expect(bindSqlCode).toMatch(/p_action_kind = any \(v_licence\.allowed_action_kinds\)/)
    expect(bindSqlCode).toMatch(/now\(\) >= v_expires/)
  })

  it('bind is exactly-once per run; readiness/pre_dispatch keep repeated observations', () => {
    expect(bindSqlCode).toMatch(/create unique index if not exists run_autonomy_decisions_one_bind_per_run\s+on public\.run_autonomy_decisions \(run_id\)\s+where boundary = 'bind';/)
    expect(bindSqlCode).not.toMatch(/unique[^;]*\(run_id, boundary\)/)
  })

  it('creates no rollout flag', () => {
    const flag = ['H1', 'AUTONOMY', 'GATE'].join('_')
    expect(bindSql).not.toContain(flag)
    for (const f of SOURCE) expect(f.code, f.rel).not.toContain(flag)
  })
})
