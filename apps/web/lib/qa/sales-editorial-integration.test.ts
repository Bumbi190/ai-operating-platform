import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
import {handleSalesTool} from '@/lib/sales/atlas-tools'
const database=process.env.SALES_FIXTURE_DATABASE??'',container=process.env.SALES_FIXTURE_CONTAINER??''
if(container&&!['omnira-sales-pilot-20261017','omnira-sales-reply-20261018','omnira-sales-sending-20261018'].includes(container))throw Error('UNOWNED_FIXTURE_CONTAINER')
const suite=/^sales_[0-9]+$/.test(database)?describe:describe.skip
suite('editorial-only actual Atlas and PostgreSQL boundary',()=>{
 it('queues only explicit review mode while normal eligibility and send authority stay false',async()=>{
  const sql=(s:string)=>{const r=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout.trim())}
  const q=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
  const f=sql("select sales_regression_fixture('editorial-atlas-integration');")
  sql("select to_jsonb(sales_fixture_review_timing('"+f.projectId+"'));")
  sql("select sales_timing_save_history("+q(f.principal)+",jsonb_build_object('projectId',h.project_id,'contactId','"+f.contactId+"','expectedContactVersion',1,'idempotencyKey',gen_random_uuid(),'expectedPreviousId',h.id,'data',h.data||jsonb_build_object('history','unknown','olderHistoryAttestation',null,'sources',(select jsonb_agg(s||jsonb_build_object('state','gap')) from jsonb_array_elements(h.data->'sources') s)),'confirmed',true)) from sales_contact_history_revisions h where project_id='"+f.projectId+"' order by version desc limit 1;")
  const db={rpc:async(name:string,args:any)=>{try{return {data:sql('select to_jsonb('+name+'('+Object.values(args).map(q).join(',')+'));'),error:null}}catch{return {data:null,error:{code:'55000'}}}}} as never
  const input={projectId:f.projectId,contactIds:f.input.contactIds,offerRevisionId:f.input.offerRevisionId,idempotencyKey:'editorial-integration'}
  const regular:any=await handleSalesTool('prepare_sales_drafts',input,f.principal,f.input.conversationId,db,()=>true)
  expect(regular.code).toBe('STOPPED')
  const result:any=await handleSalesTool('prepare_sales_drafts',{...input,preparationMode:'editorial_only'},f.principal,f.input.conversationId,db,()=>true)
  expect(result.status).toBe('queued')
  expect(result.preparationMode).toBe('editorial_only')
  expect(result.sendingEnabled).toBe(false)
  const workspace:any=await handleSalesTool('get_sales_workspace',{projectId:f.projectId},f.principal,f.input.conversationId,db,()=>true)
  expect(workspace.contactSummary.initialOutreachEligibleCount).toBe(0)
  expect(workspace.jobs[0].preparationMode).toBe('editorial_only')
  expect(workspace.timing.contacts[0].initialPreparationAllowed).toBe(false)
  expect(sql("select to_jsonb(count(*)) from sales_send_jobs where project_id='"+f.projectId+"';")).toBe(0)
 },30000)
})
