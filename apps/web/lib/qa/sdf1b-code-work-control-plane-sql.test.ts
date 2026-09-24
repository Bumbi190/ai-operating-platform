/** SDF-1B1 invariants against a per-process throwaway PostgreSQL database. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile, execFileSync } from 'node:child_process'
import { join } from 'node:path'
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
if (!AVAILABLE && !SQL_REQUIRED) console.warn('[sdf1b-sql] SKIPPED — no local Postgres; set ATLAS_SQL_TEST_URL')
const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const DB = `omnira_sdf1b1_${suffix}`
const SVC = `omnira_sdf1b1_svc_${suffix}`
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
function createProposal(options: { grant?: 'granted' | 'granted_with_conditions' | 'denied'; sync?: boolean } = {}): Created {
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
    const expires = options.grant === 'denied' ? 'null' : "clock_timestamp()+interval '1 hour'"
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

function grantAndClaim(): Created & { claimId: string; fence: number } {
  const created = createProposal({ grant: 'granted' })
  expect(one(`select state from public.atlas_code_work_runs where work_id=${q(created.workId)}::uuid`)).toBe('authorized')
  rpc(`select (public.atlas_code_work_claim(${q(created.workId)}::uuid,'fixture-broker','fixture-host','${CLAIM_HASH}')).state`)
  return { ...created, claimId: one(`select claim_id from public.atlas_code_work_runs where work_id=${q(created.workId)}::uuid`), fence: Number(one(`select fence from public.atlas_code_work_runs where work_id=${q(created.workId)}::uuid`)) }
}

function appendEvidence(created: Created & { claimId: string; fence: number }, receiptClass: string, payload: Record<string, unknown>) {
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
  // SDF-1C1B replaces the credential-less claim; the B1 suite exercises the schema as it now ships.
  run(dsn, ['--single-transaction', '-f', join(process.cwd(), 'supabase/migrations/20260924080000_sdf1c1b_broker_claim_credentials.sql')])
  run(ADMIN_URL, ['-c', `create role "${SVC}" nologin bypassrls in role service_role`])
}, 120_000)

afterAll(() => {
  if (!AVAILABLE) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB}" with (force)`]) } catch { /* best effort */ }
  try { run(ADMIN_URL, ['-c', `drop role if exists "${SVC}"`]) } catch { /* best effort */ }
})

