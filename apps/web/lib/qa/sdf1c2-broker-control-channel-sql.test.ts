/** SDF-1C2 broker control-channel database invariants against a per-process throwaway PostgreSQL database (real PostgreSQL, no mocks). */
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
if (!AVAILABLE && !SQL_REQUIRED) console.warn('[sdf1c2-sql] SKIPPED — no local Postgres; set ATLAS_SQL_TEST_URL')
const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const DB = `omnira_sdf1c2_${suffix}`
const SVC = `omnira_sdf1c2_svc_${suffix}`
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
  // SDF-1C2 makes heartbeat credential-bearing and adds same-broker claim recovery; these suites run against the schema as it ships.
  run(dsn, ['--single-transaction', '-f', join(process.cwd(), 'supabase/migrations/20260924140000_sdf1c2_broker_control_channel.sql')])
  // SDF-1C1B replaces the credential-less claim; the B1 suite exercises the schema as it now ships.
  run(ADMIN_URL, ['-c', `create role "${SVC}" nologin bypassrls in role service_role`])
}, 120_000)

afterAll(() => {
  if (!AVAILABLE) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB}" with (force)`]) } catch { /* best effort */ }
  try { run(ADMIN_URL, ['-c', `drop role if exists "${SVC}"`]) } catch { /* best effort */ }
})

const DEFAULT_BROKER = 'fixture-broker'
const DEFAULT_HOST = 'fixture-host'
const hb = (c: Claimed, o: { claimId?: string; fence?: number; broker?: string; host?: string; hash?: string } = {}) =>
  `public.atlas_code_work_heartbeat('${c.workId}','${o.claimId ?? c.claimId}',${o.fence ?? c.fence},'${o.broker ?? DEFAULT_BROKER}','${o.host ?? DEFAULT_HOST}','${o.hash ?? c.tokenHash}')`
const recoverSql = (workId: string, hash: string, broker = DEFAULT_BROKER, host = DEFAULT_HOST) =>
  `public.atlas_code_work_recover_claim_credential('${workId}'::uuid,'${broker}','${host}','${hash}')`
const freshHash = (workId: string) => issueBrokerClaimCredential(workId).tokenHash
const snapshot = (workId: string) => one(`select state||'|'||coalesce(claim_id::text,'∅')||'|'||fence||'|'||coalesce(lease_until::text,'∅')||'|'||coalesce(broker_token_expires_at::text,'∅')||'|'||coalesce(broker_token_hash,'∅')||'|'||state_version||'|'||repository_id||'|'||admission_hash from public.atlas_code_work_runs where work_id='${workId}'`)
const dumpReceipts = () => one(`select coalesce(string_agg(to_jsonb(r)::text,'|'),'') from public.atlas_code_work_receipts r`)
const dumpRuns = () => one(`select coalesce(string_agg(to_jsonb(r)::text,'|'),'') from public.atlas_code_work_runs r`)
const expireLease = (workId: string) => one(`begin; select set_config('omnira.code_work_control','on',true); update public.atlas_code_work_runs set lease_until=now()-interval '1 second',broker_token_expires_at=now()-interval '1 second' where work_id='${workId}'; commit`)
const exhaustRuntimeCap = (workId: string) => one(`begin; alter table public.atlas_code_work_runs disable trigger atlas_code_work_runs_guard_update; update public.atlas_code_work_runs set created_at=created_at-interval '2 days' where work_id='${workId}'; alter table public.atlas_code_work_runs enable trigger atlas_code_work_runs_guard_update; commit`)
const cleared = '∅'
const NOT_RECOVERABLE = /claim credential is not recoverable/
const STALE = /stale code-work fence/

