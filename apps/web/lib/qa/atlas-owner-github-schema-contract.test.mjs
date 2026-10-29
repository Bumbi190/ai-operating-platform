import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const proposal = fileURLToPath(new URL('../../../../docs/architecture/proposed-sql/atlas_owner_github_bindings_stage1_PROPOSAL.sql', import.meta.url))
const source = readFileSync(proposal,'utf8')
const sql = source.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'')
const normalized=sql.toLowerCase().replace(/\s+/g,' ')
const table='public.atlas_owner_github_bindings'

describe('GitHub connection proposal: static offline contract, NOT a real migration',()=>{
  it('is parked outside canonical migration directory by design',()=>{
    assert.equal(proposal.includes('docs'+requireSep()+'architecture'+requireSep()+'proposed-sql'),true)
    assert.equal(proposal.includes(requireSep()+'supabase'+requireSep()+'migrations'+requireSep()),false)
    assert.match(source,/NOT A CANONICAL MIGRATION/)
    assert.match(source,/DO NOT EXECUTE AGAINST PRODUCTION/)
  })
  it('defines owner and project identity plus GitHub numeric IDs',()=>{
    assert.ok(normalized.includes('create table '+table))
    for(const column of ['project_id uuid not null','owner_user_id uuid not null',
      'installation_id bigint not null','repository_id bigint not null',
      'repository_owner_id bigint not null','approved_by uuid',
      'approved_at timestamptz','state text not null']){
      assert.ok(normalized.includes(column),column)
    }
  })
  it('enforces immutable project AND owner with a composite foreign key',()=>{
    assert.match(normalized,/unique index atlas_github_projects_id_owner_key/)
    assert.match(normalized,/on public\.projects\(id,owner_id\)/)
    assert.match(normalized,/foreign key \(project_id,owner_user_id\)/)
    assert.match(normalized,/references public\.projects\(id,owner_id\) on delete restrict/)
    assert.doesNotMatch(normalized,/references public\.projects\(id\) on delete cascade/)
  })
  it('enables RLS and restricts owner read by both project and user ID',()=>{
    assert.ok(normalized.includes('alter table '+table+' enable row level security'))
    assert.match(normalized,/for select to authenticated/)
    assert.match(normalized,/owner_user_id = \(select auth\.uid\(\)\)/)
    assert.match(normalized,/p\.id = atlas_owner_github_bindings\.project_id/)
    assert.match(normalized,/p\.owner_id = \(select auth\.uid\(\)\)/)
  })
  it('qualifies the outer project id to avoid future SQL column shadowing',()=>{
    assert.match(normalized,/p\.id = atlas_owner_github_bindings\.project_id/)
    assert.doesNotMatch(normalized,/p\.id = project_id/)
  })
  it('does not grant mutate, run functions or unsafe bypass to public clients',()=>{
    assert.match(normalized,/revoke all on public\.atlas_owner_github_bindings from public, anon, authenticated, service_role/)
    assert.match(normalized,/grant select on public\.atlas_owner_github_bindings to authenticated/)
    assert.match(normalized,/grant select on public\.atlas_owner_github_bindings to service_role/)
    assert.doesNotMatch(normalized,/grant\s+(?:insert|update|delete|all)/)
    assert.doesNotMatch(normalized,/create\s+(?:or replace\s+)?function|security definer|migration_guard_override/)
  })
  it('requires explicit owner approval before a record can become active',()=>{
    assert.match(normalized,/state <> 'approved' or/)
    assert.match(normalized,/approved_by = owner_user_id/)
    assert.match(normalized,/approved_at is not null/)
    assert.match(normalized,/revoked_at is null/)
  })
  it('enforces single active repo per project and unique repo per owner',()=>{
    assert.match(normalized,/unique index atlas_owner_github_one_active_project/)
    assert.match(normalized,/unique index atlas_owner_github_one_active_repo/)
    assert.match(normalized,/where state='approved'/)
  })
  it('replays the observed Supabase default-ACL privilege risk in a synthetic PG17 fixture',()=>{
    const path=fileURLToPath(new URL('./fixtures/atlas-owner-github-rls/bootstrap_pg17.sql',import.meta.url))
    const fixture=readFileSync(path,'utf8').toLowerCase().replace(/\s+/g,' ')
    assert.match(fixture,/alter default privileges in schema public/)
    assert.match(fixture,/grant all on tables to anon, authenticated, service_role/)
    assert.ok(normalized.includes('revoke all on public.atlas_owner_github_bindings from public, anon, authenticated, service_role'))
  })
  it('documents a real PostgreSQL role-denial replay with a networkless disposable runner',()=>{
    const verifier=readFileSync(fileURLToPath(new URL('./fixtures/atlas-owner-github-rls/verify_pg17.sql',import.meta.url)),'utf8')
    const runner=readFileSync(fileURLToPath(new URL('../../../../scripts/atlas/verify-owner-github-pg17-rls.ps1',import.meta.url)),'utf8')
    assert.match(verifier,/foreign_key_violation/)
    assert.ok(verifier.includes("has_table_privilege('service_role'"))
    assert.match(verifier,/set role authenticated/)
    assert.match(verifier,/set role anon/)
    assert.match(verifier,/set role pling_executor/)
    assert.match(runner,/--network none --memory 256m/)
    assert.ok(runner.includes('--rm -d --name $name'))
    assert.ok(runner.includes('finally {'))
    assert.ok(runner.includes('docker stop --time 1 $name'))
    assert.doesNotMatch(runner,/--publish|--privileged|--volume/)
  })
  it('rehearses the schema install as an atomic, time-bounded transaction',()=>{
    const runner=readFileSync(fileURLToPath(new URL('../../../../scripts/atlas/verify-owner-github-pg17-rls.ps1',import.meta.url)),'utf8')
    assert.ok(runner.includes('psql -X --single-transaction'))
    assert.ok(runner.includes('PGOPTIONS=-c lock_timeout=2000 -c statement_timeout=15000'))
    assert.ok(runner.includes("Dest = '/var/tmp/proposal_pg17.sql'"))
    assert.doesNotMatch(runner,/CREATE INDEX CONCURRENTLY|MIGRATION_GUARD_OVERRIDE/)
  })
  it('verifies synthetic rollback preserves existing users, projects and ownership RLS',()=>{
    const rollback=readFileSync(fileURLToPath(new URL('./fixtures/atlas-owner-github-rls/rollback_pg17.sql',import.meta.url)),'utf8')
    const runner=readFileSync(fileURLToPath(new URL('../../../../scripts/atlas/verify-owner-github-pg17-rls.ps1',import.meta.url)),'utf8')
    assert.ok(runner.includes("Dest = '/var/tmp/rollback_pg17.sql'"))
    assert.ok(rollback.includes('drop table public.atlas_owner_github_bindings restrict'))
    assert.ok(rollback.includes('drop index public.atlas_github_projects_id_owner_key restrict'))
    assert.ok(rollback.includes("policyname='projects_owner'"))
    assert.ok(rollback.includes("count(*) into project_count from public.projects"))
    assert.ok(rollback.includes("count(*) into user_count from auth.users"))
    assert.ok(rollback.includes("set local lock_timeout = '2s'"))
  })
  it('marks owner/project deletion and retention design as an unresolved release blocker',()=>{
    const verifier=readFileSync(fileURLToPath(new URL('./fixtures/atlas-owner-github-rls/verify_pg17.sql',import.meta.url)),'utf8')
    const plan=readFileSync(fileURLToPath(new URL('../../../../docs/architecture/atlas-owner-github-migration-release-plan-20261029.md',import.meta.url)),'utf8')
    assert.ok(verifier.includes('EXPECTED BLOCKER: active bindings prevent project deletion'))
    assert.ok(verifier.includes('EXPECTED BLOCKER: active bindings prevent user deletion/cascade'))
    assert.ok(plan.includes('Data deletion and owner transfer conflict'))
    assert.ok(plan.includes('NEVER'))
    assert.ok(plan.toLowerCase().includes('do not'))
  })
  it('contains no credential material fields and no data mutations',()=>{
    assert.doesNotMatch(normalized,/\b(?:api_key|private_key|secret_token|access_token|password)\s+(?:text|bytea|varchar)/)
    assert.doesNotMatch(normalized,/\b(?:insert into|update public\.|delete from|drop table|alter table.*disable row level security)\b/)
  })
})
function requireSep(){return process.platform==='win32'?'\\':'/'}
