/**
 * Canonical Dream reconciliation against real PostgreSQL.
 *
 * The suite creates one throwaway database, applies the real Phase A migration,
 * and exercises its triggers, ACLs, backfill, lifecycle and evidence boundary.
 * It never contacts Supabase or production. CI requires PostgreSQL and must fail
 * rather than skip when the database is unavailable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import {
  reduceDreamDisposition,
  type DreamReconciliationEvent,
} from '@/lib/atlas/dream-reconciliation'

function findPsql(): string | null {
  for (const candidate of [
    process.env.ATLAS_SQL_TEST_PSQL,
    'psql',
    '/opt/homebrew/bin/psql',
    '/opt/homebrew/opt/libpq/bin/psql',
    '/usr/bin/psql',
  ].filter(Boolean) as string[]) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'pipe' })
      return candidate
    } catch { /* try the next candidate */ }
  }
  return null
}

const PSQL = findPsql()
const ADMIN_URL = process.env.ATLAS_SQL_TEST_URL
  ?? `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`
const dsnFor = (database: string) => {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${database}`
  return url.toString()
}
const AVAILABLE = (() => {
  if (!PSQL) return false
  try {
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], {
      stdio: 'pipe', timeout: 10_000,
    })
    return true
  } catch {
    return false
  }
})()
const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'
if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn('[dream-reconciliation-postgres] SKIPPED — no local PostgreSQL. Set ATLAS_SQL_TEST_URL to execute the canonical SQL boundary.')
}
const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const DATABASE = `omnira_dream_reconciliation_${suffix}`
const SERVICE_ACTOR = `omnira_dream_service_${suffix}`
const PROJECT = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const OTHER_PROJECT = 'b8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const MIGRATION = join(process.cwd(), 'supabase/migrations/20260919120000_dream_issue_reconciliation.sql')

const IDS = {
  instagram: '10000000-0000-4000-8000-000000000001',
  instagramDuplicate: '10000000-0000-4000-8000-000000000002',
  p1Duplicate: '10000000-0000-4000-8000-000000000003',
  stepLogs: '10000000-0000-4000-8000-000000000004',
  stepLogsDuplicate: '10000000-0000-4000-8000-000000000005',
  openActions: '10000000-0000-4000-8000-000000000006',
  unknown: '10000000-0000-4000-8000-000000000007',
  invalidated: '10000000-0000-4000-8000-000000000008',
  cycleA: '10000000-0000-4000-8000-000000000009',
  cycleB: '10000000-0000-4000-8000-000000000010',
  freshEvidence: '10000000-0000-4000-8000-000000000011',
  validEvidence: '10000000-0000-4000-8000-000000000012',
  evidenceReopen: '10000000-0000-4000-8000-000000000013',
  otherProject: '20000000-0000-4000-8000-000000000001',
  observationOnly: '10000000-0000-4000-8000-000000000014',
} as const

const ISSUE_BY_ID = new Map<string, string>([
  [IDS.instagram, 'ig_self_account_id'],
  [IDS.instagramDuplicate, 'critical_escalation_ig_self_account'],
  [IDS.p1Duplicate, 'p1_still_open'],
  [IDS.stepLogs, 'step_logs_missing'],
  [IDS.stepLogsDuplicate, 'critical_escalation_step_logs'],
  [IDS.openActions, 'open_actions'],
  [IDS.unknown, 'legacy_unknown'],
  [IDS.invalidated, 'invalidated_fixture'],
  [IDS.cycleA, 'cycle_a'],
  [IDS.cycleB, 'cycle_b'],
  [IDS.freshEvidence, 'fresh_evidence_fixture'],
  [IDS.validEvidence, 'valid_evidence_fixture'],
  [IDS.evidenceReopen, 'evidence_reopen_fixture'],
  [IDS.otherProject, 'foreign_successor'],
  [IDS.observationOnly, 'observation_only'],
])

let dsn = ''

function run(target: string, args: string[]): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', target, ...args], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90_000,
  })
}

function one(sql: string): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', sql], {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90_000,
  }).trim()
}

function attempt(sql: string, role: string | null = SERVICE_ACTOR): { ok: boolean; out: string; err: string } {
  const setRole = role ? `set local role "${role}";` : ''
  try {
    return { ok: true, out: one(`begin; ${setRole} ${sql}; rollback;`), err: '' }
  } catch (error) {
    return {
      ok: false,
      out: '',
      err: String((error as { stderr?: Buffer }).stderr ?? error),
    }
  }
}

function executeAsService(sql: string): string {
  return one(`set role "${SERVICE_ACTOR}"; ${sql}; reset role;`)
}

function eventSql(options: {
  findingId: string
  eventType: string
  sourceKey: string
  projectId?: string
  actor?: string
  evidenceKind?: string
  locator?: string
  digest?: string
  successorId?: string
}): string {
  const projectId = options.projectId ?? PROJECT
  const identity = ISSUE_BY_ID.get(options.findingId) ?? 'unknown'
  const successorIdentity = options.successorId ? (ISSUE_BY_ID.get(options.successorId) ?? 'unknown') : null
  const columns = [
    'project_id', 'finding_id', 'finding_identity', 'event_type',
    'actor_principal', 'provenance', 'source_key',
  ]
  const values = [
    `'${projectId}'`, `'${options.findingId}'`, `'${identity}'`, `'${options.eventType}'`,
    `'${options.actor ?? 'operator:postgres-fixture'}'`, `'postgres_boundary_fixture'`, `'${options.sourceKey}'`,
  ]
  if (options.evidenceKind) {
    columns.push('evidence_kind', 'evidence_locator')
    values.push(`'${options.evidenceKind}'`, `'${options.locator ?? 'fixture:evidence'}'`)
    if (options.digest) {
      columns.push('evidence_digest')
      values.push(`'${options.digest}'`)
    }
  }
  if (options.successorId) {
    columns.push('superseding_finding_id', 'superseding_finding_identity')
    values.push(`'${options.successorId}'`, `'${successorIdentity}'`)
  }
  return `insert into public.dream_issue_reconciliation_events (${columns.join(',')}) values (${values.join(',')})`
}

function appendEvent(options: Parameters<typeof eventSql>[0]): void {
  executeAsService(eventSql(options))
}

function storedEvents(findingId: string): DreamReconciliationEvent[] {
  const json = one(`
    select coalesce(json_agg(json_build_object(
      'eventId', event_id,
      'eventSeq', event_seq,
      'eventType', event_type,
      'evidenceKind', evidence_kind,
      'evidenceLocator', evidence_locator,
      'evidenceDigest', evidence_digest,
      'supersedingFindingIdentity', superseding_finding_identity,
      'occurredAt', occurred_at,
      'recordedAt', recorded_at
    ) order by event_seq)::text, '[]')
    from public.dream_issue_reconciliation_events
    where finding_id = '${findingId}'
  `)
  return JSON.parse(json) as DreamReconciliationEvent[]
}

function disposition(findingId: string) {
  return reduceDreamDisposition(storedEvents(findingId))
}

const FIXTURE = `
create extension if not exists pgcrypto;
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then begin create role anon nologin; exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then begin create role authenticated nologin; exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then begin create role service_role nologin bypassrls; exception when duplicate_object or unique_violation then null; end; end if;
end
$roles$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table public.projects (
  id uuid primary key,
  slug text unique not null
);
create table public.dream_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  issue_id text not null,
  severity text not null default 'warning',
  latest_insight text not null default '',
  occurrences integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (project_id, issue_id)
);
insert into public.projects (id, slug) values
  ('${PROJECT}', 'ai-media-automation'),
  ('${OTHER_PROJECT}', 'other-project');
