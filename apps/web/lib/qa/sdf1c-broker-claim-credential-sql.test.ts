/** SDF-1C1B claim-credential invariants against a per-process throwaway PostgreSQL database (real PostgreSQL, no mocks). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { issueBrokerClaimCredential } from '@/lib/atlas/code-work/claim-credential/claim-credential'
import { promisify } from 'node:util'
import type { WorkPackage } from '@/lib/atlas/workpackage/types'
import { codeWorkCommandRegistryHash, COMMAND_REGISTRY_VERSION } from '@/lib/atlas/code-work/command-registry'
import { deriveCodeWorkProposal } from '@/lib/atlas/code-work/control-plane/derive-admission'
import { codeWorkRepositoryResource } from '@/lib/atlas/code-work/control-plane/work-package'
import { canTransitionCodeWork, CODE_WORK_NON_TERMINAL_STATES, CODE_WORK_TERMINAL_STATES } from '@/lib/atlas/code-work/lifecycle'
import { OMNIRA_REPOSITORY_ID } from '@/lib/atlas/code-work/repository-registry'
import {
  CODE_WORK_ADMISSION_SCHEMA, CODE_WORK_ADMISSION_VERSION,
  CODE_WORK_AUTHORIZATION_ACTION_KIND, CODE_WORK_AUTHORIZATION_TARGET_TYPE,
  CODE_WORK_BASELINE_RECEIPT_CLASSES, CODE_WORK_CAPABILITY_ID,
  CODE_WORK_CAPABILITY_VERSION, CODE_WORK_OUTPUT_PROTOCOL, CODE_WORK_STOP_CONDITIONS,
  CODE_WORK_WORKER_ADAPTER_ID, CODE_WORK_WORKER_ADAPTER_VERSION,
  CODE_WORK_WORKTREE_POLICY_ID, SDF1_LIMITS,
} from '@/lib/atlas/code-work/types'
import type { CodeWorkAdmissionV1 } from '@/lib/atlas/code-work/types'

function findPsql(): string | null {
  for (const candidate of [process.env.ATLAS_SQL_TEST_PSQL, 'psql', '/opt/homebrew/bin/psql', '/opt/homebrew/opt/libpq/bin/psql'].filter(Boolean) as string[]) {
    try { execFileSync(candidate, ['--version'], { stdio: 'pipe' }); return candidate } catch { /* next */ }
  }
  return null
}
const PSQL = findPsql()
const ADMIN_URL = process.env.ATLAS_SQL_TEST_URL ?? `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`
const dsnFor = (db: string) => { const url = new URL(ADMIN_URL); url.pathname = `/${db}`; return url.toString() }
const AVAILABLE = (() => {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true } catch { return false }
})()
const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'
if (!AVAILABLE && !SQL_REQUIRED) console.warn('[sdf1c1b-sql] SKIPPED — no local Postgres; set ATLAS_SQL_TEST_URL')
const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const DB = `omnira_sdf1c1b_${suffix}`
const SVC = `omnira_sdf1c1b_svc_${suffix}`
let dsn = ''
const run = (target: string, args: string[]) => execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', target, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90_000 })
const one = (sql: string) => execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', sql], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90_000 }).trim()
const txn = (sql: string, role: string | null = SVC) => {
  const setRole = role ? `set local role "${role}";` : ''
  try { return { ok: true, out: one(`begin; ${setRole} ${sql}; rollback;`), err: '' } }
  catch (error) { return { ok: false, out: '', err: String((error as { stderr?: Buffer }).stderr ?? error) } }
}
const q = (value: string) => `'${value.replaceAll("'", "''")}'`
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`
  return JSON.stringify(value ?? null)
}
const rpc = (sql: string) => one(`set role "${SVC}"; ${sql}; reset role`)
const asyncExec = promisify(execFile)
const concurrently = async (a: string, b: string) => Promise.allSettled([a, b].map(sql =>
  asyncExec(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', `set role "${SVC}"; ${sql}`], { encoding: 'utf8', timeout: 90_000 })))

const PROJECT = '20000000-0000-4000-8000-000000000001'
const OTHER_PROJECT = '20000000-0000-4000-8000-000000000002'
const REQUESTER = '10000000-0000-4000-8000-000000000001'
const ROLE = '70000000-0000-4000-8000-000000000001'
const MISSION = '40000000-0000-4000-8000-000000000001'
const ENVELOPE = '50000000-0000-4000-8000-000000000001'
const PACKAGE = '60000000-0000-4000-8000-000000000001'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
// SDF-1C1B: a claim now requires the SHA-256 of a claim credential (the raw token never reaches SQL).
const CLAIM_HASH = 'c'.repeat(64)
let counter = 0
const uuid = (prefix: string) => `${prefix}0000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`

function admission(workId: string): CodeWorkAdmissionV1 {
  return {
    schema: CODE_WORK_ADMISSION_SCHEMA, version: CODE_WORK_ADMISSION_VERSION, workId, projectId: PROJECT,
    governance: {
      mission: { id: MISSION, version: 1, hash: HASH_A },
      authorizationTarget: { targetType: CODE_WORK_AUTHORIZATION_TARGET_TYPE, targetId: workId, actionKind: CODE_WORK_AUTHORIZATION_ACTION_KIND },
      delegation: { envelopeId: ENVELOPE, hash: HASH_B }, workPackage: { id: PACKAGE, hash: HASH_A },
    },
    repository: {
      repositoryId: OMNIRA_REPOSITORY_ID, owner: 'Bumbi190', name: 'ai-operating-platform',
      expectedRemote: { provider: 'github', host: 'github.com', owner: 'bumbi190', name: 'ai-operating-platform' },
      pinnedBaseSha: 'a2751fb3e65a138f460a2a4acf4149a5f1d501f1', approvedRemote: 'origin', approvedBaseRef: 'refs/remotes/origin/main',
    },
    worktree: { branchPrefix: 'sdf1/', policyId: CODE_WORK_WORKTREE_POLICY_ID },
    worker: {
      capabilityId: CODE_WORK_CAPABILITY_ID, capabilityVersion: CODE_WORK_CAPABILITY_VERSION,
      adapterId: CODE_WORK_WORKER_ADAPTER_ID, adapterVersion: CODE_WORK_WORKER_ADAPTER_VERSION,
      provider: 'anthropic', modelId: 'claude-sonnet-4-6', outputProtocol: CODE_WORK_OUTPUT_PROTOCOL,
    },
    files: { readScopes: ['apps/web/lib'], writeScopes: ['apps/web/lib/atlas/code-work/control-plane'], deniedScopes: [], permissions: { create: true, update: true, delete: false, rename: false } },
    commands: { approvedCommandIds: ['sdf1.proof.fixture_test', 'sdf1.proof.typecheck'], registryVersion: COMMAND_REGISTRY_VERSION, registryHash: codeWorkCommandRegistryHash() },
    limits: { ...SDF1_LIMITS }, isolation: { network: 'denied', secrets: 'none' },
    evidence: { requiredReceiptClasses: [...CODE_WORK_BASELINE_RECEIPT_CLASSES] }, stopConditions: [...CODE_WORK_STOP_CONDITIONS],
  }
}

const pkg: WorkPackage = {
  workPackageId: PACKAGE, envelopeId: ENVELOPE, delegationBoundHash: HASH_B,
  missionId: MISSION, missionVersion: 1, missionBoundHash: HASH_A, projectId: PROJECT,
  assignedRole: { roleId: ROLE, role: 'developer' } as never,
  taskObjective: 'Bounded control plane', inputs: [], expectedOutput: [],
  authority: [{ action: CODE_WORK_AUTHORIZATION_ACTION_KIND }], allowedActions: [{ action: CODE_WORK_AUTHORIZATION_ACTION_KIND }], forbiddenActions: [],
  constraints: [], tools: [{ tool: CODE_WORK_CAPABILITY_ID }],
  dataScope: [
    { resource: codeWorkRepositoryResource(OMNIRA_REPOSITORY_ID, 'apps/web/lib'), access: 'read' },
    { resource: codeWorkRepositoryResource(OMNIRA_REPOSITORY_ID, 'apps/web/lib/atlas/code-work'), access: 'write' },
  ], budget: null, deadline: null, reporting: [], escalationTriggers: [], stopConditions: [], approvalGates: [],
  inScope: [], outOfScope: [], dependencies: [], fallback: null, packageVersion: 1, packageHash: HASH_A,
} as WorkPackage

interface Created {
  workId: string
  authorizationId: string
  admissionHash: string
  admissionJson: string
  proposalKeyHash: string
  proposalFingerprintHash: string
}
function createProposal(options: { grant?: 'granted' | 'granted_with_conditions' | 'denied'; sync?: boolean; expiresIn?: string } = {}): Created {
  const workId = uuid('3')
  const authorizationId = uuid('8')
  const eventId = uuid('9')
  const derived = deriveCodeWorkProposal({ admission: admission(workId), workPackage: pkg, requestedBy: REQUESTER, idempotencyKey: `proposal-${workId}` })
  if (!derived.ok) throw new Error(derived.violations.map(v => v.code).join(','))
  const v = derived.value
  expect(JSON.parse(one(`select public.atlas_code_work_normalized_admission(${q(JSON.stringify(v.admission))}::jsonb)::text`)))
    .toEqual(v.admission)
  expect(one(`select public.atlas_code_work_canonical_json(public.atlas_code_work_normalized_admission(${q(JSON.stringify(v.admission))}::jsonb))`))
    .toBe(canonical(v.admission))
  expect(one(`select public.atlas_code_work_admission_hash(${q(JSON.stringify(v.admission))}::jsonb)`))
    .toBe(v.admissionHash)
  const state = rpc(`select (public.atlas_code_work_propose(${q(workId)}::uuid,${q(PROJECT)}::uuid,${q(REQUESTER)}::uuid,${q(v.proposalKeyHash)},${q(v.proposalFingerprintHash)},${q(JSON.stringify(v.admission))}::jsonb,${q(v.admissionHash)},${q(authorizationId)}::uuid,${q(eventId)}::uuid)).state`)
  expect(state).toBe('proposed')
  if (options.grant) {
    const conditions = options.grant === 'granted_with_conditions' ? '[{"conditionId":"c","type":"manual","value":"review","description":"not enforced"}]' : '[]'
    const expires = options.grant === 'denied' ? 'null' : `clock_timestamp()+interval '${options.expiresIn ?? '1 hour'}'`
    one(`insert into public.atlas_authorizations(event_id,authorization_id,event_type,occurred_at,project_id,principal_id,authority_basis,action_kind,target_type,target_id,target_version_hash,conditions,evidence,expires_at)
      values(${q(uuid('9'))}::uuid,${q(authorizationId)}::uuid,${q(options.grant)},clock_timestamp(),${q(PROJECT)}::uuid,${q(REQUESTER)}::uuid,'founder_owner','code.worktree.prepare_and_patch','atlas.code_work_admission',${q(workId)},${q(v.admissionHash)},${q(conditions)}::jsonb,'[]'::jsonb,${expires})`)
    if (options.sync !== false) rpc(`select (public.atlas_code_work_sync_authorization(${q(workId)}::uuid)).state`)
  }
  return {
    workId,
    authorizationId,
    admissionHash: v.admissionHash,
    admissionJson: JSON.stringify(v.admission),
    proposalKeyHash: v.proposalKeyHash,
    proposalFingerprintHash: v.proposalFingerprintHash,
  }
}

// The raw token is generated server-side (here by the same helper the control plane uses); ONLY its hash reaches SQL.
interface Claimed extends Created { claimId: string; fence: number; token: string; tokenHash: string }
function claimSql(workId: string, tokenHash: string, broker = 'fixture-broker', host = 'fixture-host') {
  return `select (public.atlas_code_work_claim(${q(workId)}::uuid,${q(broker)},${q(host)},${q(tokenHash)})).state`
}
const runCol = (workId: string, column: string) => one(`select ${column} from public.atlas_code_work_runs where work_id=${q(workId)}::uuid`)
function claim(created: Created): Claimed {
  const credential = issueBrokerClaimCredential(created.workId)
  expect(rpc(claimSql(created.workId, credential.tokenHash))).toBe('claimed')
  return { ...created, claimId: runCol(created.workId, 'claim_id'), fence: Number(runCol(created.workId, 'fence')), token: credential.token, tokenHash: credential.tokenHash }
}
function grantAndClaim(options: { expiresIn?: string } = {}): Claimed {
  const created = createProposal({ grant: 'granted', ...options })
  expect(runCol(created.workId, 'state')).toBe('authorized')
  return claim(created)
}

function appendEvidence(created: Claimed, receiptClass: string, payload: Record<string, unknown>) {
  const sequence = Number(one(`select last_receipt_sequence+1 from public.atlas_code_work_runs where work_id=${q(created.workId)}::uuid`))
  const previous = one(`select coalesce(quote_literal(receipt_chain_head),'null') from public.atlas_code_work_runs where work_id=${q(created.workId)}::uuid`)
  rpc(`select (public.atlas_code_work_append_evidence(${q(created.workId)}::uuid,${q(created.admissionHash)},${q(created.claimId)}::uuid,${created.fence},${sequence},${previous},${q(receiptClass)},${q(JSON.stringify(payload))}::jsonb,clock_timestamp(),'worker','fixture-worker')).state`)
}

beforeAll(() => {
  if (!AVAILABLE) return
  run(ADMIN_URL, ['-c', `
    do $roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end
    $roles$;
  `])
  run(ADMIN_URL, ['-c', `create database "${DB}"`])
  dsn = dsnFor(DB)
  run(dsn, ['-c', `
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    -- Supabase's default: new public functions are executable by the client roles. The migration must close that for the new claim.
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    create table public.projects(id uuid primary key);
    create table public.agents(id uuid primary key);
    create table public.manager_tasks(id uuid primary key default gen_random_uuid(),project_id uuid references public.projects(id),title text not null default '',description text,status text not null default 'pending',source text,source_key text,created_at timestamptz default now());
    insert into public.projects values('${PROJECT}'),('${OTHER_PROJECT}');
    insert into public.agents values('${ROLE}');
  `])
  run(dsn, ['--single-transaction', '-f', join(process.cwd(), 'supabase/migrations/20260819_atlas_authorizations.sql')])
  run(dsn, ['--single-transaction', '-f', join(process.cwd(), 'supabase/migrations/20260820_manager_tasks_work_packages.sql')])
  run(dsn, ['-c', `insert into public.manager_tasks(project_id,title,source,source_key,work_package_id,work_package,work_package_hash,delegation_envelope_id,delegation_bound_hash,mission_id,mission_version,mission_bound_hash,workforce_role_id,assigned_at)
    values('${PROJECT}','SDF-1B1','work_package','${PACKAGE}','${PACKAGE}',${q(JSON.stringify(pkg))}::jsonb,'${HASH_A}','${ENVELOPE}','${HASH_B}','${MISSION}',1,'${HASH_A}','${ROLE}',clock_timestamp())`])
  run(dsn, ['--single-transaction', '-f', join(process.cwd(), 'supabase/migrations/20260918095827_sdf1b1_code_work_control_plane.sql')])
  // Apply exactly the migration under test, on top of canonical SDF-1B1 history.
  run(dsn, ['--single-transaction', '-f', join(process.cwd(), 'supabase/migrations/20260924080000_sdf1c1b_broker_claim_credentials.sql')])
  // SDF-1C1B replaces the credential-less claim; the B1 suite exercises the schema as it now ships.
  run(ADMIN_URL, ['-c', `create role "${SVC}" nologin bypassrls in role service_role`])
}, 120_000)

afterAll(() => {
  if (!AVAILABLE) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB}" with (force)`]) } catch { /* best effort */ }
  try { run(ADMIN_URL, ['-c', `drop role if exists "${SVC}"`]) } catch { /* best effort */ }
})

