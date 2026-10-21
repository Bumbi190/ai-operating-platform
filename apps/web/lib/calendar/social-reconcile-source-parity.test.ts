import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8')
 .replaceAll('\r\n','\n');
const migration=read('supabase/migrations/20261018071209_social_schedule_batches.sql');
const olderMigration=read('supabase/migrations/20261018070155_social_publication_reconciliation.sql');
const candidate=read('lib/calendar/social-reconcile-revision-candidate.sql');
const name='create or replace function public.social_publication_reconciliation_complete(';
function body(text:string){
 const start=text.indexOf(name),end=text.indexOf('end $fn$;',start);
 if(start<0||end<0)throw Error('Missing final reconciliation function');
 return text.slice(start,end+'end $fn$;'.length);
}
describe('final reconciliation SQL source parity and exact added version operations',()=>{
 it('uses the later scheduled-publication reconciliation override, not its older manual-only version',()=>{
  expect(migration.indexOf(name)).toBeGreaterThan(-1);
  expect(olderMigration.indexOf('create function public.social_publication_reconciliation_complete('))
   .toBeGreaterThan(-1);
  expect(body(migration)).toContain("if r.authority_source='scheduled' then");
  expect(body(migration)).toContain("'receipt_reconciled'");
 });
 it('preserves complete original SQL after removing only source lock and bump',()=>{
  const actual=body(candidate)
   .replace(' -- Source first: inspect itself takes project/publication row locks.\n'+
    ' perform public.calendar_social_source_lock_probe(p_principal,p_input);\n','')
   .replace(' perform public.calendar_social_source_bump_probe(p_principal,p_input);\n','');
  expect(actual).toBe(body(migration));
 });
 it('locks source before inspector locks project and increments only after evidence and job writes',()=>{
  const sql=body(candidate);
  expect(sql.indexOf('calendar_social_source_lock_probe(p_principal,p_input)')).toBeLessThan(
   sql.indexOf('social_publication_reconciliation_inspect'));
  expect(sql.indexOf('calendar_social_source_bump_probe(p_principal,p_input)')).toBeGreaterThan(
   sql.indexOf("insert into public.social_schedule_events"));
  expect(sql.indexOf("if r.state='published' then")).toBeLessThan(
   sql.indexOf('calendar_social_source_bump_probe(p_principal,p_input)'));
  expect((sql.match(/calendar_social_source_bump_probe\(p_principal,p_input\)/g)??[]).length).toBe(1);
 });
});
