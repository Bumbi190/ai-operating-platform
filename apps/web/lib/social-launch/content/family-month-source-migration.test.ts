import {describe,expect,it} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const migration=fs.readFileSync(
 path.resolve(process.cwd(),'../../supabase/migrations/20261020212124_family_month_source_review.sql'),
 'utf8').toLowerCase()
const tables=['family_month_source_candidates','family_month_source_decisions']
describe('private month-source database schema safety contract (unapplied migration)',()=>{
 it('uses real unique candidate/version keys and atomic first decision wins',()=>{
  expect(migration).toContain('unique(project_id, source_month, candidate_sha256)')
  expect(migration).toContain('unique(id, project_id, candidate_sha256)')
  expect(migration).toContain('unique(candidate_id)')
  expect(migration).toContain('foreign key (candidate_id, project_id, candidate_sha256)')
   expect(migration).toContain("check (decision in ('approve','reject'))")
 })
 it('enforces RLS and prevents direct public, anon and authenticated Data API access',()=>{
  for(const table of tables){
   expect(migration).toContain('alter table public.'+table+' enable row level security')
   expect(migration).toContain('revoke all on public.'+table+' from public, anon, authenticated')
   expect(migration).toContain('revoke all on public.'+table+' from service_role')
   expect(migration).toContain('grant select, insert on public.'+table+' to service_role')
  }
  expect(migration).not.toMatch(/create\\s+policy\\b/)
  expect(migration).not.toContain('security definer')
 })
 it('grants no update/delete privilege, no event dispatcher, and no post capability',()=>{
  expect(migration).not.toMatch(/grant\\s+(?:all|update|delete)\\s+on/)
  expect(migration).not.toMatch(/pg_cron|cron\\.schedule|http_post|net\\.http/)
  expect(migration).toContain('create trigger family_month_source_candidate_insert_gate_trigger')
  expect(migration).toContain('create trigger family_month_source_decision_insert_gate_trigger')
  expect(migration).toContain('pg_advisory_xact_lock')
  expect(migration).toContain('latest_id is distinct from new.candidate_id')
  expect(migration).toContain('new.created_at := clock_timestamp()')
  expect(migration).toContain('new.decided_at := clock_timestamp()')
  expect(migration).not.toMatch(/insert\\s+into\\s+public\\.social_content/)
 })
})
