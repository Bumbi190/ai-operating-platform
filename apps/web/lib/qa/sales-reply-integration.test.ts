import {describe,it,expect} from 'vitest'
import {spawnSync,spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {randomUUID,createHash,randomBytes} from 'node:crypto'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import {createReplyApi} from '@/lib/sales/replies/api'
import {createReplyWorkerApi} from '@/lib/sales/replies/worker-api'
import {handleSalesTool} from '@/lib/sales/atlas-tools'
const database=process.env.SALES_FIXTURE_DATABASE??'',suite=/^sales_[0-9]+$/.test(database)?describe:describe.skip
suite('reply real SQL / Next API / fresh Python isolated runtime',()=>{
 it('persists one exact branch; recovers accepted results and refuses late or uncertain redispatch',async()=>{
  const container=process.env.SALES_FIXTURE_CONTAINER??'omnira-sales-pilot-20261017'
  if(!['omnira-sales-pilot-20261017','omnira-sales-reply-20261018'].includes(container))throw Error('UNOWNED_FIXTURE_CONTAINER')
  const sql=(s:string)=>{const r=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d',database],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
  const quote=(v:unknown)=>`'${String(v).replaceAll("'","''")}'`
  const db={rpc:async(name:string,args:Record<string,unknown>)=>{if(!/^sales_[a-z_]+$/.test(name))throw Error('RPC_REFUSED');try{const a=Object.entries(args).map(([k,v])=>`${k}=>${quote(typeof v==='string'?v:JSON.stringify(v))}${typeof v==='string'?'::text':'::jsonb'}`).join(',');return {data:JSON.parse(sql(`set role service_role;select to_jsonb(${name}(${a}));`)),error:null}}catch(e){return {data:null,error:{code:String(e).match(/ERROR:\s+([A-Z0-9]{5})/)?.[1]??'XX000'}}}}} as never
  const userId='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002'
  const source=readFileSync(resolve(process.cwd(),'supabase/tests/sales_replies.sql'),'utf8').split('set local role service_role;')[0]
  const enabled=()=>true,worker=createReplyWorkerApi({db:()=>db,enabled})
  const post=async(api:(r:Request)=>Promise<Response>,body:unknown,token?:string)=>{const r=await api(new Request('https://fixture.invalid/api/sales/replies',{method:'POST',headers:token?{authorization:'Bearer '+token}:{origin:'https://fixture.invalid'},body:JSON.stringify(body)}));return {code:r.status,body:await r.json()}}
  for(const mode of ['acceptedLostReceipt','crashBeforeComplete','crashAfterComplete','pause','revoke','offer','selection','rotation']){
   const ids=new Map<string,string>(),id=(old:string)=>{if(!ids.has(old))ids.set(old,randomUUID());return ids.get(old)!}
   ids.set(userId,userId);const projectId=id('10000000-0000-4000-8000-000000000001'),conversationId=id('50000000-0000-4000-8000-000000000001'),workerId=id('60000000-0000-4000-8000-000000000091'),messageId=id('90000000-0000-4000-8000-000000000091'),contactId=id('30000000-0000-4000-8000-000000000092'),offerRevisionId=id('40000000-0000-4000-8000-000000000091')
   const token=randomBytes(32).toString('base64url'),managerHash=createHash('sha256').update(randomUUID()).digest('hex'),hash=createHash('sha256').update(token).digest('hex'),stateDirectory=mkdtempSync(join(tmpdir(),'omnira-reply-fixture-'))
   sql(`insert into projects values('${projectId}','${userId}','reply-fixture',false);insert into conversations values('${conversationId}','${userId}','${projectId}');`)
   sql(source.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,id).replace("repeat('8',64)",quote(hash)).replace("repeat('9',64)",quote(managerHash))+'commit;')
   const p={userId,allowedProjectIds:[projectId]},owner=createReplyApi({db:()=>db,enabled,access:async()=>({ok:true as const,...p})}),foreign=createReplyApi({db:()=>db,enabled,access:async()=>({ok:true as const,userId:other,allowedProjectIds:[projectId]})})
   const input={projectId,messageId,messageVersion:1,contactId,contactVersion:1,offerRevisionId,idempotencyKey:randomUUID()}
   expect((await post(foreign,{operation:'prepare',...input,conversationId})).code).toBe(404)
   expect(await handleSalesTool('prepare_sales_reply',{...input,contactId:id('30000000-0000-4000-8000-000000000091')},p,conversationId,db,enabled)).toMatchObject({code:'STOPPED'})
   const job:any=await handleSalesTool('prepare_sales_reply',input,p,conversationId,db,enabled);expect(job).toMatchObject({status:'queued',sendingEnabled:false});expect(await handleSalesTool('prepare_sales_reply',input,p,conversationId,db,enabled)).toMatchObject({id:job.id})
   async function cycle(options:Record<string,unknown>={}){
    const child=spawn(process.platform==='win32'?'C:\\Python312\\python.exe':'python3',['-u','-m','workers.sales.tests.reply_cross_fixture'],{cwd:resolve(process.cwd(),'../..'),stdio:['pipe','pipe','pipe']});let result:any=null,failure:unknown,chain=Promise.resolve(),stderr=''
    child.stderr.on('data',x=>stderr+=x)
    createInterface({input:child.stdout}).on('line',line=>{chain=chain.then(async()=>{
     const v=JSON.parse(line)
     if(v.event){if(v.event!=='complete')throw Error('PYTHON_REPLY_FIXTURE_FAILED:'+v.errorType);result=v;return}
     if(v.control){
      if(mode==='pause')sql(`update projects set execution_paused=true where id='${projectId}';`)
      if(mode==='revoke')sql(`update sales_worker_registrations set revoked_at=now() where id='${workerId}';`)
      if(mode==='offer'){expect(()=>sql(`update sales_offer_revisions set data=data||'{\"offerText\":\"Changed\"}' where id='${offerRevisionId}';`)).toThrow();expect((await post(owner,{operation:'cancel',projectId,jobId:job.id})).code).toBe(200)}
      if(mode==='selection')sql(`update sales_inbox_messages set text_selected=false,version=version+1 where id='${messageId}';`)
      if(mode==='rotation')sql(`select sales_host_rotate('${managerHash}',jsonb_build_object('rotationId',gen_random_uuid(),'newTokenHash',repeat('f',64),'expectedGeneration',1));`)
      child.stdin.write('{}\n');return
     }
     const r=await post(worker,v.body,v.token)
     child.stdin.write(JSON.stringify(r.code===200?r.body:{error:r.body.code})+'\n')
    }).catch(e=>{failure=e;child.kill()})})
    child.stdin.write(JSON.stringify({token,stateDirectory,messageId,...options})+'\n')
    const exit=await new Promise<number|null>((done,reject)=>{child.on('error',reject);child.on('close',done)});await chain;if(failure)throw failure
    expect(stderr,'fresh subprocess stderr').toBe('');expect(exit).toBe(options.crashBeforeComplete?24:options.crashAfterComplete?25:0);if(exit===0)expect(result).toMatchObject({externalCalls:0,smtpCalls:0,imapCalls:0});return result
   }
   try{
    const options=mode==='acceptedLostReceipt'?{loseReceipt:true}:mode==='crashBeforeComplete'?{crashBeforeComplete:true}:mode==='crashAfterComplete'?{crashAfterComplete:true}:{changeDuringRuntime:true}
    const first=await cycle(options);if(first)expect(first.modelCalls).toBe(1)
    const accepted=['acceptedLostReceipt','crashAfterComplete'].includes(mode)
    if(mode==='crashBeforeComplete')sql(`update sales_reply_jobs set lease_until=clock_timestamp()-interval '1 second' where id='${job.id}';`)
    const recovered=await cycle();expect(recovered.modelCalls).toBe(0);expect(recovered.pending).toBe(!accepted&&mode!=='offer')
    expect(sql(`select count(*) from sales_reply_draft_revisions where job_id='${job.id}';`)).toBe(accepted?'1':'0')
    expect(sql(`select attempts from sales_reply_jobs where id='${job.id}';`)).toBe('1')
    if(accepted){const r=await owner(new Request(`https://fixture.invalid/api/sales/replies?projectId=${projectId}`));expect(r.status).toBe(200);const w=await r.json();expect(w.drafts[0]).toMatchObject({body:'Tack för din fråga. Vi återkommer med bekräftat pris.',evidenceIds:[messageId]});expect(w.jobs[0].source.branchName).toBe('Lund');expect(await handleSalesTool('get_sales_reply_job',{projectId,jobId:job.id},p,conversationId,db,enabled)).toMatchObject({status:'awaiting_review',attempts:1,sendingEnabled:false});expect(sql(`select content from approvals where id='${w.drafts[0].approvalId}';`)).not.toContain('Tack för din fråga')}
    expect(sql(`select count(*) from sales_jobs where project_id='${projectId}';`)).toBe('0')
   }finally{rmSync(stateDirectory,{recursive:true,force:true})}
  }
 },180000)
})