d('SDF-1C2 schema surface', () => {
  it('1/22 removes the credential-less heartbeat, leaves one proof-bearing signature, and closes every ACL to service_role', () => {
    expect(one(`select to_regprocedure('public.atlas_code_work_heartbeat(uuid,uuid,bigint)')::text`)).toBe('')
    expect(one(`select count(*) from pg_proc where proname='atlas_code_work_heartbeat' and pronargs=3`)).toBe('0')
    expect(one(`select string_agg(oid::regprocedure::text,',') from pg_proc where proname='atlas_code_work_heartbeat' and pronamespace='public'::regnamespace`))
      .toBe('atlas_code_work_heartbeat(uuid,uuid,bigint,text,text,text)')
    const created = grantAndClaim()
    const legacy = txn(`select public.atlas_code_work_heartbeat('${created.workId}'::uuid,'${created.claimId}'::uuid,${created.fence})`)
    expect(legacy.ok).toBe(false); expect(legacy.err).toMatch(/does not exist/)
    for (const signature of [
      'atlas_code_work_heartbeat(uuid,uuid,bigint,text,text,text)',
      'atlas_code_work_recover_claim_credential(uuid,text,text,text)',
      'atlas_code_work_discover_claimable(text[],integer)',
    ]) {
      for (const role of ['anon', 'authenticated', 'public']) expect(one(`select has_function_privilege('${role}','public.${signature}','EXECUTE')`), `${signature} ${role}`).toBe('f')
      expect(one(`select has_function_privilege('service_role','public.${signature}','EXECUTE')`), signature).toBe('t')
      expect(one(`select p.prosecdef::text||':'||p.proconfig[1] from pg_proc p where p.oid='public.${signature}'::regprocedure`), signature).toBe('true:search_path=""')
    }
  })

  it('2/22 extends only the receipt vocabulary and adds no table', () => {
    expect(one(`select pg_get_constraintdef(oid) from pg_constraint where conname='atlas_code_work_receipts_event_type_check'`)).toContain('claim_credential_reissued')
    expect(one(`select count(*) from pg_tables where schemaname='public' and tablename like 'atlas_code_work_%'`)).toBe('2')
    expect(one(`select string_agg(table_name||'.'||column_name,',' order by 1) from information_schema.columns where table_schema='public' and table_name like 'atlas_code_work_%' and column_name ~* 'token|secret|credential'`))
      .toBe('atlas_code_work_runs.broker_token_expires_at,atlas_code_work_runs.broker_token_hash')
  })
})

d('SDF-1C2 credential-bearing heartbeat', () => {
  it('3/22 refuses every wrong element of the claim proof identically and changes nothing', () => {
    const claimed = grantAndClaim()
    const before = snapshot(claimed.workId)
    const attempts: Array<[string, Parameters<typeof hb>[1]]> = [
      ['wrong token', { hash: freshHash(claimed.workId) }], ['wrong broker', { broker: 'other-broker' }],
      ['wrong host', { host: 'other-host' }], ['wrong claim', { claimId: uuid('9') }],
      ['stale fence (high)', { fence: claimed.fence + 1 }], ['stale fence (low)', { fence: claimed.fence - 1 }],
      ['token of another work', { hash: freshHash(uuid('3')) }],
    ]
    for (const [name, override] of attempts) {
      const result = txn(`select ${hb(claimed, override)}`)
      expect(result.ok, name).toBe(false); expect(result.err, name).toMatch(STALE)
    }
    expect(snapshot(claimed.workId)).toBe(before)
    expect(dumpReceipts()).not.toContain(claimed.tokenHash)
  })

  it('4/22 rejects a malformed proof before touching the run', () => {
    const claimed = grantAndClaim()
    const before = snapshot(claimed.workId)
    for (const hash of ['null::text', q('A'.repeat(64)), q('a'.repeat(63)), q('a'.repeat(65)), q('g'.repeat(64)), q('')]) {
      const result = txn(`select public.atlas_code_work_heartbeat('${claimed.workId}','${claimed.claimId}',${claimed.fence},'${DEFAULT_BROKER}','${DEFAULT_HOST}',${hash})`)
      expect(result.ok, hash).toBe(false); expect(result.err, hash).toMatch(/broker claim proof invalid/)
    }
    for (const [broker, host] of [['', DEFAULT_HOST], [DEFAULT_BROKER, '']]) {
      expect(txn(`select public.atlas_code_work_heartbeat('${claimed.workId}','${claimed.claimId}',${claimed.fence},'${broker}','${host}','${claimed.tokenHash}')`).err).toMatch(/broker claim proof invalid/)
    }
    expect(snapshot(claimed.workId)).toBe(before)
  })

  it('5/22 renews the lease with the token expiry equal to it, keeps hash, claim and fence, and receipts no secret', () => {
    const claimed = grantAndClaim()
    one(`begin; select set_config('omnira.code_work_control','on',true); update public.atlas_code_work_runs set lease_until=now()+interval '10 seconds',broker_token_expires_at=now()+interval '10 seconds' where work_id='${claimed.workId}'; commit`)
    const before = one(`select lease_until from public.atlas_code_work_runs where work_id='${claimed.workId}'`)
    expect(rpc(`select (${hb(claimed)}).state`)).toBe('claimed')
    expect(one(`select lease_until > '${before}'::timestamptz and broker_token_expires_at = lease_until from public.atlas_code_work_runs where work_id='${claimed.workId}'`)).toBe('t')
    expect(runCol(claimed.workId, 'broker_token_hash')).toBe(claimed.tokenHash)
    expect(runCol(claimed.workId, 'claim_id')).toBe(claimed.claimId)
    expect(runCol(claimed.workId, 'fence')).toBe(String(claimed.fence))
    expect(one(`select string_agg(k,',' order by k) from public.atlas_code_work_receipts r, jsonb_object_keys(r.payload) k where r.work_id='${claimed.workId}' and r.event_type='lease_renewed'`)).toBe('claimId,fence,heartbeatTargetSeconds,leaseUntil')
    expect(dumpReceipts()).not.toContain(claimed.token)
    expect(dumpReceipts()).not.toContain(claimed.tokenHash)
    expect(dumpRuns()).not.toContain(claimed.token)
  })

  it('6/22 is invalidated by cancellation and by an elapsed lease, clearing the credential', () => {
    const cancelled = grantAndClaim()
    rpc(`select (public.atlas_code_work_cancel('${cancelled.workId}','${PROJECT}','${REQUESTER}','owner_cancel')).state`)
    expect(txn(`select ${hb(cancelled)}`).err).toMatch(STALE)
    expect(runCol(cancelled.workId, 'broker_token_hash')).toBe('')

    const lapsed = grantAndClaim()
    expireLease(lapsed.workId)
    expect(rpc(`select (${hb(lapsed)}).state`)).toBe('timeout')
    expect(snapshot(lapsed.workId)).toContain(`|${cleared}|`)
    expect(runCol(lapsed.workId, 'broker_token_hash')).toBe('')
    expect(txn(`select ${hb(lapsed)}`).err).toMatch(STALE)
  })

  it('7/22 rechecks Authorization V1 and the runtime cap on every heartbeat', () => {
    const authorized = grantAndClaim({ expiresIn: '3 seconds' })
    one('select pg_sleep(3.5)')
    expect(['timeout', 'cancelled']).toContain(rpc(`select (${hb(authorized)}).state`))
    expect(runCol(authorized.workId, 'broker_token_hash')).toBe('')

    const capped = grantAndClaim()
    exhaustRuntimeCap(capped.workId)
    expect(rpc(`select (${hb(capped)}).state`)).toBe('timeout')
    expect(one(`select terminal_reason_code from public.atlas_code_work_runs where work_id='${capped.workId}'`)).toBe('runtime_cap_elapsed')
    expect(runCol(capped.workId, 'broker_token_hash')).toBe('')
  })
})

