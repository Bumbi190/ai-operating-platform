import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {createSalesApi} from '@/lib/sales/api'
import {createSalesWorkerApi} from '@/lib/sales/worker-protocol'
import {handleSalesTool} from '@/lib/sales/atlas-tools'

// Only the disposable database runner supplies this generated name. Never a URL.
if(process.env.SALES_FIXTURE_CONTAINER&&!['omnira-sales-pilot-20261017','omnira-sales-reply-20261018','omnira-sales-sending-20261018'].includes(process.env.SALES_FIXTURE_CONTAINER))throw Error('UNOWNED_FIXTURE_CONTAINER')
const database=process.env.SALES_FIXTURE_DATABASE??''
const suite=/^sales_[0-9]+$/.test(database)?describe:describe.skip
suite('sales slice against real PostgreSQL',()=>{
 it('persists five Atlas drafts across sessions, binds revisions and fences cancellation without mail',async()=>{
  const sql=(statement:string)=>{const r=spawnSync('docker',['exec','-i',(process.env.SALES_FIXTURE_CONTAINER??'omnira-sales-pilot-20261017'),'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d',database],{input:statement,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
  const projectId=randomUUID(),conversationId=randomUUID(),userId='20000000-0000-4000-8000-000000000001',offerId=randomUUID(),contactIds=Array.from({length:5},()=>randomUUID()),principal={userId,allowedProjectIds:[projectId]}
  sql(`insert into projects values('${projectId}','${userId}','sales-fixture',false);insert into conversations values('${conversationId}','${userId}','${projectId}');`)
  const quote=(x:unknown)=>`'${String(x).replaceAll("'","''")}'`
  const db={rpc:async(name:string,args:Record<string,unknown>)=>{
   if(!/^sales_[a-z_]+$/.test(name))throw Error('RPC refused')
   try{
    const parameters=Object.entries(args).map(([k,v])=>`${k} => ${quote(typeof v==='string'?v:JSON.stringify(v))}${typeof v==='string'?'::text':'::jsonb'}`).join(',')
    return {data:JSON.parse(sql(`select to_jsonb(${name}(${parameters}));`)),error:null}
   }catch(e){return {data:null,error:{code:String(e).match(/ERROR:\s+([A-Z0-9]{5})/)?.[1]??'XX000'}}}
  }} as never
  const api=createSalesApi({access:async()=>({ok:true as const,...principal}),db:()=>db,enabled:id=>id===projectId}),worker=createSalesWorkerApi({db:()=>db,enabled:id=>id===projectId})
  const operator=async(value:Record<string,unknown>)=>{const r=await api(new Request('https://fixture.invalid/api/sales',{method:'POST',headers:{origin:'https://fixture.invalid','content-type':'application/json'},body:JSON.stringify({projectId,...value})}));expect(r.status).toBe(200);return r.json()}
  for(const [i,id] of contactIds.entries())await operator({operation:'save_contact',id,expectedVersion:0,companyName:`Testbil ${i+1}`,branchName:i<2?['Nord','Syd'][i]:'',email:i<2?'shared@example.se':`branch${i}@example.se`,websiteUrl:null,history:'not_contacted',historySource:'Synthetic operator-confirmed fixture',pilotMonths:12,confirmed:true,excluded:false,suppressed:false})
  await operator({operation:'save_offer',id:offerId,senderEmail:'info@handlarborsen.se',freeMonths:12,offerText:'12 månader gratis',productFacts:['Stängd B2B-marknadsplats'],confirmed:true})
  const queued:any=await handleSalesTool('prepare_sales_drafts',{projectId,contactIds,offerRevisionId:offerId,idempotencyKey:'five-fixture'},principal,conversationId,db,()=>true)
  expect(queued.status).toBe('queued')
  // A new read/tool invocation simulates reopening the conversation; no chat memory required.
  const reopened:any=await handleSalesTool('get_sales_workspace',{projectId},principal,conversationId,db,()=>true)
  expect(reopened.jobs).toHaveLength(1);expect(reopened.contacts).toHaveLength(5)
  const {token}=await operator({operation:'enroll_worker'})
  const workerCall=async(operation:string,input:Record<string,unknown>={},status=200)=>{const r=await worker(new Request('https://fixture.invalid/api/sales/worker',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({operation,...input})}));expect(r.status).toBe(status);return r.json()}
  const claim=await workerCall('claim'),drafts=[]
  for(const c of claim.snapshot.contacts){await workerCall('commit_research',{...claim.ref,contactId:c.id,evidence:null,question:null});await workerCall('reserve_attempt',{...claim.ref,contactId:c.id,attemptId:randomUUID()});drafts.push({contactId:c.id,contactVersion:c.version,offerRevisionId:offerId,senderEmail:'info@handlarborsen.se',toEmail:c.email,subject:`En fråga till ${c.companyName}`,body:'Vill ni prova 12 månader gratis?',evidenceIds:[],questions:[]})}
  await workerCall('complete',{...claim.ref,drafts})
  const workspace=async()=>{const r=await api(new Request(`https://fixture.invalid/api/sales?projectId=${projectId}`));expect(r.status).toBe(200);return r.json()}
  const prepared=await workspace();expect(prepared.drafts).toHaveLength(5);expect(prepared.sendingEnabled).toBe(false);expect(new Set(prepared.drafts.map((d:any)=>d.contactId)).size).toBe(5)
  const old=prepared.drafts[0],{id,projectId:_,jobId,sha256,approvalId,runId,status,current,createdAt,...draft}=old
  await operator({operation:'revise',revisionId:old.id,draft:{...draft,body:'En ändrad fråga om 12 månader gratis.'}})
  expect(sql(`select resolve_approval('${approvalId}','${runId}','${projectId}','approved',null);`)).toBe('LOST')
  const revised=await workspace();expect(revised.drafts).toHaveLength(5);expect(revised.drafts.find((d:any)=>d.contactId===old.contactId).sha256).not.toBe(sha256)
  const sixth=randomUUID()
  await operator({operation:'save_contact',id:sixth,expectedVersion:0,companyName:'Cancel fixture',branchName:'',email:'cancel@example.se',websiteUrl:null,history:'not_contacted',historySource:'Synthetic fixture',pilotMonths:12,confirmed:true,excluded:false,suppressed:false})
  const second:any=await handleSalesTool('prepare_sales_drafts',{projectId,contactIds:[sixth],offerRevisionId:offerId,idempotencyKey:'cancel-fixture'},principal,conversationId,db,()=>true)
  const late=await workerCall('claim');await operator({operation:'cancel',jobId:second.id});await workerCall('complete',{...late.ref,drafts:[{...drafts[0],contactId:sixth,toEmail:'cancel@example.se'}]},409)
  expect((await workspace()).drafts).toHaveLength(5)
  await handleSalesTool('prepare_sales_drafts',{projectId,contactIds:[sixth],offerRevisionId:offerId,idempotencyKey:'research-fixture'},principal,conversationId,db,()=>true)
  const research=await workerCall('claim'),question='Webbplatsen kunde inte verifieras.'
  await workerCall('commit_research',{...research.ref,contactId:sixth,evidence:null,question})
  await workerCall('reserve_attempt',{...research.ref,contactId:sixth,attemptId:randomUUID()})
  const sixthDraft={...drafts[0],contactId:sixth,toEmail:'cancel@example.se'}
  await workerCall('complete',{...research.ref,drafts:[sixthDraft]},409)
  await workerCall('complete',{...research.ref,drafts:[{...sixthDraft,questions:[question]}]})
  const incomplete=(await workspace()).drafts.find((d:any)=>d.contactId===sixth)
  expect(incomplete.questions).toEqual([question]);expect(incomplete.approvalId).toBeNull();expect(incomplete.status).toBe('needs_input')
  // No provider or SMTP/IMAP adapter exists in this fixture or Pilot A.
  expect(sql(`select count(*) from sales_model_attempts where project_id='${projectId}';`)).toBe('6')
 },30000)
})
