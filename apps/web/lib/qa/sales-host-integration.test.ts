import {describe,it,expect} from 'vitest'
import {spawnSync,spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {createSalesApi} from '@/lib/sales/api'
import {createSalesHostApi} from '@/lib/sales/host-api'
import {handleSalesTool} from '@/lib/sales/atlas-tools'
const database=process.env.SALES_FIXTURE_DATABASE??''
const suite=/^sales_[0-9]+$/.test(database)?describe:describe.skip
suite('managed host real PostgreSQL/API/Python recovery',()=>{
 it('recovers one rotation, honors Atlas pause/resume, and rejects revoked secrets without model or mailbox calls',async()=>{
  const sql=(statement:string)=>{const r=spawnSync('docker',['exec','-i','omnira-sales-pilot-20261017','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d',database],{input:statement,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
  const projectId=randomUUID(),conversationId=randomUUID(),userId='20000000-0000-4000-8000-000000000001',p={userId,allowedProjectIds:[projectId]}
  sql(`insert into projects values('${projectId}','${userId}','managed-fixture',false);insert into conversations values('${conversationId}','${userId}','${projectId}');`)
  const quote=(x:unknown)=>`'${String(x).replaceAll("'","''")}'`
  const db={rpc:async(name:string,args:Record<string,unknown>)=>{
   if(!/^sales_[a-z_]+$/.test(name))throw Error('RPC_REFUSED')
   try{const argsSql=Object.entries(args).map(([k,v])=>`${k}=>${quote(typeof v==='string'?v:JSON.stringify(v))}${typeof v==='string'?'::text':'::jsonb'}`).join(',');return {data:JSON.parse(sql(`select to_jsonb(${name}(${argsSql}));`)),error:null}}
   catch(e){return {data:null,error:{code:String(e).match(/ERROR:\s+([A-Z0-9]{5})/)?.[1]??'XX000'}}}
  }} as never
  const api=createSalesApi({db:()=>db,enabled:id=>id===projectId,access:async()=>({ok:true,...p})}),host=createSalesHostApi({db:()=>db,enabled:id=>id===projectId})
  const owner=async(body:unknown)=>{const r=await api(new Request('https://fixture.invalid/api/sales',{method:'POST',headers:{origin:'https://fixture.invalid'},body:JSON.stringify(body)}));expect(r.status).toBe(200);return r.json()}
  const enrolled=await owner({operation:'enroll_worker',projectId});const workerId=enrolled.workerId
  await owner({operation:'authorize_managed_worker',projectId,workerId})
  sql(`update sales_worker_registrations set expires_at=now()+interval '1 hour' where id='${workerId}';`)
  const child=spawn(process.platform==='win32'?'C:\\Python312\\python.exe':'python3',['-u','-m','workers.sales.tests.managed_cross_fixture'],{cwd:resolve(process.cwd(),'../..'),stdio:['pipe','pipe','ignore']})
  let lost=3,complete=false,failure:unknown;let chain=Promise.resolve()
  const lines=createInterface({input:child.stdout})
  lines.on('line',line=>{chain=chain.then(async()=>{
   const v=JSON.parse(line)
   if(v.event){if(v.event==='complete'){complete=true;expect(v).toMatchObject({rotations:1,modelCalls:0,smtpCalls:0,imapCalls:0})}else throw Error('PYTHON_FIXTURE_FAILED');return}
   if(v.control){if(v.control==='revoke')await owner({operation:'revoke_worker',projectId,workerId});else expect(await handleSalesTool('manage_sales_connection',{projectId,workerId,action:v.control},p,conversationId,db,()=>true)).toMatchObject({desiredState:v.control==='pause'?'paused':'running'});child.stdin.write('{}\n');return}
   const response=await host(new Request('https://fixture.invalid/api/sales/host',{method:'POST',headers:{authorization:'Bearer '+v.token},body:JSON.stringify(v.body)}));const result=await response.json()
   child.stdin.write(JSON.stringify(response.status!==200||(v.body.operation==='rotate'&&lost-->0)?{error:true}:result)+'\n')
  }).catch(e=>{failure=e;child.kill()})})
  child.stdin.write(JSON.stringify({origin:'https://fixture.invalid',projectId,workerId,token:enrolled.token,activeRef:'initial',generation:1,expiresAt:enrolled.expiresAt})+'\n')
  const code=await new Promise<number|null>((done,reject)=>{child.on('error',reject);child.on('close',done)});await chain
  if(failure)throw failure;expect(code).toBe(0);expect(complete).toBe(true)
  expect(sql(`select count(*) from sales_host_events where worker_id='${workerId}' and action='rotate';`)).toBe('1')
  expect(sql(`select count(*) from sales_model_attempts where project_id='${projectId}';`)).toBe('0')
 },60000)
})
