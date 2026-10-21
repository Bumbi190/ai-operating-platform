import {describe,it,expect} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Build an explicit migration-order SQL writer inventory, not a claim of
// automatic coverage for dynamic SQL, triggers or external provider changes.
const migrations=resolve(process.cwd(),'supabase/migrations');
const files=readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort();
const effective=new Map<string,{file:string;body:string}>();
const definition=/\bcreate\s+(?:or\s+replace\s+)?function\s+public\.([a-z_]\w*)\s*\(/gi;
for(const file of files){
 const source=readFileSync(resolve(migrations,file),'utf8');
 for(const match of source.matchAll(definition)){
  const end=source.slice(match.index).match(/\bend\s+\$fn\$\s*;/i);
  if(!end || end.index===undefined)continue;
  const body=source.slice(match.index,match.index+end.index+end[0].length);
  effective.set(match[1],{file,body});
 }
}
function writers(table:string){
 const pattern=new RegExp('\\b(?:insert\\s+into|update|delete\\s+from)\\s+(?:public\\.)?'+table+'\\b','gi');
 const result:string[]=[];
 for(const [name,definition] of effective){
  const sql=definition.body.split('\n').map(line=>line.split('--')[0]).join('\n');
  const matches=[...sql.matchAll(pattern)];
  if(matches.length)result.push(name+':'+matches.length);
 }
 return result.sort();
}
function original(name:string){
 const found=effective.get(name);
 if(!found)throw Error('Missing effective function '+name);
 return found;
}

describe('effective social DML writer inventory must be reviewed before a direct-write trigger release',()=>{
 it('documents every effective SQL function directly writing social_publications',()=>{
  expect(writers('social_publications')).toEqual([
   'social_publication_prepare:1',
   'social_publication_reconciliation_complete:1',
   'social_publication_step:1',
   'social_schedule_cancel_jobs:1',
   'social_schedule_claim:1',
   'social_schedule_recover_checkpoint:1',
   'social_schedule_step:3'
  ]);
 });
 it('documents every effective SQL function directly writing social_schedule_jobs',()=>{
  expect(writers('social_schedule_jobs')).toEqual([
   'social_publication_reconciliation_complete:1',
   'social_schedule_approve:1',
   'social_schedule_cancel_jobs:1',
   'social_schedule_claim:4',
   'social_schedule_recover_checkpoint:1',
   'social_schedule_step:1'
  ]);
 });
 it('derives manual publication and receipt writers from their LATEST migration overlay',()=>{
  for(const name of [
   'social_publication_prepare',
   'social_publication_step',
   'social_publication_reconciliation_complete',
   'social_schedule_claim'
  ])expect(original(name).file).toBe('20261018071209_social_schedule_batches.sql');
  expect(original('social_schedule_recover_checkpoint').file)
   .toBe('20261018073425_social_schedule_checkpoint_recovery.sql');
 });
 it('records direct service_role DML grants that an RPC-only gate CANNOT prevent',()=>{
  const manual=readFileSync(resolve(migrations,
   '20261016115402_social_manual_publication_v1.sql'),'utf8');
  const social=readFileSync(resolve(migrations,
   '20261018071209_social_schedule_batches.sql'),'utf8');
  expect(manual).toContain('grant select,insert,update on public.social_publications to service_role;');
  expect(social).toContain('grant update on public.social_schedule_jobs to service_role;');
  expect(social).toContain('grant select,insert on public.social_schedule_decisions to service_role;');
  // These grants are still required by the existing SECURITY INVOKER functions.
  // Do not revoke them in isolation: migration must be all-or-nothing.
 });
 it('manual RPCs under signed trigger gate MUST NOT also explicitly bump revisions',()=>{
  const source=readFileSync(resolve(process.cwd(),
   'lib/calendar/direct-write-gate-manual-integration-probe.sql'),'utf8');
  const gate=readFileSync(resolve(process.cwd(),
   'lib/calendar/direct-write-gate-probe.sql'),'utf8');
  expect((source.match(/calendar_source_gate_begin_probe/g)??[]).length).toBe(2);
  expect(source).not.toContain('calendar_social_source_bump_probe(');
  expect((gate.match(/after insert or update or delete on public\.social_/g)??[]).length)
   .toBe(2);
  expect((gate.match(/before insert or update or delete on public\.social_/g)??[]).length)
   .toBe(2);
 });
});
