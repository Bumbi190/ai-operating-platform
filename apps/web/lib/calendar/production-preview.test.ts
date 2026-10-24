import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readCalendarProductionPreview } from './production-preview';
import { findVendoredDefinition } from '../workflows/definitions';
import {automatedObservationTargetHash} from '../workflows/evidence-binding';
const projectId='10000000-0000-4000-8000-000000000001',instanceId='60000000-0000-4000-8000-000000000001';
const actor={userId:'owner',allowedProjectIds:[projectId],projectScopeAvailable:true};
const def=findVendoredDefinition('familje-stunden.monthly-release',2)!;
let rows:Record<string,any[]>;let reads:string[];
function db(){return {from(table:string){reads.push(table);const filters:Record<string,unknown>={};const q:any={};
 q.select=q.order=q.limit=()=>q;q.eq=(key:string,value:unknown)=>{filters[key]=value;return q;};
 const result=()=>({data:(rows[table]??[]).filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v)),error:null});
 q.maybeSingle=async()=>{const value=result();return {...value,data:value.data[0]??null};};
 q.then=(ok:any)=>Promise.resolve(result()).then(ok);return q;}} as never;}
beforeEach(()=>{reads=[];rows={projects:[{id:projectId,owner_id:'owner',execution_paused:false}],workflow_instances:[{
 id:instanceId,project_id:projectId,def_key:def.def_key,def_version:2,def_hash:def.def_hash,
 current_state:'content_generation',instance_key:'2026-11',status:'active',
}],workflow_evidence:[]};});
describe('owner-scoped story production preview',()=>{
 it('derives the brief and preserves missing completion checks',async()=>{
  const result=await readCalendarProductionPreview(db(),actor,{projectId,instanceId});
  expect(result.planningOnly).toBe(true);expect(result.canStart).toBe(false);
  expect(result.brief).toMatchObject({month:'2026-11',theme:'Löv- & Skuggmånaden',pages:{total_pages:18,content_pages:16}});
  expect(result.checks).toHaveLength(3);expect(result.checks.every(c=>c.status==='pending')).toBe(true);
  expect(result.requirements).toContain('execution_approval');expect(result.cost).toBe('unknown');
 });
 it('never reads data for a foreign project',async()=>{
  await expect(readCalendarProductionPreview(db(),actor,{projectId:instanceId,instanceId})).rejects.toMatchObject({code:'NOT_FOUND'});
  expect(reads).toEqual([]);
 });
 it('fails closed when scope lookup failed',async()=>{
  await expect(readCalendarProductionPreview(db(),{...actor,projectScopeAvailable:false},{projectId,instanceId})).rejects.toMatchObject({code:'UNAVAILABLE'});
  expect(reads).toEqual([]);
 });
 it('rechecks ownership even when the earlier scope included the project',async()=>{
  rows.projects[0].owner_id='other';
  await expect(readCalendarProductionPreview(db(),actor,{projectId,instanceId})).rejects.toMatchObject({code:'NOT_FOUND'});
  expect(reads).toEqual(['projects']);
 });
 it('does not reveal an instance belonging to a different project',async()=>{
  rows.workflow_instances[0].project_id='other';
  await expect(readCalendarProductionPreview(db(),actor,{projectId,instanceId})).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 it.each([{def_version:1},{def_hash:'wrong'},{instance_key:'2027-01'},{current_state:'unknown'}])('does not invent a contract for %j',async changes=>{
  Object.assign(rows.workflow_instances[0],changes);
  const result=await readCalendarProductionPreview(db(),actor,{projectId,instanceId});
  expect(result.brief).toBeNull();expect(result.requirements).toContain('supported_contract');
  expect(reads).not.toContain('workflow_evidence');
 });
 it('reports pause, state and closed instance without claiming readiness',async()=>{
  rows.projects[0].execution_paused=true;Object.assign(rows.workflow_instances[0],{current_state:'planning',status:'abandoned'});
  const result=await readCalendarProductionPreview(db(),actor,{projectId,instanceId});
  expect(result.requirements).toEqual(expect.arrayContaining(['project_resumed','content_generation_state','active_instance']));
  expect(result.canStart).toBe(false);
 });
 it('propagates source failure without returning a fabricated empty summary',async()=>{
  const broken={from:vi.fn(()=>{throw new Error('private backend details');})};
  await expect(readCalendarProductionPreview(broken as never,actor,{projectId,instanceId})).rejects.toThrow();
 });
 it.each([
  {changes:{},expected:'satisfied'},
  {changes:{target_hash:'stale'},expected:'needs_attention'},
  {changes:{target_hash:null},expected:'needs_attention'},
  {changes:{result:'fail'},expected:'needs_attention'},
  {changes:{source:'attested'},expected:'needs_attention'},
 ])('projects current evidence honestly: %j',async({changes,expected})=>{
  const instance=rows.workflow_instances[0];
  rows.workflow_evidence=[{id:'evidence',instance_id:instanceId,state:'content_generation',check_key:'story_generated',
   source:'automated',result:'pass',detail:{private_detail:'must not leave server'},recorded_at:'2026-10-24T10:00:00Z',
   producer:null,producer_type:null,observed_at:null,payload_hash:null,attestation:{},
   target_hash:automatedObservationTargetHash(instance as never,def.spec,'content_generation','story_generated'),...changes}];
  const preview=await readCalendarProductionPreview(db(),actor,{projectId,instanceId});
  expect(preview.checks.find(c=>c.key==='story_generated')?.status).toBe(expected);
  expect(JSON.stringify(preview)).not.toContain('private_detail');expect(preview.canStart).toBe(false);
 });
});