d('SDF-1C2 same-broker claim recovery', () => {
  it('8/22 reissues only the credential hash for the SAME claim and never extends the lease', () => {
    const claimed = grantAndClaim()
    const before = snapshot(claimed.workId).split('|')      // state|claim|fence|lease|expiry|hash|version|repo|admission
    const lastHeartbeat = one(`select last_heartbeat_at from public.atlas_code_work_runs where work_id='${claimed.workId}'`)
    one('select pg_sleep(1.1)')
    const next = freshHash(claimed.workId)
    expect(rpc(`select (${recoverSql(claimed.workId, next)}).state`)).toBe('claimed')
    const after = snapshot(claimed.workId).split('|')
    expect(after[5]).toBe(next); expect(after[5]).not.toBe(before[5])
    for (const index of [0, 1, 2, 3, 4, 6, 7, 8]) expect(after[index], `field ${index}`).toBe(before[index])
    expect(one(`select last_heartbeat_at from public.atlas_code_work_runs where work_id='${claimed.workId}'`)).toBe(lastHeartbeat)
    expect(one(`select broker_token_expires_at = lease_until from public.atlas_code_work_runs where work_id='${claimed.workId}'`)).toBe('t')
    // The old credential is dead, the new one works, and the lease is only renewed by that heartbeat.
    expect(txn(`select ${hb(claimed)}`).err).toMatch(STALE)
    expect(rpc(`select (${hb(claimed, { hash: next })}).state`)).toBe('claimed')
  })

  it('9/22 audits the reissue with a closed non-secret receipt', () => {
    const claimed = grantAndClaim()
    const next = freshHash(claimed.workId)
    rpc(`select (${recoverSql(claimed.workId, next)}).state`)
    expect(one(`select count(*) from public.atlas_code_work_receipts where work_id='${claimed.workId}' and event_type='claim_credential_reissued' and receipt_class='control'`)).toBe('1')
    expect(one(`select string_agg(k,',' order by k) from public.atlas_code_work_receipts r, jsonb_object_keys(r.payload) k where r.work_id='${claimed.workId}' and r.event_type='claim_credential_reissued'`)).toBe('claimId,credentialReissued,fence,leaseUntil')
    expect(one(`select payload->>'credentialReissued' from public.atlas_code_work_receipts where work_id='${claimed.workId}' and event_type='claim_credential_reissued'`)).toBe('true')
    expect(one(`select payload->>'claimId' from public.atlas_code_work_receipts where work_id='${claimed.workId}' and event_type='claim_credential_reissued'`)).toBe(claimed.claimId)
    for (const secret of [claimed.token, claimed.tokenHash, next]) { expect(dumpReceipts()).not.toContain(secret); }
    expect(dumpRuns()).not.toContain(claimed.token)
    expect(dumpRuns().split(next).length - 1).toBe(1)
    expect(one(`select count(*) from public.atlas_code_work_receipts where work_id='${claimed.workId}' and event_type='claim_issued'`)).toBe('1')
  })

  it('10/22 refuses another broker, another host, unknown work, unclaimed work and a no-op rotation identically', () => {
    const claimed = grantAndClaim()
    const idle = createProposal({ grant: 'granted' })
    const before = snapshot(claimed.workId)
    const idleBefore = snapshot(idle.workId)
    const cases: Array<[string, string]> = [
      ['different broker', recoverSql(claimed.workId, freshHash(claimed.workId), 'other-broker')],
      ['different host', recoverSql(claimed.workId, freshHash(claimed.workId), DEFAULT_BROKER, 'other-host')],
      ['different work (unknown)', recoverSql(uuid('3'), freshHash(claimed.workId))],
      ['unclaimed authorized work', recoverSql(idle.workId, freshHash(idle.workId))],
      ['same hash (no rotation)', recoverSql(claimed.workId, claimed.tokenHash)],
    ]
    for (const [name, sql] of cases) {
      const result = txn(`select ${sql}`)
      expect(result.ok, name).toBe(false); expect(result.err, name).toMatch(NOT_RECOVERABLE)
    }
    expect(txn(`select public.atlas_code_work_recover_claim_credential('${claimed.workId}','${DEFAULT_BROKER}','${DEFAULT_HOST}','${'A'.repeat(64)}')`).err).toMatch(/hash invalid/)
    expect(snapshot(claimed.workId)).toBe(before)
    expect(snapshot(idle.workId)).toBe(idleBefore)
  })

  it('11/22 fails closed through canonical timeout/cancel/fencing for expired, cancelled, unauthorized and capped claims', () => {
    const lapsed = grantAndClaim()
    expireLease(lapsed.workId)
    expect(rpc(`select (${recoverSql(lapsed.workId, freshHash(lapsed.workId))}).state`)).toBe('timeout')
    expect(runCol(lapsed.workId, 'broker_token_hash')).toBe('')

    const cancelled = grantAndClaim()
    rpc(`select (public.atlas_code_work_cancel('${cancelled.workId}','${PROJECT}','${REQUESTER}','owner_cancel')).state`)
    expect(txn(`select ${recoverSql(cancelled.workId, freshHash(cancelled.workId))}`).err).toMatch(NOT_RECOVERABLE)

    const unauthorized = grantAndClaim({ expiresIn: '3 seconds' })
    one('select pg_sleep(3.5)')
    expect(['timeout', 'cancelled']).toContain(rpc(`select (${recoverSql(unauthorized.workId, freshHash(unauthorized.workId))}).state`))
    expect(runCol(unauthorized.workId, 'broker_token_hash')).toBe('')

    const capped = grantAndClaim()
    exhaustRuntimeCap(capped.workId)
    expect(rpc(`select (${recoverSql(capped.workId, freshHash(capped.workId))}).state`)).toBe('timeout')
    expect(runCol(capped.workId, 'broker_token_hash')).toBe('')
    expect(one(`select count(*) from public.atlas_code_work_receipts where event_type='claim_credential_reissued' and work_id in ('${lapsed.workId}','${cancelled.workId}','${unauthorized.workId}','${capped.workId}')`)).toBe('0')
  })

  it('12/22 is closed beyond the handshake state', () => {
    const active = grantAndClaim()
    rpc(`select (public.atlas_code_work_transition('${active.workId}','claimed',2,'preparing','${active.claimId}',${active.fence},null)).state`)
    const before = snapshot(active.workId)
    expect(txn(`select ${recoverSql(active.workId, freshHash(active.workId))}`).err).toMatch(NOT_RECOVERABLE)
    expect(snapshot(active.workId)).toBe(before)
  })

  it('13/22 is closed for good after the first successful credential-bearing heartbeat', () => {
    const claimed = grantAndClaim()
    expect(rpc(`select (${hb(claimed)}).state`)).toBe('claimed')
    expect(one(`select count(*) from public.atlas_code_work_receipts where work_id='${claimed.workId}' and event_type='lease_renewed'`)).toBe('1')
    const before = snapshot(claimed.workId)
    const result = txn(`select ${recoverSql(claimed.workId, freshHash(claimed.workId))}`)
    expect(result.ok).toBe(false); expect(result.err).toMatch(NOT_RECOVERABLE)
    expect(snapshot(claimed.workId)).toBe(before)
    expect(runCol(claimed.workId, 'broker_token_hash')).toBe(claimed.tokenHash)
    expect(one(`select count(*) from public.atlas_code_work_receipts where work_id='${claimed.workId}' and event_type='claim_credential_reissued'`)).toBe('0')
    // A recovery BEFORE the first heartbeat may repeat (the response can be lost again) …
    const other = grantAndClaim()
    rpc(`select (${recoverSql(other.workId, freshHash(other.workId))}).state`)
    rpc(`select (${recoverSql(other.workId, freshHash(other.workId))}).state`)
    expect(one(`select count(*) from public.atlas_code_work_receipts where work_id='${other.workId}' and event_type='claim_credential_reissued'`)).toBe('2')
  })

  it('14/22 serializes recovery against heartbeat so exactly one of them wins', async () => {
    const claimed = grantAndClaim()
    const next = freshHash(claimed.workId)
    const results = await concurrently(`select ${hb(claimed)}`, `select ${recoverSql(claimed.workId, next)}`)
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    const hash = runCol(claimed.workId, 'broker_token_hash')
    expect([claimed.tokenHash, next]).toContain(hash)
    expect(one(`select count(*) from public.atlas_code_work_receipts where work_id='${claimed.workId}' and event_type in ('lease_renewed','claim_credential_reissued')`)).toBe('1')
  })
})

