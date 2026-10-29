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
  it('must not cascade deletions of project connection evidence',()=>{
    assert.match(normalized,/references public\.projects\(id\) on delete restrict/)
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
    assert.match(normalized,/revoke all on public\.atlas_owner_github_bindings from public, anon, authenticated/)
    assert.match(normalized,/grant select on public\.atlas_owner_github_bindings to authenticated/)
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
  it('contains no credential material fields and no data mutations',()=>{
    assert.doesNotMatch(normalized,/\b(?:api_key|private_key|secret_token|access_token|password)\s+(?:text|bytea|varchar)/)
    assert.doesNotMatch(normalized,/\b(?:insert into|update public\.|delete from|drop table|alter table.*disable row level security)\b/)
  })
})
function requireSep(){return process.platform==='win32'?'\\':'/'}
