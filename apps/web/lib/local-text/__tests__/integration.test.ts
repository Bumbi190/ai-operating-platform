import {it,expect,vi} from 'vitest'
import {handleLocalTextTool,persistLocalTextToolData} from '../atlas-tools'
import {readLocalTextReview,resolveLocalTextApproval} from '../incidents'
import {createServer} from 'node:https'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {spawn,spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {canonicalJson,sha256,hashTask} from '@omnira/local-text-contract'
import {executeWorkerRequest} from '../worker-api'
import type {Db,WorkerOperation} from '../types'
import {fixtureDb} from './sql-fixture'
import {executeLocalTextCloudRun} from '../cloud-runs'
import {LOCAL_TEXT_QUALIFICATIONS} from '../catalog'
import {qualificationValid} from '../policy'
/** Opt-in, synthetic only. Private fixture DB and ephemeral key/TLS, never production.
 * The independently qualified catalog is real; owner/device/project enrollment
 * is deliberately seeded for an isolated synthetic test, not production authority. */
it.skipIf(process.env.LOCAL_TEXT_E2E!=='1')('atlas_text_to_gpu_review_receipt: actual tool, signed worker, SQL and GPU stay hidden before independent approval',async()=>{
 const root=path.resolve(process.cwd(),'../..'),container=process.env.LOCAL_TEXT_TEST_CONTAINER!,database=process.env.LOCAL_TEXT_TEST_DATABASE!,runtimeRoot=process.env.LOCAL_TEXT_TEST_RUNTIME!,tlsDir=process.env.LOCAL_TEXT_TEST_TLS!
 expect(container).toBe('omnira-atlas-local-text-test-20261017');expect(database).toMatch(/^local_text_task12_e2e_[a-z0-9]+$/);expect(runtimeRoot).toContain('atlas-local-models-20261017');
 function sql(s:string){const r=spawnSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At'],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
 const label=spawnSync('docker',['inspect',container,'--format','{{index .Config.Labels "com.omnira.workstream"}}'],{encoding:'utf8'});expect(label.stdout.trim()).toBe('atlas-local-text-integration-20261017')
 const load=(rel:string)=>import(pathToFileURL(path.join(root,rel)).href)
 const identity=await load('workers/local-text/identity.mjs'),state=await load('workers/local-text/identity-state.mjs'),artifacts=await load('workers/local-text/artifacts.mjs')
 const keyId=randomUUID(),deviceId=randomUUID(),ownerId=randomUUID(),projectId=randomUUID(),conversationId=randomUUID(),jobId=randomUUID(),admissionId=randomUUID(),selectionId=randomUUID(),name='Omnira-Atlas-LocalText-test-'+keyId
 const temporary=await mkdtemp(path.join(root,'.superpowers/sdd/2026-10-17-atlas-local-text-integration/e2e-'));let created=false,server:ReturnType<typeof createServer>|undefined
 const quote=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
 const db=fixtureDb(sql)

 try{
  const key=await identity.createIdentity(name);created=true
  server=createServer({key:await readFile(path.join(tlsDir,'key.pem')),cert:await readFile(path.join(tlsDir,'cert.pem'))},async(req,res)=>{
   try{const chunks:Buffer[]=[];for await(const chunk of req){chunks.push(Buffer.from(chunk));if(chunks.reduce((n,b)=>n+b.length,0)>65536)throw Error('too large')}const operation=req.url?.split('/').at(-1) as WorkerOperation;const request=new Request(origin+req.url,{method:'POST',headers:req.headers as HeadersInit,body:Buffer.concat(chunks)});const response=await executeWorkerRequest(db,request,operation);res.writeHead(response.result.kind==='unknown'?503:200,{'content-type':'application/json'});res.end(JSON.stringify(response));}catch{res.writeHead(403,{'content-type':'application/json'});res.end('{}');}
  });await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('address');const origin='https://127.0.0.1:'+address.port
  const qualificationConfig=JSON.parse(await readFile(process.env.LOCAL_TEXT_QUALIFICATION_CONFIG??path.join(root,'workers/local-models/.local-runtime/atlas-text-qualification/config.json'),'utf8'))
  const evidence=qualificationConfig.profiles.find((p:any)=>p.candidateId==='qwen3.5:9b').tokenizerEvidence
  const runtimeHash=qualificationConfig.runtimeHash,adapterHash=await artifacts.computeAdapterHash()
  expect(adapterHash).toBe(qualificationConfig.adapterHash)
  const config={...qualificationConfig,version:1,origin,deviceId,keyId,buildHash:adapterHash,testIdentityName:name,counterFile:path.join(temporary,'counter.json'),journalFile:path.join(temporary,'attempt.json')}

  await state.initializeCounter(config.counterFile,keyId);const configFile=path.join(temporary,'config.json');await writeFile(configFile,canonicalJson(config))
  const task={kind:'classify' as const,text:'Jag behöver hjälp att återställa mitt lösenord.',labels:['support','annat']},inputHash=hashTask(task)
  const qualified=LOCAL_TEXT_QUALIFICATIONS.find(q=>q.qualification.candidateId==='qwen3.5:9b'&&q.qualification.taskKind==='classify')!
  expect(qualified).toBeDefined();const {qualification:q,evidenceHash}=qualified
  expect(qualificationValid(q,evidenceHash)).toBe(true);expect(q.adapterHash).toBe(adapterHash);expect(q.configurationHash).toBe(config.configurationHash)
  const spec={qualification:q,reviewMode:'human',placement:'cloud_control_review_allowed',policyVersion:'local_assist_v1',jobCostCapUsd:0.25,dailyCostCapUsd:5},deadline=new Date(Date.now()+86400000).toISOString(),context={userId:ownerId,projectId,conversationId,dataClass:'synthetic',placement:'cloud_control_review_allowed',policyVersion:'local_assist_v1',admissionId,deadlineAt:deadline,jobCostCapUsd:0.25,dailyCostCapUsd:5}
  const selection={id:selectionId,jobId,inputHash,projectId,profile:'local_assist_v1',policyVersion:'local_assist_v1',candidateId:'qwen3.5:9b',modelDigest:evidence.modelDigest,deploymentId:admissionId,admissionId,evidenceHash,healthAt:new Date().toISOString(),validUntil:new Date(Date.now()+30000).toISOString(),exclusions:{},totalExpectedCostUsd:null,costUncertainty:['operating_cost_unknown'],fallback:'human'}
  const health={state:'ready',lifecycleLock:'clear',gpuAvailable:true,runtimeVersion:'0.40.5',runtimeHash,adapterHash,configurationHash:config.configurationHash,models:config.profiles.map((p:any)=>({candidateId:p.candidateId,modelDigest:p.modelDigest}))}
  sql(`insert into auth.users(id) values('${ownerId}');insert into projects(id,owner_id) values('${projectId}','${ownerId}');insert into conversations(id,user_id) values('${conversationId}','${ownerId}');insert into local_text_devices(id,owner_id,key_id,public_jwk,build_hash,status,server_origin,pairing_project_id,public_key_fingerprint,enrolled_at,last_heartbeat_at,health_state,reported_health) values('${deviceId}','${ownerId}','${keyId}',${quote(key.publicJwk)},'${adapterHash}','active','${origin}','${projectId}','${sha256(canonicalJson(key.publicJwk))}',now(),now(),'ready',${quote(health)});insert into local_text_admissions(id,project_id,device_id,deployment_id,task_kind,model_digest,evidence_hash,policy_version,status,qualification_status,data_class,approved_input_hashes,configuration,expires_at,approved_by,approved_at) values('${admissionId}','${projectId}','${deviceId}','${admissionId}','classify','${evidence.modelDigest}','${evidenceHash}','local_assist_v1','active','verified','synthetic',array['${inputHash}'],${quote(spec)},now()+interval '1 day','${ownerId}',now());`)
  vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true')
  const input={projectId,idempotencyKey:randomUUID(),task},principal={userId:ownerId,allowedProjectIds:[projectId]}
  const queued:any=await handleLocalTextTool('request_local_text_job',input,principal,conversationId,db,'text')
  expect(queued).toMatchObject({state:'queued',result:null});const actualJob=queued.id
  expect(await handleLocalTextTool('request_local_text_job',input,principal,conversationId,db,'text')).toMatchObject({id:actualJob})
  expect(JSON.stringify(persistLocalTextToolData(input,queued))).not.toContain(task.text)

  const result=await new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{const p=spawn(process.execPath,[path.join(root,'workers/local-text/worker.mjs'),'--once','--config',configFile],{env:{...identity.identityEnvironment(),NODE_EXTRA_CA_CERTS:path.join(tlsDir,'cert.pem')},windowsHide:true});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',code=>resolve({code,stdout,stderr}));})
  expect(result.code,result.stderr).toBe(0);expect(result.stdout,result.stdout).toContain('"kind":"completed"')
  const receipt:any=await handleLocalTextTool('get_local_text_job',{jobId:actualJob},principal,conversationId,db,'text');expect(receipt.state).toBe('reviewing');expect(receipt.result).toBeNull();expect(receipt.reviewStatus).toBe('pending')
  expect(await handleLocalTextTool('get_local_text_job',{jobId:actualJob},{userId:randomUUID(),allowedProjectIds:[projectId]},conversationId,db,'text')).toHaveProperty('error')
  // Same maintenance/claim/executor sequence as the normal drain. Canonical
  // checkpoint + finalization run against real SQL through the fixture adapter.
  const claimed=await db.rpc('claim_runs',{p_limit:1,p_lease_seconds:320});expect(claimed.error).toBeNull()
  const run=(claimed.data as any[])[0];expect(run?.kind).toBe('local_text_cloud')
  await executeLocalTextCloudRun(db,run,run.claim_id,new Date())
  expect(sql(`select status from public.runs where id='${run.id}';`)).toBe('awaiting_approval')
  const approvalId=sql(`select approval_id from local_text_human_reviews where job_id='${actualJob}';`),review=await readLocalTextReview(db,ownerId,approvalId)
  expect(review?.task).toEqual(task);expect(review?.result).toEqual({label:'support'})
  const proof=JSON.parse(sql(`select jsonb_build_object('jobId',id,'attemptId',attempt_id,'inputHash',input_hash,'state',state,'resultHash',result_hash) from local_text_jobs where id='${actualJob}';`));
  await writeFile(path.join(root,'.superpowers/sdd/2026-10-17-atlas-local-text-integration/task12-e2e-evidence.json'),JSON.stringify({scope:'isolated_synthetic_full_continuation',database,...proof,ownerId,projectId,conversationId,approvalId,task,result:review?.result,deviceId,modelDigest:evidence.modelDigest,adapterHash,configurationHash:config.configurationHash,cloudCalls:0,stdout:result.stdout},null,2))

 }finally{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}if(created)await identity.deleteTestIdentity(name);await rm(temporary,{recursive:true,force:true});}
},300000)

// Second phase requires a separate agent's exact-source review artifact. This
// harness cannot create a production admission or substitute unknown for approval.
it.skipIf(process.env.LOCAL_TEXT_E2E_REVIEW!=='1')('independent approved exact source -> durable owner receipt -> expired source cannot reappear',async()=>{
 const root=path.resolve(process.cwd(),'../..'),dir=path.join(root,'.superpowers/sdd/2026-10-17-atlas-local-text-integration'),e=JSON.parse(await readFile(path.join(dir,'task12-e2e-evidence.json'),'utf8')),review=JSON.parse(await readFile(path.join(dir,'task12-e2e-independent-review.json'),'utf8'))
 expect(review).toMatchObject({jobId:e.jobId,inputHash:e.inputHash,resultHash:e.resultHash,status:'approved'});expect(review.reviewerAgentId).not.toBe('/root');expect(review.reviewerAgentId).toMatch(/^\/root\//)
 const literal=(v:unknown)=>typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'"
 function sql(s:string){const r=spawnSync('docker',['exec','-i','omnira-atlas-local-text-test-20261017','psql','-X','-U','postgres','-d',e.database,'-v','ON_ERROR_STOP=1','-At'],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
 const db={rpc:async(n:string,args:Record<string,unknown>)=>{if(!['local_text_resolve_approval','local_text_read_receipt'].includes(n))throw Error();return {data:JSON.parse(sql('select public.'+n+'('+Object.entries(args).map(([k,v])=>k+'=>'+literal(v)).join(',')+');')),error:null}}} as unknown as Db
 const approved=await resolveLocalTextApproval(db,{userId:e.ownerId,approvalId:e.approvalId,decision:'approve',expectedVersion:1});expect(approved).toMatchObject({kind:'applied',value:{state:'succeeded',result:e.result}})
 const receipt:any=await handleLocalTextTool('get_local_text_job',{jobId:e.jobId},{userId:e.ownerId,allowedProjectIds:[e.projectId]},e.conversationId,db,'text');expect(receipt).toMatchObject({state:'succeeded',reviewStatus:'approved',result:e.result})
 expect(sql(`select count(*) from local_text_attempts where job_id='${e.jobId}' and started_at is not null;`)).toBe('1');expect(sql(`select count(*) from cost_events;`)).toBe('0')
 sql(`update local_text_jobs set payload_expires_at=clock_timestamp()-interval '1 second' where id='${e.jobId}';select public.local_text_purge(1);`)
 const expired:any=await handleLocalTextTool('get_local_text_job',{jobId:e.jobId},{userId:e.ownerId,allowedProjectIds:[e.projectId]},e.conversationId,db,'text');expect(expired.result).toBeNull();expect(expired.reasonCode).toBe('PAYLOAD_EXPIRED')
})

it('deliberately withheld paid qualification cannot enqueue or invoke any provider',async()=>{
 vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true');const id=randomUUID(),calls:string[]=[];const db={rpc:async(n:string)=>{calls.push(n);return {data:{kind:'absent'},error:null}}} as unknown as Db
 const result=await handleLocalTextTool('request_local_text_job',{projectId:id,idempotencyKey:randomUUID(),task:{kind:'classify',text:'Syntetisk text',labels:['a','b']}},{userId:id,allowedProjectIds:[id]},id,db,'text');expect(result).toMatchObject({error:'CLOUD_REVIEW_UNVERIFIED'});expect(calls).toEqual(['local_text_existing_request','local_text_human_selection_context'])
})
