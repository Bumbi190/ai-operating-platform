import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const read=(filename:string)=>readFileSync(resolve(process.cwd(),filename),'utf8')
 .replaceAll('\r\n','\n');
const source=read('supabase/migrations/20261018071209_social_schedule_batches.sql');
const candidate=read('lib/calendar/social-worker-claim-revision-candidate.sql');
function extract(sql:string,modified:boolean){
 const marker='create '+(modified?'or replace ':'')+'function public.social_schedule_claim(';
 const start=sql.indexOf(marker);
 if(start<0)throw new Error('Missing '+marker);
 const end=sql.indexOf('end $fn$;',start);
 if(end<0)throw new Error('Missing function terminator');
 return sql.slice(start,end+'end $fn$;'.length);
}
describe('social worker claim source parity',()=>{
 it('preserves the original worker, provider recovery, expiry and authority branches',()=>{
  const original=extract(source,false);
  const modified=extract(candidate,true);
  const restored=modified
   .replace('create or replace function','create function')
   .replace(
    '  -- Source version is locked before project/job rows. Busy sources are skipped.\n'+
    '  if not public.calendar_social_worker_try_source_lock_probe(candidate.project_id)\n'+
    '  then continue;end if;\n','')
   .replaceAll(
    '   perform public.calendar_social_worker_source_bump_probe(candidate.project_id);\n','')
   .replace(
    '  perform public.calendar_social_worker_source_bump_probe(candidate.project_id);\n','');
  expect(restored).toBe(original);
  expect(modified).toContain('social_schedule_authority(j,false)');
  expect(modified).toContain("'receipt_unavailable'");
  expect(modified).toContain("state='uncertain'");
 });
 it('takes source lock before project/job row locks',()=>{
  const sql=extract(candidate,true);
  expect(sql.indexOf('calendar_social_worker_try_source_lock_probe(candidate.project_id)'))
   .toBeLessThan(sql.indexOf('from public.projects where id=candidate.project_id for update skip locked'));
  expect(sql.indexOf('from public.projects where id=candidate.project_id for update skip locked'))
   .toBeLessThan(sql.indexOf('from public.social_schedule_jobs where id=candidate.id'));
 });
 it('bumps source exactly once in all four changing paths, not on dry-run/skip',()=>{
  const sql=extract(candidate,true);
  const bumps=(sql.match(/perform public\.calendar_social_worker_source_bump_probe\(candidate\.project_id\);/g)??[]).length;
  expect(bumps).toBe(4);
  expect(sql.indexOf("if p_input->'dryRun'='true'::jsonb then return null;"))
   .toBeLessThan(sql.indexOf('calendar_social_worker_try_source_lock_probe(candidate.project_id)'));
  expect(sql.indexOf('select * into j from public.social_schedule_jobs'))
   .toBeGreaterThan(sql.indexOf('calendar_social_worker_try_source_lock_probe(candidate.project_id)'));
 });
});
