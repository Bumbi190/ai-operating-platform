import {readFile,stat,realpath,access} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
import {candidate} from './candidates.mjs';import {createOllamaClient} from './ollama.mjs';import {getIdentity,runEvaluation,writeEvidence,loadFixtures,scoreEvaluation,sha256} from './evaluate.mjs';import {qualifyCandidate,chooseLocalRoute} from './qualification.mjs';
import {withRuntimeLease} from './worker.mjs';
const exec=promisify(execFile);const DIR=path.dirname(fileURLToPath(import.meta.url));export const RUNTIME_DIR=path.join(DIR,'.local-runtime');
export function parseArgs(args){
  if(args.length===3&&args[0]==='run'&&args[1]==='--candidate'){try{candidate(args[2]);return{action:'run',candidateId:args[2]};}catch{}}
  if(args.length===7&&args[0]==='assess'&&args[1]==='--report'&&args[3]==='--review'&&args[5]==='--provenance'&&[args[2],args[4],args[6]].every(s=>typeof s==='string'&&s.length))return{action:'assess',report:args[2],review:args[4],provenance:args[6]};
  throw Error('INVALID_COMMAND');
}
const parseJSON=buf=>JSON.parse(buf.toString('utf8').replace(/^\uFEFF/,''));
async function readLocal(file){const resolved=await realpath(path.resolve(file));const root=await realpath(RUNTIME_DIR);if(!resolved.startsWith(root+path.sep)||(await stat(resolved)).size>2097152)throw Error('INVALID_EVIDENCE_PATH');return readFile(resolved);}
async function ownedRuntime(){
  if(process.platform!=='win32')throw Error('WINDOWS_RUNTIME_REQUIRED');
  const journal=parseJSON(await readFile(path.join(RUNTIME_DIR,'owned-server.json')));const install=parseJSON(await readFile(path.join(RUNTIME_DIR,'installation.json')));
  const exe=path.join(RUNTIME_DIR,'ollama-v0.40.5','ollama.exe');
  if(journal.executablePath!==exe||install.version!=='0.40.5'||sha256(await readFile(exe))!==install.executableSha256)throw Error('RUNTIME_IDENTITY_CHANGED');
  const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(DIR,'scripts','runtime.ps1'),'-Action','Status'],{timeout:15000,maxBuffer:65536});
  const status=parseJSON(Buffer.from(result.stdout));if(status.ownedServerAlive!==true||status.portListening!==true)throw Error('SERVER_NOT_OWNED');return{exe,journal,distribution:install};
}
export async function collectGpuEvidence(snapshot,client,runtime,window,execProbe=exec){
  const env={...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1'};
  const deadline=performance.now()+85000;let ps;
  do{ps=await client.ps();if(ps.models?.some(m=>m.name===snapshot.candidateId))break;await delay(100);}while(window.isInFlight()&&performance.now()<deadline);
  if(!window.isInFlight())return{fullyOnGpu:false,duringInference:false,error:'NO_IN_FLIGHT_SAMPLE'};
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  const ownership=`$root=${quote(path.dirname(runtime.exe)+path.sep)}; Get-CimInstance Win32_Process -Filter 'ParentProcessId=${runtime.journal.processId}' | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) } | Select-Object ProcessId,ParentProcessId,ExecutablePath,CreationDate | ConvertTo-Json -Compress`;
  const ownershipResult=execProbe('powershell.exe',['-NoProfile','-NonInteractive','-Command',ownership],{timeout:5000,maxBuffer:65536}).then(value=>({value}),()=>({error:true}));
  const [cli,firstGpu]=await Promise.all([execProbe(runtime.exe,['ps'],{env,timeout:5000,maxBuffer:65536}),execProbe('nvidia-smi',['--query-gpu=name,memory.used,utilization.gpu','--format=csv,noheader'],{timeout:5000,maxBuffer:65536})]);
  let gpu=firstGpu;const utilization=sample=>{const lines=sample.stdout.trim().split(/\r?\n/);return lines.length===1?Number(lines[0].split(',').at(-1).replace('%','').trim()):NaN;};
  let gpuUtilizationPercent=utilization(gpu);let sampleCount=1;
  while(!(gpuUtilizationPercent>0)&&window.isInFlight()&&performance.now()<deadline&&sampleCount<64){await delay(100);gpu=await execProbe('nvidia-smi',['--query-gpu=name,memory.used,utilization.gpu','--format=csv,noheader'],{timeout:5000,maxBuffer:65536});sampleCount++;gpuUtilizationPercent=utilization(gpu);}
  const duringInference=window.isInFlight();const sampledAt=new Date().toISOString();
  // Ownership lookup verifies the same resident runner; its slower completion is not the sample time.
  const ownershipResponse=await ownershipResult;if(ownershipResponse.error)throw Error('RUNNER_LOOKUP_FAILED');const runners=ownershipResponse.value;
  const model=ps.models?.find(m=>m.name===snapshot.candidateId&&m.digest===snapshot.modelDigest);const row=cli.stdout.split(/\r?\n/).find(line=>line.includes(snapshot.candidateId));
  const owned=[parseJSON(Buffer.from(runners.stdout||'null'))].flat().filter(Boolean);const runner=owned[0];
  return {inferenceStartedAt:window.startedAt,sampledAt,ownershipVerifiedAt:new Date().toISOString(),duringInference,gpuUtilizationPercent,sampleCount,ownedRunner:runner?{processId:runner.ProcessId,parentProcessId:runner.ParentProcessId,executablePath:runner.ExecutablePath,createdAt:runner.CreationDate}:null,fullyOnGpu:duringInference&&gpuUtilizationPercent>0&&!!runner&&ps.models?.length===1&&!!model&&model.size>0&&model.size_vram>=model.size&&!!row?.includes('100% GPU'),modelDigest:model?.digest??null,ollamaPs:cli.stdout.trim(),nvidiaSmi:gpu.stdout.trim(),sizeBytes:model?.size??null,sizeVramBytes:model?.size_vram??null};
}
async function ensureIdle(client){
  const ps=await client.ps();for(const m of ps.models??[]){candidate(m.name);await client.unload(m.name);}
  for(let i=0;i<12;i++){if(!(await client.ps()).models?.length)return;await delay(250);}throw Error('MODEL_UNLOAD_UNCONFIRMED');
}
export async function main(args=process.argv.slice(2)) {
  const options=parseArgs(args);const runtime=await ownedRuntime();const client=createOllamaClient();
  if(options.action==='run'){
    let report;
    try{report=await withRuntimeLease(RUNTIME_DIR,async lease=>{await ensureIdle(client);const snapshot={...await client.inspectCandidate(options.candidateId),distribution:runtime.distribution};return runEvaluation({candidateId:options.candidateId,snapshot,runtimeDir:RUNTIME_DIR,client,lease,gpuProbe:(s,w)=>collectGpuEvidence(s,client,runtime,w),onProgress:p=>process.stderr.write(JSON.stringify(p)+'\n')});});}
    catch(e){const fixtures=await loadFixtures();report={version:1,scope:'local_evaluation_only',runId:randomUUID(),createdAt:new Date().toISOString(),identity:{candidateId:options.candidateId},blocked:true,reasonCode:/^[A-Z_]{1,60}$/.test(e.code??e.message)?(e.code??e.message):'LOCAL_PROBE_FAILED',gpu:null,overhead:[],cases:fixtures.map(f=>({caseId:f.caseId,taskType:f.job.taskType,outcome:{status:'failed',reasonCode:'CANDIDATE_BLOCKED',metadata:{wallMs:null}}}))};report.metrics=scoreEvaluation(report,fixtures);}
    const evidence=await writeEvidence(report,RUNTIME_DIR);return {status:report.blocked?'blocked':'pending_review',scope:'local_evaluation_only',...evidence,metrics:report.metrics,reasonCode:report.reasonCode};
  }
  const reportBytes=await readLocal(options.report);const report=parseJSON(reportBytes);const review=parseJSON(await readLocal(options.review));const provenance=parseJSON(await readLocal(options.provenance));
  const snapshot={...await client.inspectCandidate(candidate(report.identity.candidateId)),distribution:runtime.distribution};const currentIdentity=await getIdentity(snapshot);
  const qualification=qualifyCandidate({report,reportBytes,review,provenance,currentIdentity});
  return {status:qualification.approvedTasks.length?'qualified_for_local_tests':'not_qualified',qualification,routes:Object.fromEntries(['classify','extract','summarize'].map(taskType=>[taskType,chooseLocalRoute({workKind:'text',taskType,qualifications:[qualification],currentIdentity})]))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(o=>console.log(JSON.stringify(o))).catch(e=>{console.log(JSON.stringify({status:'rejected',reasonCode:e.message==='INVALID_COMMAND'?'INVALID_COMMAND':'LOCAL_ACCEPTANCE_FAILED',dispatched:false}));process.exitCode=2;});