const dumpRuns = () => one(`select coalesce(string_agg(to_jsonb(r)::text,'|'),'') from public.atlas_code_work_runs r`)
const dumpReceipts = () => one(`select coalesce(string_agg(to_jsonb(r)::text,'|'),'') from public.atlas_code_work_receipts r`)
const expireLease = (workId: string) => one(`begin; select set_config('omnira.code_work_control','on',true); update public.atlas_code_work_runs set lease_until=now()-interval '1 second',broker_token_expires_at=now()-interval '1 second' where work_id=${q(workId)}::uuid; commit`)
const tokenState = (workId: string) => one(`select coalesce(broker_token_hash,'∅')||'|'||coalesce(broker_token_expires_at::text,'∅')||'|'||coalesce(claim_id::text,'∅') from public.atlas_code_work_runs where work_id=${q(workId)}::uuid`)
const asOwner = (sql: string) => txn(`select set_config('omnira.code_work_control','on',true); ${sql}`, null)

d('SDF-1C1B credential shape and function surface', () => {
  it('1/18 replaces the dormant-only constraint and has no raw-token column anywhere', () => {
    expect(one(`select count(*) from pg_constraint where conname='atlas_code_work_runs_token_dormant_check'`)).toBe('0')
    expect(one(`select count(*) from pg_constraint where conname='atlas_code_work_runs_claim_credential_check'`)).toBe('1')
    expect(one(`select string_agg(table_name||'.'||column_name,',' order by table_name,column_name) from information_schema.columns where table_schema='public' and table_name like 'atlas_code_work_%' and column_name ~* 'token|secret|credential'`))
      .toBe('atlas_code_work_runs.broker_token_expires_at,atlas_code_work_runs.broker_token_hash')
    expect(one(`select count(*) from pg_tables where schemaname='public' and tablename like 'atlas_code_work_%'`)).toBe('2')
  })

  it('2/18 leaves exactly one atlas_code_work_claim, with the credential parameter, executable by service_role alone', () => {
    expect(one(`select string_agg(oid::regprocedure::text,',') from pg_proc where proname='atlas_code_work_claim' and pronamespace='public'::regnamespace`))
      .toBe('atlas_code_work_claim(uuid,text,text,text)')
    for (const role of ['anon', 'authenticated', 'public']) {
      expect(one(`select has_function_privilege('${role}','public.atlas_code_work_claim(uuid,text,text,text)','EXECUTE')`), role).toBe('f')
    }
    expect(one(`select has_function_privilege('service_role','public.atlas_code_work_claim(uuid,text,text,text)','EXECUTE')`)).toBe('t')
    expect(one(`select prosecdef::text||':'||proconfig[1] from pg_proc where proname='atlas_code_work_claim'`)).toBe('true:search_path=""')
    for (const role of ['anon', 'authenticated', 'public']) {
      expect(one(`select has_function_privilege('${role}','public.atlas_code_work_heartbeat(uuid,uuid,bigint)','EXECUTE')`), `heartbeat ${role}`).toBe('f')
    }
    expect(one(`select has_function_privilege('service_role','public.atlas_code_work_heartbeat(uuid,uuid,bigint)','EXECUTE')`)).toBe('t')
  })

  it('3/18 makes the old credential-less claim signature impossible to call', () => {
    const created = createProposal({ grant: 'granted' })
    const legacy = txn(`select public.atlas_code_work_claim('${created.workId}'::uuid,'broker','host')`)
    expect(legacy.ok).toBe(false)
    expect(legacy.err).toMatch(/function public\.atlas_code_work_claim\(uuid, unknown, unknown\) does not exist|does not exist/)
    expect(runCol(created.workId, 'state')).toBe('authorized')
    expect(runCol(created.workId, 'claim_id')).toBe('')
    expect(one(`select count(*) from pg_proc where proname='atlas_code_work_claim' and pronargs=3`)).toBe('0')
  })

  it('4/18 refuses a missing or malformed credential hash and creates no claim', () => {
    const created = createProposal({ grant: 'granted' })
    const before = one(`select count(*) from public.atlas_code_work_receipts where work_id='${created.workId}'`)
    for (const hash of ['null', "''", q('c'.repeat(63)), q('c'.repeat(65)), q('C'.repeat(64)), q('g'.repeat(64)), q(` ${'c'.repeat(63)}`)]) {
      const result = txn(`select public.atlas_code_work_claim('${created.workId}'::uuid,'broker','host',${hash === 'null' ? 'null::text' : hash})`)
      expect(result.ok, hash).toBe(false)
      expect(result.err, hash).toMatch(/broker claim credential hash invalid/)
    }
    expect(runCol(created.workId, 'state')).toBe('authorized')
    expect(tokenState(created.workId)).toBe('∅|∅|∅')
    expect(one(`select count(*) from public.atlas_code_work_receipts where work_id='${created.workId}'`)).toBe(before)
  })
})