d('SDF-1B1 schema, immutability and ACL', () => {
  it('creates exactly the two SERVER_ONLY code-work tables with RLS and bounded grants', () => {
    expect(one(`select string_agg(tablename,',' order by tablename) from pg_tables where schemaname='public' and tablename like 'atlas_code_work_%'`)).toBe('atlas_code_work_receipts,atlas_code_work_runs')
    for (const table of ['atlas_code_work_runs', 'atlas_code_work_receipts']) {
      expect(one(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`)).toBe('t')
      expect(one(`select count(*) from pg_policies where schemaname='public' and tablename='${table}'`)).toBe('0')
      for (const role of ['anon', 'authenticated']) expect(one(`select has_table_privilege('${role}','public.${table}','SELECT')`)).toBe('f')
      expect(one(`select has_table_privilege('service_role','public.${table}','SELECT')`)).toBe('t')
      expect(one(`select has_table_privilege('service_role','public.${table}','INSERT')`)).toBe('f')
    }
    expect(one(`select has_function_privilege('authenticated','public.atlas_code_work_propose(uuid,uuid,uuid,text,text,jsonb,text,uuid,uuid)','EXECUTE')`)).toBe('f')
    expect(one(`select has_function_privilege('service_role','public.atlas_code_work_propose(uuid,uuid,uuid,text,text,jsonb,text,uuid,uuid)','EXECUTE')`)).toBe('t')
  })

  it('makes admission, project, authorization and every authority projection immutable', () => {
    const created = createProposal()
    for (const assignment of [`project_id='${OTHER_PROJECT}'`, `admission='{}'::jsonb`, `authorization_id=gen_random_uuid()`, `repository_id='other'`]) {
      const result = txn(`select set_config('omnira.code_work_control','on',true); update public.atlas_code_work_runs set ${assignment} where work_id='${created.workId}'`, null)
      expect(result.ok).toBe(false); expect(result.err).toMatch(/authority fields are immutable/)
    }
  })

  it('rejects outcome-specific receipt classes in the persisted baseline', () => {
    const workId = uuid('3')
    const overbroad = admission(workId)
    overbroad.evidence.requiredReceiptClasses = ['authority_pins', 'policy_denial']
    const admissionJson = one(`select public.atlas_code_work_normalized_admission(${q(JSON.stringify(overbroad))}::jsonb)::text`)
    const admissionHash = one(`select public.atlas_code_work_admission_hash(${q(admissionJson)}::jsonb)`)
    const result = txn(`select public.atlas_code_work_propose(
      ${q(workId)}::uuid,${q(PROJECT)}::uuid,${q(REQUESTER)}::uuid,
      ${q(HASH_A)},${q(HASH_B)},${q(admissionJson)}::jsonb,${q(admissionHash)},
      ${q(uuid('8'))}::uuid,${q(uuid('9'))}::uuid
    )`)
    expect(result.ok).toBe(false)
    expect(result.err).toMatch(/baseline evidence must be exactly authority_pins/)
  })

  it('refuses receipt UPDATE, DELETE and TRUNCATE even for the table owner', () => {
    const created = createProposal()
    for (const statement of [
      `update public.atlas_code_work_receipts set producer_id='changed' where work_id='${created.workId}'`,
      `delete from public.atlas_code_work_receipts where work_id='${created.workId}'`,
      `truncate public.atlas_code_work_receipts`,
    ]) {
      const result = txn(statement, null); expect(result.ok).toBe(false); expect(result.err).toMatch(/append-only/)
    }

    const duplicateSequence = txn(`insert into public.atlas_code_work_receipts(
      receipt_id,work_id,admission_hash,sequence,event_type,receipt_class,payload,payload_hash,
      previous_receipt_hash,receipt_hash,producer_type,producer_id,claim_id,fence,observed_at,recorded_at
    ) select gen_random_uuid(),work_id,admission_hash,sequence,event_type,receipt_class,payload,payload_hash,
      previous_receipt_hash,'${'c'.repeat(64)}',producer_type,producer_id,claim_id,fence,observed_at,clock_timestamp()
      from public.atlas_code_work_receipts where work_id='${created.workId}' order by sequence limit 1`, null)
    expect(duplicateSequence.ok).toBe(false)
    expect(duplicateSequence.err).toMatch(/atlas_code_work_receipts_work_sequence_unique/)
  })
})

d('SDF-1B1 authorization, chain and lifecycle', () => {
  it('recomputes the exact SDF-1A admission hash and makes idempotency conflict-safe', () => {
    const created = createProposal()
    expect(one(`select admission_hash=public.atlas_code_work_admission_hash(admission) from public.atlas_code_work_runs where work_id='${created.workId}'`)).toBe('t')
    expect(one(`select string_agg(sequence||':'||event_type,',' order by sequence) from public.atlas_code_work_receipts where work_id='${created.workId}'`)).toBe('1:proposal_created,2:authorization_requested,3:evidence')
    expect(one(`select bool_and(previous_receipt_hash is not distinct from lag_hash) from (select previous_receipt_hash,lag(receipt_hash) over(order by sequence) lag_hash from public.atlas_code_work_receipts where work_id='${created.workId}') s`)).toBe('t')

    const retryState = rpc(`select (public.atlas_code_work_propose(
      ${q(created.workId)}::uuid,${q(PROJECT)}::uuid,${q(REQUESTER)}::uuid,
      ${q(created.proposalKeyHash)},${q(created.proposalFingerprintHash)},${q(created.admissionJson)}::jsonb,
      ${q(created.admissionHash)},${q(uuid('8'))}::uuid,${q(uuid('9'))}::uuid
    )).state`)
    expect(retryState).toBe('proposed')
    expect(one(`select count(*) from public.atlas_code_work_runs where proposal_key_hash=${q(created.proposalKeyHash)}`)).toBe('1')
    expect(one(`select count(*) from public.atlas_code_work_receipts where work_id='${created.workId}'`)).toBe('3')

    const conflict = txn(`select public.atlas_code_work_propose(
      ${q(created.workId)}::uuid,${q(PROJECT)}::uuid,${q(REQUESTER)}::uuid,
      ${q(created.proposalKeyHash)},${q('f'.repeat(64))},${q(created.admissionJson)}::jsonb,
      ${q(created.admissionHash)},${q(uuid('8'))}::uuid,${q(uuid('9'))}::uuid
    )`)
    expect(conflict.ok).toBe(false)
    expect(conflict.err).toMatch(/proposal_fingerprint_conflict/)
  })

  it('treats conditional authorization as execution-ineffective policy denial', () => {
    const created = createProposal({ grant: 'granted_with_conditions' })
    expect(one(`select state from public.atlas_code_work_runs where work_id='${created.workId}'`)).toBe('policy_denied')
    expect(one(`select count(*) from public.atlas_code_work_receipts where work_id='${created.workId}' and receipt_class='policy_denial'`)).toBe('1')
  })

  it('keeps the SQL transition mirror in exact parity with canonical TypeScript', () => {
    const states = [...CODE_WORK_NON_TERMINAL_STATES, ...CODE_WORK_TERMINAL_STATES]
    for (const from of states) for (const to of states) {
      expect(one(`select public.atlas_code_work_transition_allowed('${from}','${to}')`), `${from}->${to}`)
        .toBe(canTransitionCodeWork(from, to) ? 't' : 'f')
    }
  })

  it('allocates monotonic receipts under lock and rejects stale sequence/previous/admission/fence', () => {
    const created = grantAndClaim()
    const sequence = Number(one(`select last_receipt_sequence+1 from public.atlas_code_work_runs where work_id='${created.workId}'`))
    const payload = q(JSON.stringify({ receiptClass: 'worker_identity', adapterId: 'claude_patch_v1', adapterVersion: 1, provider: 'anthropic', modelId: 'claude-sonnet-4-6', outputProtocol: CODE_WORK_OUTPUT_PROTOCOL }))
    const wrongSequence = txn(`select public.atlas_code_work_append_evidence('${created.workId}','${created.admissionHash}','${created.claimId}',${created.fence},${sequence + 1},null,'worker_identity',${payload}::jsonb,clock_timestamp(),'worker','fixture')`)
    expect(wrongSequence.err).toMatch(/sequence mismatch/)
    const wrongPrevious = txn(`select public.atlas_code_work_append_evidence('${created.workId}','${created.admissionHash}','${created.claimId}',${created.fence},${sequence},'${'f'.repeat(64)}','worker_identity',${payload}::jsonb,clock_timestamp(),'worker','fixture')`)
    expect(wrongPrevious.err).toMatch(/previous hash mismatch/)
    const wrongAdmission = txn(`select public.atlas_code_work_append_evidence('${created.workId}','${HASH_B}','${created.claimId}',${created.fence},${sequence},null,'worker_identity',${payload}::jsonb,clock_timestamp(),'worker','fixture')`)
    expect(wrongAdmission.err).toMatch(/run\/admission not found/)
    const staleFence = txn(`select public.atlas_code_work_heartbeat('${created.workId}','${created.claimId}',${created.fence + 1})`)
    expect(staleFence.err).toMatch(/stale code-work fence/)
  })
})

d('SDF-1B1 claim, cancellation races and terminal evidence', () => {
  it('serializes duplicate claims and never requeues an expired lease', async () => {
    const created = createProposal({ grant: 'granted' })
    const result = await concurrently(
      `select (public.atlas_code_work_claim('${created.workId}','broker-a','host-a','${CLAIM_HASH}')).state`,
      `select (public.atlas_code_work_claim('${created.workId}','broker-b','host-b','${CLAIM_HASH}')).state`,
    )
    expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    const claimId = one(`select claim_id from public.atlas_code_work_runs where work_id='${created.workId}'`)
    const fence = Number(one(`select fence from public.atlas_code_work_runs where work_id='${created.workId}'`))
    one(`begin; select set_config('omnira.code_work_control','on',true); update public.atlas_code_work_runs set lease_until=now()-interval '1 second',broker_token_expires_at=now()-interval '1 second' where work_id='${created.workId}'; commit`)
    expect(rpc(`select (public.atlas_code_work_heartbeat('${created.workId}','${claimId}',${fence})).state`)).toBe('timeout')
    expect(txn(`select public.atlas_code_work_claim('${created.workId}','broker-c','host-c','${CLAIM_HASH}')`).err).toMatch(/not claimable/)
  })

  it('makes cancel win safely against claim, heartbeat and receipt operations', async () => {
    const againstClaim = createProposal({ grant: 'granted' })
    await concurrently(
      `select public.atlas_code_work_claim('${againstClaim.workId}','broker','host','${CLAIM_HASH}')`,
      `select public.atlas_code_work_cancel('${againstClaim.workId}','${PROJECT}','${REQUESTER}','owner_cancel')`,
    )
    expect(one(`select state||':'||(claim_id is null)::text from public.atlas_code_work_runs where work_id='${againstClaim.workId}'`)).toBe('cancelled:true')

    for (const operation of ['heartbeat', 'receipt'] as const) {
      const active = grantAndClaim()
      const seq = Number(one(`select last_receipt_sequence+1 from public.atlas_code_work_runs where work_id='${active.workId}'`))
      const head = one(`select quote_literal(receipt_chain_head) from public.atlas_code_work_runs where work_id='${active.workId}'`)
      const other = operation === 'heartbeat'
        ? `select public.atlas_code_work_heartbeat('${active.workId}','${active.claimId}',${active.fence})`
        : `select public.atlas_code_work_append_evidence('${active.workId}','${active.admissionHash}','${active.claimId}',${active.fence},${seq},${head},'worker_identity','{"receiptClass":"worker_identity"}'::jsonb,clock_timestamp(),'worker','fixture')`
      await concurrently(other, `select public.atlas_code_work_cancel('${active.workId}','${PROJECT}','${REQUESTER}','owner_cancel')`)
      expect(one(`select state from public.atlas_code_work_runs where work_id='${active.workId}'`)).toBe('cancelled')
      expect(txn(other).err).toMatch(/stale code-work fence|not heartbeat eligible|terminal run|not found/)
    }
  })

  it('rejects terminal transitions without their profile and never requires policy_denial for ready', async () => {
    const active = grantAndClaim()
    rpc(`select (public.atlas_code_work_transition('${active.workId}','claimed',2,'preparing','${active.claimId}',${active.fence},null)).state`)
    rpc(`select (public.atlas_code_work_transition('${active.workId}','preparing',3,'working','${active.claimId}',${active.fence},null)).state`)
    rpc(`select (public.atlas_code_work_transition('${active.workId}','working',4,'testing','${active.claimId}',${active.fence},null)).state`)
    expect(txn(`select public.atlas_code_work_transition('${active.workId}','testing',5,'ready_for_human_review','${active.claimId}',${active.fence},null)`).err).toMatch(/terminal evidence incomplete/)
    const evidence = [
      ['repository_proof', { receiptClass: 'repository_proof', repositoryId: OMNIRA_REPOSITORY_ID, verified: true }],
      ['base_proof', { receiptClass: 'base_proof', pinnedBaseSha: admission(active.workId).repository.pinnedBaseSha, observedRefSha: admission(active.workId).repository.pinnedBaseSha, stale: false }],
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
    expect(one(`select count(*) from public.atlas_code_work_receipts where work_id='${active.workId}' and receipt_class='policy_denial'`)).toBe('0')
    const race = await concurrently(
      `select public.atlas_code_work_transition('${active.workId}','testing',5,'ready_for_human_review','${active.claimId}',${active.fence},null)`,
      `select public.atlas_code_work_cancel('${active.workId}','${PROJECT}','${REQUESTER}','owner_cancel')`,
    )
    expect(race.some(item => item.status === 'fulfilled')).toBe(true)
    expect(['ready_for_human_review', 'cancelled']).toContain(one(`select state from public.atlas_code_work_runs where work_id='${active.workId}'`))
    expect(txn(`select set_config('omnira.code_work_control','on',true); update public.atlas_code_work_runs set state='working' where work_id='${active.workId}'`, null).err).toMatch(/terminal row is immutable/)
  })

  it('requires denial evidence for policy_denied and cancellation evidence for cancelled', () => {
    const active = grantAndClaim()
    appendEvidence(active, 'terminal', { receiptClass: 'terminal', state: 'policy_denied', iterationCount: 0 })
    expect(txn(`select public.atlas_code_work_transition('${active.workId}','claimed',2,'policy_denied','${active.claimId}',${active.fence},null)`).err).toMatch(/terminal evidence incomplete/)
    const proposed = createProposal()
    expect(txn(`select public.atlas_code_work_transition('${proposed.workId}','proposed',0,'cancelled',null,0,null)`).err).toMatch(/illegal code-work transition/)
  })

  it('hides foreign/unknown work and keeps cancellation project-bound', () => {
    const created = createProposal()
    const foreign = txn(`select public.atlas_code_work_cancel('${created.workId}','${OTHER_PROJECT}','${REQUESTER}','probe')`)
    expect(foreign.err).toMatch(/run not found/)
    const anon = txn(`select * from public.atlas_code_work_runs where work_id='${created.workId}'`, 'anon')
    expect(anon.ok).toBe(false)
  })
})