d('SDF-1C2 discovery read', () => {
  const REPO = OMNIRA_REPOSITORY_ID
  const discover = (repositories: string, limit = 'default') => one(`select coalesce(string_agg(work_id::text,',' order by ord),'') from (select work_id, row_number() over () ord from public.atlas_code_work_discover_claimable(${repositories}${limit === 'default' ? '' : `,${limit}`})) t`)
  const ids = (repositories: string, limit = 'default') => discover(repositories, limit).split(',').filter(Boolean)

  it('15/22 returns exactly three columns and changes no CodeWork state', () => {
    expect(one(`select pg_get_function_result('public.atlas_code_work_discover_claimable(text[],integer)'::regprocedure)`)).toBe('TABLE(work_id uuid, repository_id text, pinned_base_sha text)')
    const created = createProposal({ grant: 'granted' })
    const before = snapshot(created.workId)
    const receipts = one(`select count(*) from public.atlas_code_work_receipts`)
    expect(ids(`array['${REPO}']`)).toContain(created.workId)
    expect(one(`select row_to_json(t)::text from public.atlas_code_work_discover_claimable(array['${REPO}'],1) t`)).toMatch(/^\{"work_id":"[0-9a-f-]{36}","repository_id":"[^"]+","pinned_base_sha":"[0-9a-f]{40}"\}$/)
    expect(snapshot(created.workId)).toBe(before)
    expect(one(`select count(*) from public.atlas_code_work_receipts`)).toBe(receipts)
  })

  it('16/22 lists only authorized, unclaimed, live work: never proposed, claimed, denied, cancelled or expired', () => {
    const eligible = createProposal({ grant: 'granted' })
    const proposed = createProposal()
    const claimedRun = grantAndClaim()
    const denied = createProposal({ grant: 'denied' })
    const conditional = createProposal({ grant: 'granted_with_conditions' })
    const cancelled = createProposal({ grant: 'granted' })
    rpc(`select (public.atlas_code_work_cancel('${cancelled.workId}','${PROJECT}','${REQUESTER}','owner_cancel')).state`)
    const listed = ids(`array['${REPO}']`, '20')
    expect(listed).toContain(eligible.workId)
    for (const excluded of [proposed, claimedRun, denied, conditional, cancelled]) expect(listed, excluded.workId).not.toContain(excluded.workId)
    const shortLived = createProposal({ grant: 'granted', expiresIn: '1 second' })
    one('select pg_sleep(1.6)')
    expect(ids(`array['${REPO}']`)).not.toContain(shortLived.workId)
  })

  it('17/22 is scoped strictly to the supplied repositories', () => {
    const created = createProposal({ grant: 'granted' })
    expect(ids(`array['github.com/other/repo']`)).toEqual([])
    expect(ids(`array[]::text[]`)).toEqual([])
    expect(ids(`null::text[]`)).toEqual([])
    expect(ids(`array['github.com/other/repo','${REPO}']`)).toContain(created.workId)
    expect(txn(`select * from public.atlas_code_work_discover_claimable(array['${REPO}'])`, 'anon').ok).toBe(false)
  })

  it('18/22 is bounded to 20 and ordered oldest-authorized first', () => {
    for (let index = 0; index < 22; index++) createProposal({ grant: 'granted' })
    const all = ids(`array['${REPO}']`, '1000')
    expect(all).toHaveLength(20)
    expect(ids(`array['${REPO}']`, '1')).toHaveLength(1)
    expect(ids(`array['${REPO}']`, '0')).toHaveLength(1)
    expect(ids(`array['${REPO}']`, '-5')).toHaveLength(1)
    expect(ids(`array['${REPO}']`, 'null')).toHaveLength(20)
    expect(one(`select bool_and(authorized_at >= prev) from (select r.authorized_at, lag(r.authorized_at) over (order by ord) prev from (select work_id, row_number() over () ord from public.atlas_code_work_discover_claimable(array['${REPO}'],20)) d join public.atlas_code_work_runs r using (work_id)) s where prev is not null`)).toBe('t')
  })
})

d('SDF-1C2 identity is not authority', () => {
  it('19/22 keeps claim requiring an authorized run whatever the broker proves (the database is authoritative)', () => {
    const proposed = createProposal()
    expect(txn(claimSql(proposed.workId, freshHash(proposed.workId))).err).toMatch(/not claimable/)
    const denied = createProposal({ grant: 'denied' })
    expect(txn(claimSql(denied.workId, freshHash(denied.workId))).err).toMatch(/not claimable/)
    const expired = createProposal({ grant: 'granted', expiresIn: '1 second' })
    one('select pg_sleep(1.6)')
    expect(rpc(claimSql(expired.workId, freshHash(expired.workId)))).toBe('cancelled')
    expect(snapshot(expired.workId)).toContain(`|${cleared}|`)
  })

  it('20/22 refuses a heartbeat for a claim held by a different broker even with the right token', () => {
    const claimed = grantAndClaim()
    const result = txn(`select ${hb(claimed, { broker: 'foreign-broker', host: 'foreign-host' })}`)
    expect(result.ok).toBe(false); expect(result.err).toMatch(STALE)
  })

  it('21/22 never lets the raw token or a hash into any receipt across claim, recovery and heartbeat', () => {
    const claimed = grantAndClaim()
    const next = freshHash(claimed.workId)
    rpc(`select (${recoverSql(claimed.workId, next)}).state`)
    rpc(`select (${hb(claimed, { hash: next })}).state`)
    for (const secret of [claimed.token, claimed.tokenHash, next]) expect(dumpReceipts(), secret.slice(0, 8)).not.toContain(secret)
    expect(one(`select count(*) from public.atlas_code_work_receipts r where r.work_id='${claimed.workId}' and r.event_type in ('claim_issued','claim_credential_reissued','lease_renewed') and r.payload::text ~* 'token|hash|secret'`)).toBe('0')
  })

  it('22/22 leaves cancel, timeout and terminal transitions clearing the credential exactly as before', () => {
    const claimed = grantAndClaim()
    expect(rpc(`select (public.atlas_code_work_cancel('${claimed.workId}','${PROJECT}','${REQUESTER}','owner_cancel')).state`)).toBe('cancelled')
    expect(runCol(claimed.workId, 'broker_token_hash')).toBe('')
    expect(runCol(claimed.workId, 'fence')).toBe(String(claimed.fence + 1))
    expect(one(`select count(*) from pg_constraint where conname='atlas_code_work_runs_claim_credential_check' and convalidated`)).toBe('1')
  })
})
