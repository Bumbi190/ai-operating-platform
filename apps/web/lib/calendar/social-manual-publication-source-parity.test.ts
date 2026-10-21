import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const load=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8')
 .replaceAll('\r\n','\n');
const latest=load('supabase/migrations/20261018071209_social_schedule_batches.sql');
const original=load('supabase/migrations/20261016115402_social_manual_publication_v1.sql');
const candidate=load('lib/calendar/social-manual-publication-revision-candidate.sql');
function fn(sql:string,name:'prepare'|'step',replaced:boolean){
 const marker='create '+(replaced?'or replace ':'')+'function public.social_publication_'+name+'(';
 const begin=sql.indexOf(marker);
 const end=sql.indexOf('end $fn$;',begin);
 if(begin<0||end<0)throw Error('Original function absent: '+name);
 return sql.slice(begin,end+'end $fn$;'.length);
}
describe('manual publication original final SQL parity and lock order',()=>{
 for(const name of ['prepare','step'] as const){
  it(name+' preserves exact original function apart from revision lock/bump calls',()=>{
   const sql=fn(candidate,name,true)
    .replace(' -- Lock the owner/project source revision BEFORE existing project/publication row locks.\n'+
     ' perform public.calendar_social_source_lock_probe(p_principal,p_input);\n','')
    .replace(' perform public.calendar_social_source_bump_probe(p_principal,p_input);\n','');
   expect(sql).toBe(fn(latest,name,true));
  });
  it(name+' locks owner/source before project and bumps only after audit',()=>{
   const sql=fn(candidate,name,true);
   expect(sql.indexOf('calendar_social_source_lock_probe(p_principal,p_input)')).toBeLessThan(
    sql.indexOf("from public.projects where id=(p_input->>'projectId')::uuid for update"));
   expect(sql.indexOf('calendar_social_source_bump_probe(p_principal,p_input)')).toBeGreaterThan(
    sql.indexOf('insert into public.social_publication_events('));
   expect((sql.match(/calendar_social_source_bump_probe\(p_principal,p_input\)/g)??[]).length)
    .toBe(1);
  });
 }
 it('uses latest scheduled-authority-aware SQL overlay rather than old manual-only step',()=>{
  expect(fn(latest,'step',true)).toContain("if r.authority_source='scheduled' then");
  expect(fn(latest,'prepare',true)).toContain("if r.authority_source='scheduled' then");
  expect(fn(original,'step',false)).not.toContain("r.authority_source='scheduled'");
  expect(fn(original,'prepare',false)).not.toContain("r.authority_source='scheduled'");
 });
 it('flags service-role direct table UPDATE privilege as an unsolved calendar revision bypass',()=>{
  expect(original).toContain('grant select,insert,update on public.social_publications to service_role;');
  expect(candidate).not.toContain('create trigger');
  // A service-role table writer can still change social_publications outside
  // these RPCs without bumping the calendar source revision.
 });
});
