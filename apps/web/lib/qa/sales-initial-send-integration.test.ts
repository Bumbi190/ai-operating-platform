import {describe,it,expect} from 'vitest'
import {spawnSync,spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {randomUUID,createHash,randomBytes} from 'node:crypto'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import {createInitialSendWorkerApi} from '@/lib/sales/initial-sending/worker-api'
const database=process.env.SALES_FIXTURE_DATABASE??'',suite=/^sales_[0-9]+$/.test(database)?describe:describe.skip
suite('initial send real SQL / Next / fresh Python',()=>{it('binds exact SMTP payload and recovers crashes or uncertainty without another DATA',async()=>{
 const container=process.env.SALES_FIXTURE_CONTAINER??''
 if(container!=='omnira-sales-sending-20261018')throw Error('UNOWNED_FIXTURE_CONTAINER')
 const sql=(s:string)=>{const r=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d',database],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
 const quote=(v:unknown)=>"'"+String(v).replaceAll("'","''")+"'"
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{if(!/^sales_[a-z_]+$/.test(name))throw Error('RPC_REFUSED');try{return {data:JSON.parse(sql('set role service_role;select to_jsonb('+name+'('+Object.entries(args).map(([k,v])=>k+'=>'+quote(typeof v==='string'?v:JSON.stringify(v))+(typeof v==='string'?'::text':'::jsonb')).join(',')+'));')),error:null}}catch(e){return {data:null,error:{code:String(e).match(/ERROR:\s+([A-Z0-9]{5})/)?.[1]??'XX000'}}}}} as never
 const worker=createInitialSendWorkerApi({db:()=>db,enabled:()=>true})
 for(const mode of ['accepted','lost250','lostHttpReceipt','crashAfterLocalReceipt','rotateAccepted','crashBeforePermit','crashAfterData','pause','revoke','rotate','suppression','newMail','mailbox']){
  const f=JSON.parse(sql("select public.initial_test_initial_fixture('cross-"+randomUUID()+"');"))
  const projectId=f.projectId,userId=f.principal.userId,mailboxId=f.mailboxId,workerId=f.workerId,recipient=f.draft.toEmail,senderEmail=f.draft.senderEmail
  const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex'),stateDirectory=mkdtempSync(join(tmpdir(),'omnira-initial-fixture-'))
  let activeToken=token
  sql("update sales_worker_registrations set token_hash='"+hash+"' where id='"+workerId+"';")
  const input=JSON.parse(sql('select public.initial_test_initial_request('+quote(JSON.stringify(f))+');'))
  const send=JSON.parse(sql('select sales_initial_send_confirm('+quote(JSON.stringify(f.principal))+','+quote(JSON.stringify(input))+');'))
  async function cycle(recovery=false){
   const child=spawn(process.platform==='win32'?'C:\\Python312\\python.exe':'python3',['-u','-m','workers.sales.tests.send_cross_fixture'],{cwd:resolve(process.cwd(),'../..'),stdio:['pipe','pipe','pipe']})
   let result:any,fail:unknown,stderr='',chain=Promise.resolve()
   child.stderr.on('data',x=>stderr+=x)
   createInterface({input:child.stdout}).on('line',line=>{chain=chain.then(async()=>{
    const v=JSON.parse(line)
    if(v.event){expect(v.event).toBe('complete');result=v;return}
    if(v.control){
     if(mode==='pause')sql("update projects set execution_paused=true where id='"+projectId+"';")
     if(mode==='revoke')sql("update sales_worker_registrations set revoked_at=now() where id='"+workerId+"';")
     if(mode==='rotateAccepted'){activeToken=randomBytes(32).toString('base64url');const nextHash=createHash('sha256').update(activeToken).digest('hex');sql("update sales_worker_registrations set token_hash='"+nextHash+"',host_generation=host_generation+1 where id='"+workerId+"';")}
     if(mode==='rotate')sql("update sales_worker_registrations set token_hash=repeat('ef',32),host_generation=host_generation+1 where id='"+workerId+"';")
     if(mode==='suppression')sql("update sales_contacts set data=jsonb_set(data,'{suppressed}','true') where project_id='"+projectId+"';")
     if(mode==='newMail')sql("insert into sales_inbox_messages(project_id,mailbox_id,owner_id,header,text_state,text_selected) values('"+projectId+"','"+mailboxId+"','"+userId+"',"+quote(JSON.stringify({from:recipient,messageId:'<new-initial@example.se>'}))+",'not_selected',false);")
     if(mode==='mailbox')sql("update sales_mailbox_connections set generation=7 where id='"+mailboxId+"';")
     child.stdin.write('{}\n');return
    }
    const response=await worker(new Request('https://fixture.invalid/api/sales/initial-sending/worker',{method:'POST',headers:{authorization:'Bearer '+v.token},body:JSON.stringify(v.body)}))
    const answer=await response.json();child.stdin.write(JSON.stringify(response.ok?answer:{error:answer.code})+'\n')
   }).catch(e=>{fail=e;child.kill()})})
   child.stdin.write(JSON.stringify({token:recovery?activeToken:token,stateDirectory,mailboxId,senderEmail,recipient,kind:'initial',mailboxGeneration:1,subject:f.draft.subject,body:f.draft.body,mode:recovery?'recovery':mode})+'\n')
   const exit=await new Promise((done,reject)=>{child.on('error',reject);child.on('close',done)});await chain;if(fail)throw fail
   expect(stderr).toBe('');expect(exit).toBe(!recovery&&mode==='crashBeforePermit'?24:!recovery&&mode==='crashAfterData'?25:!recovery&&mode==='crashAfterLocalReceipt'?26:0)
   if(result)expect(result.network).toBe(0)
   return result
  }
  try{
   await cycle();const recovered=await cycle(true);expect(recovered.smtp).toBe(0);expect(recovered.data).toBe(0)
   const dataPath=join(stateDirectory,'data-count.json');let count=0;try{count=JSON.parse(readFileSync(dataPath,'utf8')).count}catch{}
   expect(count).toBe(['accepted','lost250','lostHttpReceipt','crashAfterData','crashAfterLocalReceipt','rotateAccepted'].includes(mode)?1:0)
   const status=sql("select status from sales_initial_send_jobs where id='"+send.id+"';")
   expect(status).toBe(['accepted','lostHttpReceipt','crashAfterLocalReceipt','rotateAccepted'].includes(mode)?'smtp_accepted':['lost250','crashAfterData'].includes(mode)?'delivery_unknown':['revoke','rotate'].includes(mode)?'claimed':'failed_before_send')
  }finally{rmSync(stateDirectory,{recursive:true,force:true})}
 }
},240000)})
