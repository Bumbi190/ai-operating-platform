import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const ROOT='C:/Users/Andre/Projects/Omnira/.worktrees/atlas-voice-recovery-20261016',WS=ROOT+'/.superpowers/sdd/2026-10-19-windows-source-materialization'
const FROZEN='sha256:3c16f0769a58c732a92dc1e7badcf327c86a24eec4bcd559801ba6b9783a3c54',TAG='localhost/omnira-sdf-frozen:'+FROZEN.slice(7)
const PLUGIN='C:/Users/Andre/AppData/Local/Programs/DockerDesktop/resources/cli-plugins/docker-buildx.exe',PLUGIN_SHA='e97f22ffc483857ec876055c0c1f52290ffd3d881e60a4a08e658bd6d39692bb'
const TOOLS={dotnet:['C:/Program Files/dotnet/dotnet.exe','7967467e8bad9c686de2ab2c1994112d5331a7c3d20f0b8a4fff7480221a1c37'],docker:['C:/Users/Andre/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe','6c699720bb9523dedb9eb5d22a49951ea9210dbdb1314a3554029eee9be76896']}
const sha=b=>createHash('sha256').update(b).digest('hex')
export function recoveryRecipe(mode='diagnostic'){
 if(!['diagnostic','corrective'].includes(mode))throw Error('unknown recipe')
 return 'FROM '+TAG+'\nCOPY --chmod=0444 fixture-runner.mjs vitest-fixture.config.mjs'+(mode==='corrective'?' dependency-inventory.mjs':'')+' /opt/omnira/\n'+(mode==='corrective'?'USER 0:0\nRUN ["/bin/chmod","0555","/opt/omnira/deps"]\nUSER 10001:10001\n':'')
}
export function authorizeRecoveryBuild(mode,exists,prior){
 if(exists)throw Error('once-only recovery build already reserved')
 if(mode==='diagnostic')return 1
 const a=prior?.archiveVerification,d=a?.deltas?.[0]
 if(mode==='corrective'&&prior?.status==='failed'&&prior.reason==='fixture_failed'&&prior.containerRemoved===true&&prior.volumeRemoved===true&&prior.diagnosticStage==='dependency-before'&&prior.rootCause==='final-copy-root-mode'&&a.expectedEntries===86893&&a.actualEntries===86893&&a.receiptSha256==='0aeb2cd8a20c5b57c5e2a57283860e0b7d21e07831c90c3ec4b6b923a95d1ed3'&&a.deltas.length===1&&a.extra?.length===0&&d.path==='.'&&d.expected?.type==='directory'&&d.actual?.type==='directory'&&d.expected.mode===365&&d.actual.mode===493&&d.expected.uid===0&&d.expected.gid===0&&d.actual.uid===0&&d.actual.gid===0)return 2
 throw Error('recovery not authorized by exact diagnostic and archive evidence')
}
function checked(p,pin){for(let at=p;;){if(fs.lstatSync(at).isSymbolicLink())throw Error('redirected infrastructure');const parent=path.dirname(at);if(parent===at)break;at=parent}const bytes=fs.readFileSync(p);if(sha(bytes)!==pin)throw Error('infrastructure hash changed');return bytes}
async function main(){
 if(process.platform!=='win32'||process.argv.length!==3||path.resolve(process.cwd()).toLowerCase()!==path.resolve(ROOT).toLowerCase())throw Error('fixed operator entry only')
 const mode=process.argv[2];if(!['diagnostic','corrective'].includes(mode))throw Error('unknown recovery mode')
 const number=mode==='diagnostic'?1:2,receipt=WS+'/recovery-build-'+number+'.json',prior=mode==='corrective'?JSON.parse(fs.readFileSync(WS+'/recovery-diagnosis.json','utf8')):null
 authorizeRecoveryBuild(mode,fs.existsSync(receipt),prior)
 if(mode==='corrective'&&JSON.parse(fs.readFileSync(WS+'/recovery-build-1.json','utf8')).status!=='ready')throw Error('no completed diagnostic image')
 for(const [exe,pin] of Object.values(TOOLS))checked(exe,pin)
 const plugin=checked(PLUGIN,PLUGIN_SHA);if(fs.statfsSync('C:/').bavail*fs.statfsSync('C:/').bsize<8589934592)throw Error('need8GiB')
 const home=WS+'/recovery-config-'+randomUUID(),context=WS+'/recovery-context-'+number
 fs.mkdirSync(context);fs.mkdirSync(home);const owned=fs.lstatSync(home);fs.mkdirSync(home+'/cli-plugins');fs.writeFileSync(home+'/config.json','{}',{flag:'wx'});fs.writeFileSync(home+'/cli-plugins/docker-buildx.exe',plugin,{flag:'wx'})
 const env={SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',HOME:home,USERPROFILE:home,TEMP:home,TMP:home,DOCKER_CONFIG:home,DOTNET_MULTILEVEL_LOOKUP:'0',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'},deadline=Date.now()+900000,commands=[]
 const previous=JSON.parse(fs.readFileSync(WS+'/runtime-resources-after.json','utf8')),original=JSON.parse(fs.readFileSync(WS+'/toolchain-build-resume.json','utf8'))
 let state={schema:'sdf.windows_fixture_recovery_build.v1',number,mode,status:'preflight',startedAt:new Date().toISOString(),frozenParentImageId:FROZEN,localParentTag:TAG,productionAuthority:false}
 async function run(kind,args,log){
  if(Date.now()>=deadline)throw Error('recovery deadline')
  return new Promise((resolve,reject)=>{
   let bytes=0,overflow=false,out=[],err=[];const child=spawn(TOOLS[kind][0],args,{cwd:ROOT,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']})
   const timer=setTimeout(()=>{overflow=true;child.kill()},Math.max(1,deadline-Date.now()))
   const collect=(a,b)=>{bytes+=b.length;if(bytes>8388608){overflow=true;child.kill();return}a.push(b)}
   child.stdout.on('data',b=>collect(out,b));child.stderr.on('data',b=>collect(err,b));child.on('error',e=>{clearTimeout(timer);reject(e)})
   child.on('close',code=>{clearTimeout(timer);const stdout=Buffer.concat(out),stderr=Buffer.concat(err);commands.push({kind,args,code,bytes});if(log)fs.writeFileSync(WS+'/'+log,Buffer.concat([stdout,stderr]),{flag:'wx'});if(code!==0||overflow)reject(Error('recovery command failed '+kind+' '+code));else resolve(stdout)})
  })
 }
 const prefix=['--config',home,'--host','npipe:////./pipe/dockerDesktopLinuxEngine'],docker=(...a)=>run('docker',[...prefix,...a])
 const qualify=async()=>{const h=JSON.parse((await run('dotnet',[ROOT+'/apps/code-broker/.native/windows-host/OmniraBrokerHost.dll','qualify'])).toString());if(h.status!=='qualified_for_health_probe'||h.docker.backendIdentityHash!==previous.host.backendIdentityHash||h.docker.daemonIdentityHash!==previous.host.daemonIdentityHash)throw Error('original peer changed');return h.docker}
 const rows=b=>[...new Set(b.toString().trim().split(/\r?\n/).filter(Boolean))].sort(),resources=async()=>({images:rows(await docker('image','ls','--all','--no-trunc','--quiet')),containers:rows(await docker('ps','-aq','--no-trunc')),volumes:rows(await docker('volume','ls','-q'))})
 try{
  state.before=await qualify();state.resourcesBefore=await resources()
  const parent=JSON.parse((await docker('image','inspect',FROZEN)).toString())[0]
  if(parent.Id!==FROZEN||parent.Os!=='linux'||parent.Architecture!=='amd64'||JSON.stringify(parent.Config)!==JSON.stringify(original.imageConfig))throw Error('frozen image missing or changed')
  state.parentLayers=parent.RootFS.Layers
  const files={'Dockerfile':Buffer.from(recoveryRecipe(mode))}
  for(const name of (mode==='corrective'?['fixture-runner.mjs','vitest-fixture.config.mjs','dependency-inventory.mjs']:['fixture-runner.mjs','vitest-fixture.config.mjs']))files[name]=fs.readFileSync(ROOT+'/apps/code-broker/toolchain/windows-fixture/'+name)
  for(const [name,bytes] of Object.entries(files))fs.writeFileSync(context+'/'+name,bytes,{flag:'wx'})
  state.recipeHashes=Object.fromEntries(Object.entries(files).map(([n,b])=>[n,sha(b)]));state.context=context
  state.status='reserved-before-tag-and-build';fs.writeFileSync(receipt,JSON.stringify(state,null,2),{flag:'wx'})
  const list=(await docker('image','ls','--all','--no-trunc','--format','{{json .}}')).toString().trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s))
  if(!list.some(r=>r.Repository+':'+r.Tag===TAG))await docker('image','tag',FROZEN,TAG)
  if(JSON.parse((await docker('image','inspect',TAG)).toString())[0].Id!==FROZEN)throw Error('owned local tag collision')
  state.status='build-dispatched-once';fs.writeFileSync(receipt,JSON.stringify(state,null,2))
  const iid=WS+'/recovery-image-'+number,metadata=WS+'/recovery-metadata-'+number+'.json'
  await run('docker',[...prefix,'buildx','build','--builder','default','--load','--platform','linux/amd64','--pull=false','--progress=plain','--network=none','--iidfile',iid,'--metadata-file',metadata,'--label','omnira.sdf.node.version=1','--label','omnira.sdf.node.lock='+original.imageConfig.Labels['omnira.sdf.node.lock'],'--label','omnira.sdf.node.recipe='+state.recipeHashes.Dockerfile,'--label','omnira.sdf.node.runner='+state.recipeHashes['fixture-runner.mjs'],'--file',context+'/Dockerfile',context],'recovery-build-'+number+'.log')
  const id=fs.readFileSync(iid,'utf8').trim();if(!/^sha256:[a-f0-9]{64}$/.test(id))throw Error('missing immutable result')
  const image=JSON.parse((await docker('image','inspect',id)).toString())[0]
  if(image.Id!==id||image.Os!=='linux'||image.Architecture!=='amd64'||image.Config.User!=='10001:10001'||JSON.stringify(image.RootFS.Layers.slice(0,state.parentLayers.length))!==JSON.stringify(state.parentLayers)||image.RootFS.Layers.length!==state.parentLayers.length+(mode==='corrective'?2:1))throw Error('frozen layer provenance changed')
  if(JSON.parse((await docker('image','inspect',TAG)).toString())[0].Id!==FROZEN)throw Error('parent tag drift')
  state.after=await qualify();for(const [exe,pin] of Object.values(TOOLS))checked(exe,pin);checked(PLUGIN,PLUGIN_SHA);checked(home+'/cli-plugins/docker-buildx.exe',PLUGIN_SHA)
  state={...state,status:'ready',imageId:id,imageConfig:image.Config,imageLayers:image.RootFS.Layers,buildMetadata:JSON.parse(fs.readFileSync(metadata,'utf8')),resourcesAfter:await resources(),commands,finishedAt:new Date().toISOString()};fs.writeFileSync(receipt,JSON.stringify(state,null,2));console.log(JSON.stringify({status:'ready',number,imageId:id,recipeHashes:state.recipeHashes}))
 }catch(e){state={...state,status:'blocked',reason:e.message,commands,finishedAt:new Date().toISOString()};if(fs.existsSync(receipt))fs.writeFileSync(receipt,JSON.stringify(state,null,2));throw e}
 finally{const s=fs.lstatSync(home);if(s.isSymbolicLink()||s.dev!==owned.dev||s.ino!==owned.ino)throw Error('retained recovery config');fs.rmSync(home,{recursive:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1})