insert into public.dream_issues (id, project_id, issue_id, latest_insight) values
  ('${IDS.instagram}', '${PROJECT}', 'ig_self_account_id', 'historical Instagram issue'),
  ('${IDS.instagramDuplicate}', '${PROJECT}', 'critical_escalation_ig_self_account', 'duplicate Instagram issue'),
  ('${IDS.p1Duplicate}', '${PROJECT}', 'p1_still_open', 'duplicate P1 issue'),
  ('${IDS.stepLogs}', '${PROJECT}', 'step_logs_missing', 'step logs remain missing'),
  ('${IDS.stepLogsDuplicate}', '${PROJECT}', 'critical_escalation_step_logs', 'duplicate step issue'),
  ('${IDS.openActions}', '${PROJECT}', 'open_actions', 'aggregate still contains work'),
  ('${IDS.unknown}', '${PROJECT}', 'legacy_unknown', 'legacy unknown'),
  ('${IDS.invalidated}', '${PROJECT}', 'invalidated_fixture', 'model inference'),
  ('${IDS.cycleA}', '${PROJECT}', 'cycle_a', 'cycle fixture A'),
  ('${IDS.cycleB}', '${PROJECT}', 'cycle_b', 'cycle fixture B'),
  ('${IDS.freshEvidence}', '${PROJECT}', 'fresh_evidence_fixture', 'fresh evidence fixture'),
  ('${IDS.validEvidence}', '${PROJECT}', 'valid_evidence_fixture', 'valid evidence fixture'),
  ('${IDS.evidenceReopen}', '${PROJECT}', 'evidence_reopen_fixture', 'evidence reopen fixture'),
  ('${IDS.otherProject}', '${OTHER_PROJECT}', 'foreign_successor', 'foreign project row');
