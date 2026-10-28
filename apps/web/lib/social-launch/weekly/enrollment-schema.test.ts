import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const migration=readFileSync(resolve(__dirname,
 '../../../../../docs/sql/20261028_family_weekly_auto_consent_proposed.sql'),'utf8')
const api=readFileSync(resolve(__dirname,
 '../../../app/api/social-weekly-automation/route.ts'),'utf8')
const schedule=readFileSync(resolve(__dirname,
 '../../../components/social-launch/SocialSchedulePanel.tsx'),'utf8')
const gui=readFileSync(resolve(__dirname,
 '../../../components/social-launch/SocialWeeklyAutomationControls.tsx'),'utf8')

describe('Consent migration and review controls — static security contract',()=>{
 it('has RLS with owner-only current project checks and exact scope',()=>{
  expect(migration).toContain('alter table public.family_weekly_auto_consent_events enable row level security')
  expect(migration).toContain("project_id='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid")
  expect(migration).toContain('owner_id=(select auth.uid())')
  expect(migration).toContain('p.owner_id=(select auth.uid())')
  expect(migration).toContain('for select to authenticated')
  expect(migration).toContain('for insert to authenticated')
  expect(migration).not.toMatch(/security definer/i)
 })
 it('no direct update/delete/truncate or anonymous/service mutation',()=>{
  expect(migration).toContain('revoke all on public.family_weekly_auto_consent_events from public,anon,authenticated,service_role')
  expect(migration).toContain('grant select,insert on public.family_weekly_auto_consent_events to authenticated')
  expect(migration).toContain('grant select on public.family_weekly_auto_consent_events to service_role')
  expect(migration).not.toMatch(/grant (?:update|delete|truncate|all) on public.family_weekly_auto_consent_events/i)
  expect(migration).toContain("if tg_op<>'INSERT' then")
 })
 it('hard limits are enforced in SQL independently of HTTP',()=>{
  expect(migration).toContain("valid_until<=created_at+interval '90 days'")
  expect(migration).toContain('check(max_completion_tokens=1800)')
  expect(migration).toContain('check(max_calls_per_week=1)')
  expect(migration).toContain('check(can_schedule=false)')
  expect(migration).toContain('check(can_publish=false)')
  expect(migration).toContain('new.created_at:=clock_timestamp()')
 })
 it('route exposes only owner consent GET and POST, never publisher or cron',()=>{
  expect(api).toContain('familyWeeklyOwnerEnrollmentApi')
  expect(api).toContain('export const GET=')
  expect(api).toContain('export const POST=')
  expect(api).not.toContain('dispatch')
  expect(api).not.toContain('cron')
 })
 it('UI offers explicit confirmed enable and immediate revoke but never a publish button',()=>{
  expect(schedule).toContain('SocialWeeklyAutomationControls')
  expect(gui).toContain('confirmed:true')
  expect(gui).toContain("decide('revoke')")
  expect(gui).toContain('Inget schemaläggs eller publiceras')
  expect(gui).not.toContain('Godkänn och schemalägg veckans inlägg')
 })
})
