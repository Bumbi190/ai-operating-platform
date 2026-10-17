import {describe,it,expect} from 'vitest'
import {spawnSync,spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {randomUUID,createHash,webcrypto} from 'node:crypto'
import {resolve} from 'node:path'
import {createSalesApi} from '@/lib/sales/api'
import {createSalesHostApi} from '@/lib/sales/host-api'
import {createMailboxApi} from '@/lib/sales/mailbox/api'
import {createMailboxHostApi} from '@/lib/sales/mailbox/host-api'
import {sealMailboxCredentials} from '@/lib/sales/mailbox/seal'
const database=process.env.SALES_FIXTURE_DATABASE??'',suite=/^sales_[0-9]+$/.test(database)?describe:describe.skip
suite('Strato real SQL/API/crypto/Python integration',()=>{
 it('persists only ciphertext, recovers a lost receipt without login retry, fences stale activation, expires only its setup and rejects revoke during probe',async()=>{
  Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true})
  const sql=(s:string)=>{const r=spawnSync('docker',['exec','-i','omnira-sales-pilot-20261017','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d',database],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
  const projectId=randomUUID(),userId='20000000-0000-4000-8000-000000000001',p={userId,allowedProjectIds:[projectId]},canary='PRIVATE_STRATO_INTEGRATION_å🔑'
  sql(`insert into projects values('${projectId}','${userId}','mailbox-fixture',false);`)
  const quote=(x:unknown)=>`'${String(x).replaceAll("'","''")}'`,db={rpc:async(name:string,args:Record<string,unknown>)=>{
   if(!/^sales_[a-z_]+$/.test(name))throw Error('RPC_REFUSED')
   try{const argsSql=Object.entries(args).map(([k,v])=>`${k}=>${quote(typeof v==='string'?v:JSON.stringify(v))}${typeof v==='string'?'::text':'::jsonb'}`).join(',');return {data:JSON.parse(sql(`set role service_role;select to_jsonb(${name}(${argsSql}));`)),error:null}}catch(e){return {data:null,error:{code:String(e).match(/ERROR:\s+([A-Z0-9]{5})/)?.[1]??'XX000'}}}
  }} as never
  const deps={db:()=>db,enabled:(id:string)=>id===projectId},ownerDeps={...deps,access:async()=>({ok:true as const,...p})},sales=createSalesApi(ownerDeps),host=createSalesHostApi(deps),owner=createMailboxApi(ownerDeps),mailbox=createMailboxHostApi(deps)
  const post=async(api:(r:Request)=>Promise<Response>,body:unknown,token?:string)=>{const r=await api(new Request('https://fixture.invalid/api/sales/mailbox',{method:'POST',headers:token?{authorization:'Bearer '+token}:{origin:'https://fixture.invalid'},body:JSON.stringify(body)}));return {code:r.status,body:await r.json()}}
  const enrollment=await post(sales,{operation:'enroll_worker',projectId});expect(enrollment.code).toBe(200);const workerId=enrollment.body.workerId,token='M'.repeat(43)
  expect((await post(sales,{operation:'authorize_managed_worker',projectId,workerId})).code).toBe(200);expect((await post(host,{operation:'adopt',managerTokenHash:createHash('sha256').update(token).digest('hex')},enrollment.body.token)).code).toBe(200)
  const child=spawn(process.platform==='win32'?'C:\\Python312\\python.exe':'python3',['-u','-m','workers.sales.tests.mailbox_cross_fixture'],{cwd:resolve(process.cwd(),'../..'),stdio:['pipe','pipe','ignore']});let chain=Promise.resolve(),failure:unknown,complete=false,publicJwk:JsonWebKey|undefined;const lost=new Set<string>()
  createInterface({input:child.stdout}).on('line',line=>{chain=chain.then(async()=>{
   const v=JSON.parse(line)
   if(v.event){if(v.event!=='complete')throw Error('PYTHON_MAILBOX_FIXTURE_FAILED:'+v.phase+':'+v.errorType);complete=true;expect(v).toMatchObject({fakeSmtpAuth:3,fakeImapAuth:3,realNetworkCalls:0,modelCalls:0});expect(v.privateKeyBytes).toBeLessThanOrEqual(2560);return}
   if(v.control){
    if(v.control==='begin'){const start=await post(owner,{operation:'begin_setup',projectId,workerId,email:v.email});expect(start.code).toBe(200);const sealed=await sealMailboxCredentials(start.body.context,publicJwk!,canary);expect(JSON.stringify(sealed)).not.toContain(canary);const submit=await post(owner,{operation:'submit_sealed',projectId,setupId:start.body.context.setupId,envelope:sealed});expect(submit.code).toBe(200)}
    else if(v.control==='expire'){sql(`update sales_mailbox_setups set expires_at=clock_timestamp()-interval '1 second' where worker_id='${workerId}' and state='waiting_for_host';select sales_mailbox_expire_setups();`);expect(sql(`select count(*) from sales_mailbox_setups where worker_id='${workerId}' and sealed is not null;`)).toBe('0')}
    else if(v.control==='revoke')expect((await post(sales,{operation:'revoke_worker',projectId,workerId})).code).toBe(200)
    else throw Error('CONTROL_REFUSED');child.stdin.write('{}\n');return
   }
   if(v.body.operation==='publish_key')publicJwk=v.body.jwk
   const r=await post(mailbox,v.body,v.token)
   const shouldLose=v.body.operation==='commit_probe'&&r.code===200&&!lost.has(v.body.setupId)
   if(shouldLose)lost.add(v.body.setupId)
   child.stdin.write(JSON.stringify(shouldLose?{error:'UNAVAILABLE'}:r.code!==200?{error:r.body.code}:r.body)+'\n')
  }).catch(e=>{failure=e;child.kill()})})
  child.stdin.write(JSON.stringify({token,node:process.execPath,canary,canaryHash:createHash('sha256').update(canary).digest('hex')})+'\n')
  const code=await new Promise<number|null>((done,reject)=>{child.on('error',reject);child.on('close',done)});await chain;if(failure)throw failure;expect(code).toBe(0);expect(complete).toBe(true)
  expect(sql(`select count(*) from sales_model_attempts where project_id='${projectId}';`)).toBe('0');expect(sql(`select count(*) from sales_mailbox_setups where project_id='${projectId}' and sealed::text like '%PRIVATE_STRATO%';`)).toBe('0')
 },60000)
})
