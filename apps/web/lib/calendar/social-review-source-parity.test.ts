import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const source=readFileSync(resolve(process.cwd(),
 'supabase/migrations/20261018071209_social_schedule_batches.sql'),'utf8').replaceAll('\r\n','\n');
const candidate=readFileSync(resolve(process.cwd(),
 'lib/calendar/social-review-revision-candidate.sql'),'utf8').replaceAll('\r\n','\n');

function body(sql:string,name:string,modified:boolean){
 const marker='create '+(modified?'or replace ':'')+'function public.social_schedule_'+name+'(';
 const start=sql.indexOf(marker);
 if(start<0)throw new Error('Missing '+marker);
 const end=sql.indexOf('end $fn$;',start);
 if(end<0)throw new Error('Missing function ending '+marker);
 return sql.slice(start,end+'end $fn$;'.length);
}
describe('original social review SQL preserved except explicit calendar revision calls',()=>{
 for(const name of ['propose','approve','revoke']){
  it(name+' keeps the complete original validation, idempotence and job logic',()=>{
   const expected=body(source,name,false);
   const actual=body(candidate,name,true)
    .replace('create or replace function','create function')
    .replace(' perform public.calendar_social_source_lock_probe(p_principal,p_input);\n','')
    .replace(' perform public.calendar_social_source_bump_probe(p_principal,p_input);\n','');
   expect(actual).toBe(expected);
   const code=body(candidate,name,true);
   expect(code.indexOf('calendar_social_source_lock_probe')).toBeLessThan(
    code.indexOf('from public.projects where id=project for update'));
   expect(code.indexOf('calendar_social_source_bump_probe')).toBeGreaterThan(
    code.indexOf('from public.projects where id=project for update'));
  });
 }
});
