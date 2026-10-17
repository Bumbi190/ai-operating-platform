/** Operator-only synthetic qualification. Never writes admissions or invokes cloud. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {canonicalJson,sha256,parseTask,hashTask} from '../../packages/local-text-contract/index.mjs';import {createRuntime,assertGpuResidency} from '../local-text/runtime.mjs';import {computeAdapterHash} from '../local-text/artifacts.mjs';import {withRuntimeLease} from './worker.mjs';import {PROMPTS,createOllamaClient,renderBoundedPrompt} from './ollama.mjs';
export async function runCorpus({config,fixtures,runtime=createRuntime(config),signal=new AbortController().signal,onProgress=()=>{},checkpoint=async()=>{},residencyCheck=async profile=>assertGpuResidency(await createOllamaClient().ps({signal}),profile.candidateId,profile.modelDigest)}){
 if(!Array.isArray(fixtures)||fixtures.some(f=>f.synthetic!==true))throw Error('SYNTHETIC_CORPUS_REQUIRED');
 for(const f of fixtures)parseTask({kind:f.job.taskType,text:f.job.text,...(f.job.labels?{labels:f.job.labels}:{})});
 const corpusHash=sha256(canonicalJson(fixtures)),schemaHash=sha256(await readFile(new URL('./contracts.mjs',import.meta.url))),reports=[];let stopped=false;await runtime.initialize(signal);
 for(const profile of config.profiles){
  const report={version:2,scope:'local_evaluation_only',seriesStatus:'pending',runId:randomUUID(),createdAt:new Date().toISOString(),candidateId:profile.candidateId,identity:{adapterHash:config.adapterHash,configurationHash:config.configurationHash,runtimeHash:config.runtimeHash,modelDigest:profile.modelDigest,modelBlobSha256:profile.modelBlobSha256,tokenizerEvidenceHash:profile.tokenizerEvidence?sha256(canonicalJson(profile.tokenizerEvidence)):null,corpusHash,schemaHash,rendererHash:sha256(renderBoundedPrompt.toString()),promptHashes:Object.fromEntries(Object.entries(PROMPTS).map(([k,v])=>[k,sha256(v)]))},cases:[]};reports.push(report);
  const fillStopped=()=>{for(const f of fixtures.slice(report.cases.length))report.cases.push({caseId:f.caseId,taskType:f.job.taskType,outcome:{status:'failed',reasonCode:'SERIES_STOPPED',metadata:{dispatchCertainty:'not_started'}}});};
  if(stopped||signal.aborted){stopped=true;fillStopped();report.seriesStatus='not_started';await checkpoint(report);continue;}
  try{await withRuntimeLease(config.runtimeDir,async lease=>{
   const first=fixtures[0],firstClaim={jobId:randomUUID(),modelDigest:profile.modelDigest,task:{kind:first.job.taskType,text:first.job.text,...(first.job.labels?{labels:first.job.labels}:{})}};
   const prepared=await runtime.prepare({claim:firstClaim,lease,signal});await runtime.assertIdentity({claim:firstClaim,prepared,lease,signal});
   for(const fixture of fixtures){
    if(stopped||signal.aborted){stopped=true;break;}
    const task={kind:fixture.job.taskType,text:fixture.job.text,...(fixture.job.labels?{labels:fixture.job.labels}:{})},claim={jobId:randomUUID(),modelDigest:profile.modelDigest,task},start=performance.now(),controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal]),timer=setTimeout(()=>controller.abort(),90000);let outcome;
    try{await residencyCheck(profile);outcome=await runtime.infer({claim,prepared,lease,signal:combined,timeoutMs:Math.max(1,90000-(performance.now()-start))});if(outcome.metadata?.dispatchCertainty==='unknown'){stopped=true;lease.uncertain=true;}else await residencyCheck(profile);}
    finally{clearTimeout(timer);}
    report.cases.push({caseId:fixture.caseId,taskType:task.kind,inputHash:hashTask(task),outcome,wallMs:performance.now()-start});await checkpoint(report);onProgress({candidateId:profile.candidateId,caseId:fixture.caseId,status:outcome.status,reasonCode:outcome.reasonCode??null});
   }
   if(!stopped)await runtime.assertIdentity({claim:firstClaim,prepared,lease,signal});
  });report.seriesStatus=stopped?'reconciling':'completed';}
  catch{stopped=true;report.seriesStatus='unverified';}
  fillStopped();await checkpoint(report);
 }
 return reports;
}
export async function main(args,signal){
 if(process.platform!=='win32'||args.length!==4||args[0]!=='--config'||args[2]!=='--output'||!path.isAbsolute(args[1])||!path.isAbsolute(args[3]))throw Error('INVALID_QUALIFICATION_ARGUMENTS');
 const config=JSON.parse(await readFile(args[1],'utf8'));if(await computeAdapterHash()!==config.adapterHash)throw Error('IDENTITY_CHANGED');
 const fixtures=JSON.parse(await readFile(new URL('./fixtures/sv-atlas-v2.json',import.meta.url),'utf8'));for(const task of ['classify','extract','summarize'])if(fixtures.filter(f=>f.job.taskType===task).length!==25)throw Error('INVALID_CORPUS');
 await mkdir(args[3],{recursive:true});const checkpoint=async report=>{await writeFile(path.join(args[3],report.candidateId.replaceAll(':','-')+'.json'),JSON.stringify(report,null,2)+'\n');};
 const reports=await runCorpus({config,fixtures,signal,checkpoint,onProgress:p=>process.stdout.write(JSON.stringify(p)+'\n')});for(const report of reports){const bytes=await readFile(path.join(args[3],report.candidateId.replaceAll(':','-')+'.json'));process.stdout.write(JSON.stringify({candidateId:report.candidateId,reportSha256:sha256(bytes),cases:report.cases.length})+'\n');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());main(process.argv.slice(2),controller.signal).catch(()=>{process.stderr.write('ATLAS_QUALIFICATION_STOPPED\n');process.exitCode=1;});}