`

beforeAll(() => {
  if (!AVAILABLE) return
  run(ADMIN_URL, ['-c', `create database "${DATABASE}"`])
  dsn = dsnFor(DATABASE)
  run(dsn, ['-c', FIXTURE])
  run(dsn, ['--single-transaction', '-f', MIGRATION])
  run(ADMIN_URL, ['-c', `create role "${SERVICE_ACTOR}" nologin bypassrls in role service_role`])
  run(dsn, ['-c', `insert into public.dream_issues (id, project_id, issue_id, latest_insight) values
    ('${IDS.observationOnly}', '${PROJECT}', 'observation_only', 'new prose only')`])
}, 120_000)

afterAll(() => {
  if (!AVAILABLE) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DATABASE}" with (force)`]) } catch { /* best effort */ }
  try { run(ADMIN_URL, ['-c', `drop role if exists "${SERVICE_ACTOR}"`]) } catch { /* best effort */ }
})

d('Atlas Dream Reconciliation PostgreSQL boundary', () => {
  it('requires a reachable throwaway PostgreSQL database', () => {
    expect(AVAILABLE, 'ATLAS_SQL_TEST_URL must point to throwaway PostgreSQL').toBe(true)
    expect(one('select current_database()')).toBe(DATABASE)
  })

  it('creates one RLS-protected server-only ledger with the expected ACL', () => {
    expect(one(`select relrowsecurity from pg_class where oid='public.dream_issue_reconciliation_events'::regclass`)).toBe('t')
    expect(one(`select count(*) from pg_policies where schemaname='public' and tablename='dream_issue_reconciliation_events'`)).toBe('0')
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        expect(one(`select has_table_privilege('${role}','public.dream_issue_reconciliation_events','${privilege}')`)).toBe('f')
      }
    }
    expect(one(`select has_table_privilege('service_role','public.dream_issue_reconciliation_events','SELECT')`)).toBe('t')
    expect(one(`select has_table_privilege('service_role','public.dream_issue_reconciliation_events','INSERT')`)).toBe('t')
    for (const privilege of ['UPDATE', 'DELETE', 'TRUNCATE']) {
      expect(one(`select has_table_privilege('service_role','public.dream_issue_reconciliation_events','${privilege}')`)).toBe('f')
    }
    expect(attempt('select count(*) from public.dream_issue_reconciliation_events', 'authenticated').ok).toBe(false)
  })

  it('owns deterministic database-assigned replay order without sequence mutation authority', () => {
    expect(one(`select attidentity from pg_attribute where attrelid='public.dream_issue_reconciliation_events'::regclass and attname='event_seq'`)).toBe('a')
    expect(one(`select count(*) from pg_indexes where schemaname='public' and tablename='dream_issue_reconciliation_events' and indexdef like '%UNIQUE%event_seq%'`)).toBe('1')
    expect(one(`select has_sequence_privilege('service_role','public.dream_issue_reconciliation_events_event_seq_seq','USAGE')`)).toBe('t')
    expect(one(`select has_sequence_privilege('service_role','public.dream_issue_reconciliation_events_event_seq_seq','UPDATE')`)).toBe('f')
  })

  it('produces the exact approved deterministic backfill without deleting observations', () => {
    expect(disposition(IDS.instagram)).toMatchObject({ disposition: 'resolved' })
    expect(disposition(IDS.instagramDuplicate)).toMatchObject({ disposition: 'superseded', supersededBy: 'ig_self_account_id' })
    expect(disposition(IDS.p1Duplicate)).toMatchObject({ disposition: 'superseded', supersededBy: 'ig_self_account_id' })
    expect(disposition(IDS.stepLogs)).toMatchObject({ disposition: 'active' })
    expect(disposition(IDS.stepLogsDuplicate)).toMatchObject({ disposition: 'superseded', supersededBy: 'step_logs_missing' })
    expect(disposition(IDS.openActions)).toMatchObject({ disposition: 'active' })
    expect(disposition(IDS.unknown)).toMatchObject({ disposition: 'unverified' })
    expect(one(`select count(*) from public.dream_issues where project_id='${PROJECT}' and issue_id in
      ('ig_self_account_id','critical_escalation_ig_self_account','p1_still_open','step_logs_missing','critical_escalation_step_logs','open_actions')`)).toBe('6')
  })

  it('derives observation-only findings as UNVERIFIED, never ACTIVE', () => {
    expect(storedEvents(IDS.observationOnly)).toEqual([])
    expect(disposition(IDS.observationOnly).disposition).toBe('unverified')
  })

  it('accepts a valid insert and makes project/source idempotency deterministic', () => {
    const sql = eventSql({
      findingId: IDS.observationOnly,
      eventType: 'verification_evidence_recorded',
      evidenceKind: 'runtime_verification',
      locator: 'production-audit:fixture:observation-only',
      digest: HASH_A,
      sourceKey: 'postgres:observation-only:verification',
    })
    executeAsService(`${sql} on conflict (project_id, source_key) do nothing; ${sql} on conflict (project_id, source_key) do nothing`)
    expect(one(`select count(*) from public.dream_issue_reconciliation_events where project_id='${PROJECT}' and source_key='postgres:observation-only:verification'`)).toBe('1')
  })

  it('denies UPDATE, DELETE and TRUNCATE even to the table owner', () => {
    expect(attempt(`update public.dream_issue_reconciliation_events set provenance='changed' where finding_id='${IDS.instagram}'`, null).err).toMatch(/append-only/)
    expect(attempt(`delete from public.dream_issue_reconciliation_events where finding_id='${IDS.instagram}'`, null).err).toMatch(/append-only/)
    expect(attempt('truncate public.dream_issue_reconciliation_events', null).err).toMatch(/append-only/)
  })

  it('binds every write and successor to the exact project', () => {
    const mismatchedFinding = eventSql({
      findingId: IDS.otherProject,
      projectId: PROJECT,
      eventType: 'marked_unverified',
      sourceKey: 'postgres:cross-project:finding',
    })
    expect(attempt(mismatchedFinding).err).toMatch(/finding identity\/project mismatch/)

    const crossProjectSuccessor = eventSql({
      findingId: IDS.cycleA,
      eventType: 'superseded',
      successorId: IDS.otherProject,
      sourceKey: 'postgres:cross-project:successor',
    })
    expect(attempt(crossProjectSuccessor).err).toMatch(/successor identity\/project mismatch/)
  })

  it('denies self-supersession and supersession cycles', () => {
    const self = eventSql({
      findingId: IDS.cycleA,
      eventType: 'superseded',
      successorId: IDS.cycleA,
      sourceKey: 'postgres:supersession:self',
    })
    expect(attempt(self).ok).toBe(false)

    appendEvent({
      findingId: IDS.cycleA,
      eventType: 'superseded',
      successorId: IDS.cycleB,
      sourceKey: 'postgres:supersession:a-to-b',
    })
    const cycle = eventSql({
      findingId: IDS.cycleB,
      eventType: 'superseded',
      successorId: IDS.cycleA,
      sourceKey: 'postgres:supersession:b-to-a',
    })
    expect(attempt(cycle).err).toMatch(/supersession cycle refused/)
  })

  it('rejects AI text, code-search-only and missing-verification resolution', () => {
    const aiText = eventSql({
      findingId: IDS.freshEvidence,
      eventType: 'verification_evidence_recorded',
      evidenceKind: 'ai_text',
      locator: 'dream:free-text',
      sourceKey: 'postgres:evidence:ai-text',
    })
    expect(attempt(aiText).ok).toBe(false)

    const codeSearchOnly = [
      eventSql({
        findingId: IDS.freshEvidence,
        eventType: 'implementation_evidence_recorded',
        evidenceKind: 'artifact',
        locator: 'code-search:matching-string',
        digest: HASH_A,
        sourceKey: 'postgres:evidence:code-search',
      }),
      eventSql({
        findingId: IDS.freshEvidence,
        eventType: 'resolved',
        sourceKey: 'postgres:evidence:code-search-resolved',
      }),
    ].join('; ')
    expect(attempt(codeSearchOnly).err).toMatch(/requires fresh implementation and verification evidence/)
  })

  it('requires evidence newer than the latest activation before RESOLVED', () => {
    appendEvent({
      findingId: IDS.freshEvidence,
      eventType: 'verification_evidence_recorded',
      evidenceKind: 'runtime_verification',
      locator: 'production-audit:fixture:activation',
      digest: HASH_A,
      sourceKey: 'postgres:fresh:activation-evidence',
    })
    appendEvent({ findingId: IDS.freshEvidence, eventType: 'activated', sourceKey: 'postgres:fresh:activated' })
    const staleResolution = eventSql({
      findingId: IDS.freshEvidence,
      eventType: 'resolved',
      sourceKey: 'postgres:fresh:stale-resolution',
    })
    expect(attempt(staleResolution).err).toMatch(/requires fresh implementation and verification evidence/)
  })

  it('accepts fresh implementation plus verification and derives RESOLVED', () => {
    appendEvent({
      findingId: IDS.validEvidence,
      eventType: 'implementation_evidence_recorded',
      evidenceKind: 'artifact',
      locator: 'repo:fixture:implementation',
      digest: HASH_A,
      sourceKey: 'postgres:valid:implementation',
    })
    appendEvent({
      findingId: IDS.validEvidence,
      eventType: 'verification_evidence_recorded',
      evidenceKind: 'regression_test',
      locator: 'repo:fixture:test#exact',
      digest: HASH_B,
      sourceKey: 'postgres:valid:verification',
    })
    appendEvent({ findingId: IDS.validEvidence, eventType: 'resolved', sourceKey: 'postgres:valid:resolved' })
    expect(disposition(IDS.validEvidence).disposition).toBe('resolved')
  })

  it('derives INVALIDATED only after verification and retains every disposition', () => {
    appendEvent({
      findingId: IDS.invalidated,
      eventType: 'verification_evidence_recorded',
      evidenceKind: 'runtime_verification',
      locator: 'production-audit:fixture:invalidated',
      digest: HASH_A,
      sourceKey: 'postgres:invalidated:verification',
    })
    appendEvent({ findingId: IDS.invalidated, eventType: 'invalidated', sourceKey: 'postgres:invalidated:state' })
    expect(disposition(IDS.invalidated).disposition).toBe('invalidated')
    expect(disposition(IDS.instagram).disposition).toBe('resolved')
    expect(disposition(IDS.instagramDuplicate).disposition).toBe('superseded')
    expect(disposition(IDS.stepLogs).disposition).toBe('active')
    expect(disposition(IDS.unknown).disposition).toBe('unverified')
  })

  it('does not let repeated observation prose change terminal or unverified state', () => {
    run(dsn, ['-c', `update public.dream_issues set latest_insight='repeated Dream prose', occurrences=occurrences+1
      where id in ('${IDS.instagram}','${IDS.instagramDuplicate}','${IDS.invalidated}','${IDS.unknown}')`])
    expect(disposition(IDS.instagram).disposition).toBe('resolved')
    expect(disposition(IDS.instagramDuplicate).disposition).toBe('superseded')
    expect(disposition(IDS.invalidated).disposition).toBe('invalidated')
    expect(disposition(IDS.unknown).disposition).toBe('unverified')
  })

  it('allows explicit owner/operator REOPEN but rejects unverified system prose', () => {
    const systemReopen = eventSql({
      findingId: IDS.validEvidence,
      eventType: 'reopened',
      actor: 'system:dream',
      sourceKey: 'postgres:reopen:system-prose',
    })
    expect(attempt(systemReopen).err).toMatch(/requires new regression evidence or explicit owner\/operator action/)
    appendEvent({
      findingId: IDS.validEvidence,
      eventType: 'reopened',
      actor: 'user:00000000-0000-4000-8000-000000000001',
      sourceKey: 'postgres:reopen:explicit-owner',
    })
    expect(disposition(IDS.validEvidence).disposition).toBe('active')
  })

  it('allows system REOPEN only after new post-terminal regression evidence', () => {
    appendEvent({
      findingId: IDS.evidenceReopen,
      eventType: 'implementation_evidence_recorded',
      evidenceKind: 'artifact',
      locator: 'repo:fixture:evidence-reopen-implementation',
      digest: HASH_A,
      sourceKey: 'postgres:evidence-reopen:implementation',
    })
    appendEvent({
      findingId: IDS.evidenceReopen,
      eventType: 'verification_evidence_recorded',
      evidenceKind: 'regression_test',
      locator: 'repo:fixture:evidence-reopen-test#initial',
      digest: HASH_B,
      sourceKey: 'postgres:evidence-reopen:verification',
    })
    appendEvent({ findingId: IDS.evidenceReopen, eventType: 'resolved', sourceKey: 'postgres:evidence-reopen:resolved' })
    appendEvent({
      findingId: IDS.evidenceReopen,
      eventType: 'verification_evidence_recorded',
      evidenceKind: 'runtime_verification',
      locator: 'production-audit:fixture:regression-returned',
      digest: HASH_A,
      sourceKey: 'postgres:evidence-reopen:regression',
    })
    appendEvent({
      findingId: IDS.evidenceReopen,
      eventType: 'reopened',
      actor: 'system:runtime-verifier',
      sourceKey: 'postgres:evidence-reopen:reopened',
    })
    expect(disposition(IDS.evidenceReopen).disposition).toBe('active')
  })
})