d('SDF-1C1B credential-bearing claim', () => {
  it('5/18 claims with a hash: stores only the hash, expiry equals lease, fence and lease stay database-owned', () => {
    const created = createProposal({ grant: 'granted' })
    const claimed = claim(created)
    expect(runCol(created.workId, 'state')).toBe('claimed')
    expect(runCol(created.workId, 'fence')).toBe('1')
    expect(runCol(created.workId, 'broker_token_hash')).toBe(claimed.tokenHash)
    expect(one(`select broker_token_expires_at = lease_until from public.atlas_code_work_runs where work_id='${created.workId}'`)).toBe('t')
    expect(one(`select lease_until <= clock_timestamp() + interval '90 seconds' and lease_until > clock_timestamp() from public.atlas_code_work_runs where work_id='${created.workId}'`)).toBe('t')
    expect(runCol(created.workId, 'claim_id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(one(`select state_version from public.atlas_code_work_runs where work_id='${created.workId}'`)).toBe('2')
    expect(one(`select broker_id||'/'||broker_host_id from public.atlas_code_work_runs where work_id='${created.workId}'`)).toBe('fixture-broker/fixture-host')
  })

  it('6/18 never lets the raw token, or its hash, into a receipt or any other column', () => {
    const created = createProposal({ grant: 'granted' })
    const claimed = claim(created)
    expect(dumpRuns()).not.toContain(claimed.token)
    expect(dumpReceipts()).not.toContain(claimed.token)
    expect(dumpReceipts()).not.toContain(claimed.tokenHash)
    expect(dumpRuns().split(claimed.tokenHash).length - 1).toBe(1)
    expect(one(`select count(*) from pg_stat_activity where query ilike '%${claimed.token}%' and pid <> pg_backend_pid()`)).toBe('0')
  })

  it('7/18 records credentialIssued=true and only non-secret claim evidence in the claim receipt', () => {
    const claimed = grantAndClaim()
    expect(one(`select payload->>'credentialIssued' from public.atlas_code_work_receipts where work_id='${claimed.workId}' and event_type='claim_issued'`)).toBe('true')
    const keys = one(`select string_agg(k,',' order by k) from public.atlas_code_work_receipts r, jsonb_object_keys(r.payload) k where r.work_id='${claimed.workId}' and r.event_type='claim_issued'`)
    expect(keys).toBe('claimId,credentialIssued,fence,leaseUntil')
    expect(one(`select payload::text ~* 'token|hash|secret' from public.atlas_code_work_receipts where work_id='${claimed.workId}' and event_type='claim_issued'`)).toBe('f')
  })

  it('8/18 keeps one claim per run and serializes concurrent claimants to exactly one credential', async () => {
    const created = createProposal({ grant: 'granted' })
    const a = issueBrokerClaimCredential(created.workId), b = issueBrokerClaimCredential(created.workId)
    const results = await concurrently(claimSql(created.workId, a.tokenHash, 'broker-a', 'host-a'), claimSql(created.workId, b.tokenHash, 'broker-b', 'host-b'))
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    const stored = runCol(created.workId, 'broker_token_hash')
    expect([a.tokenHash, b.tokenHash]).toContain(stored)
    expect(txn(claimSql(created.workId, 'e'.repeat(64))).err).toMatch(/not claimable/)
    expect(runCol(created.workId, 'broker_token_hash')).toBe(stored)
  })

  it('9/18 still needs live Authorization V1: an expired authorization settles the run and issues no credential', () => {
    const created = createProposal({ grant: 'granted', expiresIn: '1 second' })
    one('select pg_sleep(1.6)')
    expect(rpc(claimSql(created.workId, 'a'.repeat(64)))).toBe('cancelled')
    expect(tokenState(created.workId)).toBe('∅|∅|∅')
    expect(one(`select terminal_reason_code from public.atlas_code_work_runs where work_id='${created.workId}'`)).toBe('authorization_ineffective')
    const proposed = createProposal()
    expect(txn(claimSql(proposed.workId, 'a'.repeat(64))).err).toMatch(/not claimable/)
    const denied = createProposal({ grant: 'denied' })
    expect(txn(claimSql(denied.workId, 'a'.repeat(64))).err).toMatch(/not claimable/)
  })

  it('10/18 refuses a cancelled run and settles a runtime-expired run without a credential', () => {
    const cancelled = createProposal({ grant: 'granted' })
    rpc(`select (public.atlas_code_work_cancel('${cancelled.workId}','${PROJECT}','${REQUESTER}','owner_cancel')).state`)
    expect(txn(claimSql(cancelled.workId, 'a'.repeat(64))).err).toMatch(/not claimable/)
    expect(tokenState(cancelled.workId)).toBe('∅|∅|∅')

    const expired = createProposal({ grant: 'granted' })
    one(`begin; alter table public.atlas_code_work_runs disable trigger atlas_code_work_runs_guard_update; update public.atlas_code_work_runs set created_at=created_at-interval '2 days' where work_id='${expired.workId}'; alter table public.atlas_code_work_runs enable trigger atlas_code_work_runs_guard_update; commit`)
    expect(rpc(claimSql(expired.workId, 'a'.repeat(64)))).toBe('timeout')
    expect(tokenState(expired.workId)).toBe('∅|∅|∅')
  })

  it('11/18 keeps fence semantics: claim fences at one and stale fences are rejected', () => {
    const claimed = grantAndClaim()
    expect(claimed.fence).toBe(1)
    expect(txn(`select public.atlas_code_work_heartbeat('${claimed.workId}','${claimed.claimId}',${claimed.fence + 1})`).err).toMatch(/stale code-work fence/)
    expect(txn(`select public.atlas_code_work_heartbeat('${claimed.workId}','${uuid('9')}',${claimed.fence})`).err).toMatch(/stale code-work fence/)
  })
})

d('SDF-1C1B lease-bound credential lifetime', () => {
  it('12/18 renews the token expiry to exactly the renewed lease without rotating the token', () => {
    const claimed = grantAndClaim()
    one(`begin; select set_config('omnira.code_work_control','on',true); update public.atlas_code_work_runs set lease_until=now()+interval '10 seconds',broker_token_expires_at=now()+interval '10 seconds' where work_id='${claimed.workId}'; commit`)
    const before = one(`select broker_token_expires_at from public.atlas_code_work_runs where work_id='${claimed.workId}'`)
    expect(rpc(`select (public.atlas_code_work_heartbeat('${claimed.workId}','${claimed.claimId}',${claimed.fence})).state`)).toBe('claimed')
    expect(one(`select broker_token_expires_at = lease_until from public.atlas_code_work_runs where work_id='${claimed.workId}'`)).toBe('t')
    expect(one(`select broker_token_expires_at > '${before}'::timestamptz from public.atlas_code_work_runs where work_id='${claimed.workId}'`)).toBe('t')
    expect(runCol(claimed.workId, 'broker_token_hash')).toBe(claimed.tokenHash)
    expect(runCol(claimed.workId, 'claim_id')).toBe(claimed.claimId)
    expect(dumpReceipts()).not.toContain(claimed.tokenHash)
  })

  it('13/18 bounds the token by the authorization and closes it, token cleared, when the lease lapses', () => {
    const claimed = grantAndClaim({ expiresIn: '3 seconds' })
    expect(one(`select broker_token_expires_at = lease_until and lease_until <= authorization_expires_at from public.atlas_code_work_runs where work_id='${claimed.workId}'`)).toBe('t')
    one('select pg_sleep(3.5)')
    const state = rpc(`select (public.atlas_code_work_heartbeat('${claimed.workId}','${claimed.claimId}',${claimed.fence})).state`)
    expect(['timeout', 'cancelled']).toContain(state)
    expect(tokenState(claimed.workId)).toBe('∅|∅|∅')
  })

  it('14/18 rejects an expired lease on heartbeat, closing the run and clearing the credential', () => {
    const claimed = grantAndClaim()
    expireLease(claimed.workId)
    expect(rpc(`select (public.atlas_code_work_heartbeat('${claimed.workId}','${claimed.claimId}',${claimed.fence})).state`)).toBe('timeout')
    expect(tokenState(claimed.workId)).toBe('∅|∅|∅')
    expect(runCol(claimed.workId, 'fence')).toBe(String(claimed.fence + 1))
    expect(txn(`select public.atlas_code_work_heartbeat('${claimed.workId}','${claimed.claimId}',${claimed.fence})`).err).toMatch(/stale code-work fence/)
  })

  it('15/18 keeps hash and lease-bound expiry through non-terminal transitions', () => {
    const claimed = grantAndClaim()
    rpc(`select (public.atlas_code_work_transition('${claimed.workId}','claimed',2,'preparing','${claimed.claimId}',${claimed.fence},null)).state`)
    expect(runCol(claimed.workId, 'broker_token_hash')).toBe(claimed.tokenHash)
    expect(one(`select broker_token_expires_at = lease_until from public.atlas_code_work_runs where work_id='${claimed.workId}'`)).toBe('t')
  })
})

d('SDF-1C1B credential destruction and invariants', () => {
  it('16/18 clears the credential, claim and lease on cancellation, and fences the old claim', () => {
    const claimed = grantAndClaim()
    expect(rpc(`select (public.atlas_code_work_cancel('${claimed.workId}','${PROJECT}','${REQUESTER}','owner_cancel')).state`)).toBe('cancelled')
    expect(tokenState(claimed.workId)).toBe('∅|∅|∅')
    expect(runCol(claimed.workId, 'fence')).toBe(String(claimed.fence + 1))
    expect(txn(`select public.atlas_code_work_heartbeat('${claimed.workId}','${claimed.claimId}',${claimed.fence})`).err).toMatch(/stale code-work fence|not heartbeat eligible/)
  })

  it('17/18 clears the credential when a claimed run reaches a terminal lifecycle state', () => {
    const active = grantAndClaim()
    rpc(`select (public.atlas_code_work_transition('${active.workId}','claimed',2,'preparing','${active.claimId}',${active.fence},null)).state`)
    rpc(`select (public.atlas_code_work_transition('${active.workId}','preparing',3,'working','${active.claimId}',${active.fence},null)).state`)
    rpc(`select (public.atlas_code_work_transition('${active.workId}','working',4,'testing','${active.claimId}',${active.fence},null)).state`)
    const base = admission(active.workId).repository.pinnedBaseSha
    const evidence = [
      ['repository_proof', { receiptClass: 'repository_proof', repositoryId: OMNIRA_REPOSITORY_ID, verified: true }],
      ['base_proof', { receiptClass: 'base_proof', pinnedBaseSha: base, observedRefSha: base, stale: false }],
      ['worker_identity', { receiptClass: 'worker_identity', adapterId: CODE_WORK_WORKER_ADAPTER_ID, adapterVersion: 1, provider: 'anthropic', modelId: 'claude-sonnet-4-6', outputProtocol: CODE_WORK_OUTPUT_PROTOCOL }],
      ['worktree_identity', { receiptClass: 'worktree_identity' }],
      ['file_scope', { receiptClass: 'file_scope', withinScope: true, deniedPaths: [] }],
      ['command', { receiptClass: 'command', commandId: 'sdf1.proof.fixture_test', exitCode: 0, timedOut: false }],
      ['test_result', { receiptClass: 'test_result', commandId: 'sdf1.proof.fixture_test', outcome: 'passed' }],
      ['command', { receiptClass: 'command', commandId: 'sdf1.proof.typecheck', exitCode: 0, timedOut: false }],
      ['test_result', { receiptClass: 'test_result', commandId: 'sdf1.proof.typecheck', outcome: 'passed' }],
      ['final_git_status', { receiptClass: 'final_git_status' }],
      ['final_diff', { receiptClass: 'final_diff', diffBytes: 0, changedPaths: [] }],
      ['terminal', { receiptClass: 'terminal', state: 'ready_for_human_review', iterationCount: 1 }],
    ] as const
    for (const [receiptClass, payload] of evidence) appendEvidence(active, receiptClass, payload)
    expect(runCol(active.workId, 'broker_token_hash')).toBe(active.tokenHash)
    expect(rpc(`select (public.atlas_code_work_transition('${active.workId}','testing',5,'ready_for_human_review','${active.claimId}',${active.fence},null)).state`)).toBe('ready_for_human_review')
    expect(tokenState(active.workId)).toBe('∅|∅|∅')
    expect(runCol(active.workId, 'fence')).toBe(String(active.fence + 1))
    expect(dumpReceipts()).not.toContain(active.tokenHash)
  })

  it('18/18 makes the database itself reject every impossible credential shape', () => {
    const idle = createProposal({ grant: 'granted' })
    const claimed = grantAndClaim()
    const reject = (sql: string) => { const r = asOwner(sql); expect(r.ok, sql).toBe(false); expect(r.err, sql).toMatch(/atlas_code_work_runs_claim_credential_check/) }
    // Token material without a claim.
    reject(`update public.atlas_code_work_runs set broker_token_hash='${'a'.repeat(64)}',broker_token_expires_at=now() where work_id='${idle.workId}'`)
    reject(`update public.atlas_code_work_runs set broker_token_hash='${'a'.repeat(64)}' where work_id='${idle.workId}'`)
    // A claim without token material.
    reject(`update public.atlas_code_work_runs set broker_token_hash=null where work_id='${claimed.workId}'`)
    reject(`update public.atlas_code_work_runs set broker_token_expires_at=null where work_id='${claimed.workId}'`)
    // Expiry independent of, or later than, the lease.
    reject(`update public.atlas_code_work_runs set broker_token_expires_at=lease_until+interval '1 second' where work_id='${claimed.workId}'`)
    reject(`update public.atlas_code_work_runs set broker_token_expires_at=lease_until-interval '1 second' where work_id='${claimed.workId}'`)
    // Malformed hashes.
    for (const hash of ['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'z'.repeat(64), '']) {
      reject(`update public.atlas_code_work_runs set broker_token_hash='${hash}' where work_id='${claimed.workId}'`)
    }
    // Direct writes still need the control-plane functions, and clients cannot write at all.
    expect(txn(`update public.atlas_code_work_runs set broker_token_hash='${'a'.repeat(64)}' where work_id='${claimed.workId}'`, null).err).toMatch(/only change through control-plane functions/)
    for (const role of ['anon', 'authenticated']) {
      expect(one(`select has_table_privilege('${role}','public.atlas_code_work_runs','SELECT')`)).toBe('f')
      expect(one(`select has_column_privilege('${role}','public.atlas_code_work_runs','broker_token_hash','SELECT')`)).toBe('f')
    }
    expect(one(`select has_table_privilege('service_role','public.atlas_code_work_runs','UPDATE')`)).toBe('f')
    expect(runCol(claimed.workId, 'broker_token_hash')).toBe(claimed.tokenHash)
  })
})
