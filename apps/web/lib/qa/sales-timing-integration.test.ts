import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
import {handleSalesTool} from '@/lib/sales/atlas-tools'
const database=process.env.SALES_FIXTURE_DATABASE??'',container=process.env.SALES_FIXTURE_CONTAINER??''
if(container&&!['omnira-sales-pilot-20261017','omnira-sales-reply-20261018','omnira-sales-sending-20261018'].includes(container))throw Error('UNOWNED_FIXTURE_CONTAINER')
const suite=/^sales_[0-9]+$/.test(database)?describe:describe.skip
suite('contact timing real database integration',()=>{
 it('Atlas agrees with SQL and saving history never creates a job or sends',async()=>{
  const sql=(s:string)=>{const r=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout.trim())}
  const q=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
  const f=sql("select sales_regression_fixture('timing-api-integration');")
  const db={rpc:async(name:string,args:any)=>{try{return {data:sql('select to_jsonb('+name+'('+Object.values(args).map(q).join(',')+'));'),error:null}}catch{return {data:null,error:{code:'XX000'}}}}} as never
  const before:any=await handleSalesTool('get_sales_workspace',{projectId:f.projectId},f.principal,f.input.conversationId,db,()=>true)
  expect(before.contactSummary.initialOutreachEligibleCount).toBe(0)
  expect(before.timing.contacts[0].reminderCount).toBeNull()
  sql("select to_jsonb(sales_fixture_review_timing('"+f.projectId+"'));")
  const after:any=await handleSalesTool('get_sales_workspace',{projectId:f.projectId},f.principal,f.input.conversationId,db,()=>true)
  expect(after.contactSummary.initialOutreachEligibleCount).toBe(1)
  expect(after.timing.customerSendingEnabled).toBe(false)
  expect(after.jobs).toEqual([])
  expect(sql("select to_jsonb(count(*)) from sales_send_jobs where project_id='"+f.projectId+"';")).toBe(0)
 },30000)
})
