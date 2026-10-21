import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8')
 .replaceAll('\r\n','\n');
const migration=read('supabase/migrations/20261018070155_social_publication_reconciliation.sql');
const candidate=read('lib/calendar/direct-write-gate-proof-inspect-candidate.sql');
const trigger=read('lib/calendar/direct-write-gate-proof-trigger-probe.sql');
const parentGate=read('lib/calendar/direct-write-gate-probe.sql');
function body(src:string,replaced:boolean){
 const marker='create '+(replaced?'or replace ':'')+
  'function public.social_publication_reconciliation_inspect(';
 const start=src.indexOf(marker),end=src.indexOf('end $fn$;',start);
 if(start<0||end<0)throw new Error('Missing latest real SQL inspector');
 return src.slice(start,end+'end $fn$;'.length);
}

describe('real inspector and signed proof-table DML gate contract',()=>{
 it('preserves the entire original inspector function except one source-first lock',()=>{
  const stripped=body(candidate,true)
   .replace('create or replace function','create function')
   .replace(" -- Source lock and transaction signature must precede project/publication locks.\n"+
    " perform public.calendar_source_gate_begin_probe((p_input->>'projectId')::uuid);\n",'');
  expect(stripped).toBe(body(migration,false));
 });
 it('locks the calendar source before project/publication row locks and proof INSERT',()=>{
  const sql=body(candidate,true);
  const gate=sql.indexOf("calendar_source_gate_begin_probe((p_input->>'projectId')::uuid)");
  expect(gate).toBeGreaterThan(0);
  expect(gate).toBeLessThan(sql.indexOf("from public.projects where id=(p_input->>'projectId')::uuid for update"));
  expect(gate).toBeLessThan(sql.indexOf('select * into r from public.social_publications'));
  expect(gate).toBeLessThan(sql.indexOf('insert into public.social_publication_reconciliation_proofs('));
 });
 it('keeps the original Facebook, content, image, account and proof validation',()=>{
  const sql=body(candidate,true);
  expect(sql).toContain("r.channel<>'facebook'");
  expect(sql).toContain("c.draft->>'format'<>'image'");
  expect(sql).toContain('public.social_account_bindings');
  expect(sql).toContain("v->>'accountId' is distinct from r.account_id");
  expect(sql).toContain("v->>'photoId'");
  expect(sql).toContain("v->>'candidateHash'");
  expect(sql).toContain("v->>'createdAt'");
  expect(sql).toContain("v->>'imageUrl'");
 });
 it('adds BEFORE and AFTER change triggers for proof rows without source-lock acquisition in trigger',()=>{
  expect(trigger).toContain('create trigger calendar_gate_reconciliation_proofs_before_probe');
  expect(trigger).toContain('create trigger calendar_gate_reconciliation_proofs_after_probe');
  expect(trigger).toContain('on public.social_publication_reconciliation_proofs');
  expect(trigger).toContain('execute function public.calendar_source_gate_assert_probe()');
  expect(trigger).toContain('execute function public.calendar_source_gate_bump_probe()');
  const begin=parentGate.indexOf('create or replace function public.calendar_source_gate_assert_probe()');
  const end=parentGate.indexOf('end $fn$;',begin);
  const assertBody=parentGate.slice(begin,end);
  expect(assertBody).not.toMatch(/\bfor update\b|\bfor share\b/i);
 });
 it('does not claim proof provenance or revoke privileged insert in this prototype',()=>{
  expect(migration).toContain(
   'grant select,insert on public.social_publication_reconciliation_proofs to service_role;');
  expect(trigger).not.toContain('revoke insert');
  expect(candidate).toContain('grant execute on function public.social_publication_reconciliation_inspect(jsonb,jsonb)');
  // The guard prevents an UNGATED insert and tracks versions. It cannot
  // independently validate that a service_role-minted proof is authentic.
 });
});
