import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const load=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8')
 .replaceAll('\r\n','\n');
const migration=load('supabase/migrations/20261018071209_social_schedule_batches.sql');
const candidate=load('lib/calendar/social-release-confirm-revision-candidate.sql');
const name='create function public.social_schedule_release_confirm(';
function body(sql:string,changed:boolean){
 const head=changed?'create or replace function public.social_schedule_release_confirm(':name;
 const begin=sql.indexOf(head),end=sql.indexOf('end $fn$;',begin);
 if(begin<0||end<0)throw Error('Missing release confirmation SQL');
 return sql.slice(begin,end+'end $fn$;'.length);
}
describe('monthly release confirmation original SQL parity',()=>{
 it('keeps exactly the original validation and evidence/audit behavior',()=>{
  const actual=body(candidate,true)
   .replace('create or replace function','create function')
   .replace(' -- Calendar source revision must be locked before the project row.\n'+
    ' perform public.calendar_social_source_lock_probe(p_principal,p_input);\n','')
   .replace(' perform public.calendar_social_source_bump_probe(p_principal,p_input);\n','');
  expect(actual).toBe(body(migration,false));
 });
 it('source lock precedes project lock; source bump follows both audit writes',()=>{
  const sql=body(candidate,true);
  expect(sql.indexOf('calendar_social_source_lock_probe(p_principal,p_input)')).toBeLessThan(
   sql.indexOf("from public.projects where id=(p_input->>'projectId')::uuid for update"));
  expect(sql.indexOf('calendar_social_source_bump_probe(p_principal,p_input)')).toBeGreaterThan(
   sql.indexOf('insert into public.social_schedule_events('));
  expect((sql.match(/calendar_social_source_bump_probe\(p_principal,p_input\)/g)??[]).length)
   .toBe(1);
 });
 it('real worker authority uses verified owner release evidence and a finite validity window',()=>{
  const authorityStart=migration.indexOf('create function public.social_schedule_authority(');
  const authorityEnd=migration.indexOf('end $fn$;',authorityStart);
  expect(authorityStart).toBeGreaterThan(0);
  const sql=migration.slice(authorityStart,authorityEnd);
  expect(sql).toContain('public.social_monthly_release_evidence');
  expect(sql).toContain('e.kind='+"'owner_verified_access'");
  expect(sql).toContain('e.verified_by=a.actor');
  expect(sql).toContain("t-interval '24 hours'");
  expect(sql).toContain('SOCIAL_SCHEDULE_RELEASE_REQUIRED');
 });
 it('original release confirmation has no request idempotency key',()=>{
  const sql=body(migration,false);
  expect(sql).not.toContain('idempotencyKey');
  expect(sql).not.toContain('on conflict');
  expect(sql).toContain('insert into public.social_monthly_release_evidence');
 });
});
