import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {validateContextPaths,validateLock,validateRecipe,verifyDescriptor,FIXED_DESCRIPTOR_PINS as PINS,FIXED_NODE_BASE as NODE_BASE} from './provision-windows-toolchain.mjs'
const ROOT='C:/Users/Andre/Projects/Omnira/.worktrees/atlas-voice-recovery-20261016',WS=ROOT+'/.superpowers/sdd/2026-10-19-windows-source-materialization'
const PLUGIN='C:/Users/Andre/AppData/Local/Programs/DockerDesktop/resources/cli-plugins/docker-buildx.exe',PLUGIN_SHA='e97f22ffc483857ec876055c0c1f52290ffd3d881e60a4a08e658bd6d39692bb'
const CONTEXT=WS+'/build-context-37b7c587-fca1-40fb-8562-5ffb9306b02a'
const TOOLS={dotnet:['C:/Program Files/dotnet/dotnet.exe','7967467e8bad9c686de2ab2c1994112d5331a7c3d20f0b8a4fff7480221a1c37'],docker:['C:/Users/Andre/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe','6c699720bb9523dedb9eb5d22a49951ea9210dbdb1314a3554029eee9be76896']}
const sha=b=>createHash('sha256').update(b).digest('hex')
export function authorizeUnstartedBuildResume(state,log,iidExists){
 if(state?.status!=='blocked'||state.reason!=='fixed setup command failed docker exit 125'||!Array.isArray(state.commands)||state.commands.length!==11||state.commands[9].kind!=='docker'||state.commands[9].code!==0||state.commands[10].kind!=='docker'||state.commands[10].code!==125||iidExists||!log.includes('DEPRECATED: The legacy builder')||!log.includes('unknown flag: --progress'))throw Error('not a proved undispatched build')
 return {pull:false,build:true}
}
function checkedFile(p,pin){
 for(let at=p;;){const s=fs.lstatSync(at);if(s.isSymbolicLink())throw Error('tool path redirected');const parent=path.dirname(at);if(parent===at)break;at=parent}
 const bytes=fs.readFileSync(p);if(sha(bytes)!==pin)throw Error('tool hash drift');return bytes
}
async function main(){
 if(process.platform!=='win32'||process.argv.length!==2||path.resolve(process.cwd()).toLowerCase()!==path.resolve(ROOT).toLowerCase())throw Error('fixed operator reconciliation only')
 const originalBytes=fs.readFileSync(WS+'/toolchain-setup-attempt.json'),prior=JSON.parse(originalBytes),reconciliation=JSON.parse(fs.readFileSync(WS+'/toolchain-setup-reconciliation.json','utf8'))
 authorizeUnstartedBuildResume(prior,fs.readFileSync(WS+'/toolchain-build.log','utf8'),fs.existsSync(WS+'/toolchain-image-id'))
 if(prior.context!==CONTEXT||reconciliation.sameBackendAndDaemon!==true||reconciliation.contextPaths.length!==8||reconciliation.iidFileAbsent!==true)throw Error('reconciliation drift')
 const files=[];function walk(relative){for(const name of fs.readdirSync(path.join(CONTEXT,relative))){const r=relative?relative+'/'+name:name,s=fs.lstatSync(path.join(CONTEXT,r));if(s.isSymbolicLink())throw Error('context link');if(s.isDirectory())walk(r);else files.push(r)}}walk('');validateContextPaths(files)
 for(const [name,pin] of Object.entries(PINS))verifyDescriptor(name,fs.readFileSync(CONTEXT+'/'+name),pin)
 validateLock(JSON.parse(fs.readFileSync(CONTEXT+'/package-lock.json','utf8')));validateRecipe(fs.readFileSync(CONTEXT+'/Dockerfile','utf8'))
 for(const [name,pin] of Object.entries(prior.recipeHashes))if(sha(fs.readFileSync(CONTEXT+'/'+name))!==pin||sha(fs.readFileSync(ROOT+'/apps/code-broker/toolchain/windows-fixture/'+name))!==pin)throw Error('reviewed context changed')
 const free=fs.statfsSync('C:/');if(free.bavail*free.bsize<8589934592)throw Error('need8GiB')
 for(const [exe,pin] of Object.values(TOOLS))checkedFile(exe,pin)
 const pluginBytes=checkedFile(PLUGIN,PLUGIN_SHA),receiptFile=WS+'/toolchain-build-resume.json';if(fs.existsSync(receiptFile))throw Error('one actual build already attempted')
 const home=WS+'/bx-'+randomUUID();fs.mkdirSync(home);const homeStat=fs.statSync(home);fs.mkdirSync(home+'/cli-plugins');fs.writeFileSync(home+'/cli-plugins/docker-buildx.exe',pluginBytes,{flag:'wx'});fs.writeFileSync(home+'/config.json','{}',{flag:'wx'})
 const env={SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',HOME:home,USERPROFILE:home,TEMP:home,TMP:home,DOCKER_CONFIG:home,DOTNET_MULTILEVEL_LOOKUP:'0',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'}
 const deadline=Date.now()+900000,commands=[]
 let state={schema:'sdf.windows_node_setup_resume.v1',status:'preflight',originalReceiptSha256:sha(originalBytes),startedAt:new Date().toISOString(),plugin:{path:PLUGIN,sha256:PLUGIN_SHA,temporaryCopy:home+'/cli-plugins/docker-buildx.exe'},productionAuthority:false}
 async function run(kind,args,logName){
  if(Date.now()>=deadline)throw Error('setup deadline')
  return await new Promise((resolve,reject)=>{
   const child=spawn(TOOLS[kind][0],args,{cwd:ROOT,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let out=[],err=[],bytes=0,failed=false
   const timer=setTimeout(()=>{failed=true;child.kill()},deadline-Date.now())
   const collect=(to,b)=>{bytes+=b.length;if(bytes>8388608){failed=true;child.kill();return}to.push(b)}
   child.stdout.on('data',b=>collect(out,b));child.stderr.on('data',b=>collect(err,b));child.on('error',e=>{clearTimeout(timer);reject(e)})
   child.on('close',code=>{clearTimeout(timer);const stdout=Buffer.concat(out),stderr=Buffer.concat(err);commands.push({kind,args,code,bytes});if(logName)fs.writeFileSync(WS+'/'+logName,Buffer.concat([stdout,stderr]));if(code!==0||failed)reject(Error('fixed reconciled command failed '+kind+' exit '+code));else resolve(stdout)})
  })
 }
 const prefix=['--config',home,'--host','npipe:////./pipe/dockerDesktopLinuxEngine'],docker=(...args)=>run('docker',[...prefix,...args])
 const qualify=async()=>{const h=JSON.parse((await run('dotnet',[ROOT+'/apps/code-broker/.native/windows-host/OmniraBrokerHost.dll','qualify'])).toString('utf8'));if(h.status!=='qualified_for_health_probe'||h.docker.backendIdentityHash!==prior.before.backendIdentityHash||h.docker.daemonIdentityHash!==prior.before.daemonIdentityHash)throw Error('peer changed');return h.docker}
 const rows=b=>b.toString('utf8').trim().split(/\r?\n/).filter(Boolean).sort()
 const resources=async()=>({images:rows(await docker('image','ls','--no-trunc','--quiet')),containers:rows(await docker('ps','-aq','--no-trunc')),volumes:rows(await docker('volume','ls','-q'))})
 try{
  state.before=await qualify();state.resourcesBefore=await resources();const base=JSON.parse((await docker('image','inspect',NODE_BASE)).toString('utf8'))
  if(base.length!==1||base[0].Id!=='sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562'||base[0].Os!=='linux'||base[0].Architecture!=='amd64')throw Error('retained base missing')
  state={...state,status:'invoking-once',context:CONTEXT,baseReference:NODE_BASE,descriptorPins:PINS,recipeHashes:prior.recipeHashes};fs.writeFileSync(receiptFile,JSON.stringify(state,null,2),{flag:'wx'})
  const iid=WS+'/toolchain-image-id',metadata=WS+'/toolchain-build-metadata.json'
  await run('docker',[...prefix,'buildx','build','--builder','default','--load','--platform','linux/amd64','--pull=false','--no-cache','--progress=plain','--network=default','--iidfile',iid,'--metadata-file',metadata,'--label','omnira.sdf.node.version=1','--label','omnira.sdf.node.lock='+PINS['package-lock.json'],'--label','omnira.sdf.node.recipe='+prior.recipeHashes.Dockerfile,'--label','omnira.sdf.node.runner='+prior.recipeHashes['fixture-runner.mjs'],'--file',CONTEXT+'/Dockerfile',CONTEXT],'toolchain-build-resumed.log')
  const buildMeta=JSON.parse(fs.readFileSync(metadata,'utf8')),iidValue=fs.readFileSync(iid,'utf8').trim(),builtReference=buildMeta['containerimage.digest']||iidValue
  if(!/^sha256:[a-f0-9]{64}$/.test(iidValue)||!/^sha256:[a-f0-9]{64}$/.test(builtReference))throw Error('build identity missing')
  const image=JSON.parse((await docker('image','inspect',builtReference)).toString('utf8'));if(image.length!==1||!/^sha256:[a-f0-9]{64}$/.test(image[0].Id)||image[0].Os!=='linux'||image[0].Architecture!=='amd64'||image[0].Config.User!=='10001:10001')throw Error('built image mismatch')
  const log=fs.readFileSync(WS+'/toolchain-build-resumed.log','utf8'),matches=[...log.matchAll(/OMNIRA_TOOLCHAIN_RECEIPT=(\{[^\r\n]+\})/g)];if(matches.length!==1)throw Error('receipt missing or duplicate')
  const build=JSON.parse(matches[0][1]);if(build.schema!=='sdf.node_toolchain_build.v1'||build.lifecycleSentinelAbsent!==true||!/^([a-f0-9]{64})$/.test(build.inventorySha256)||build.versions.node!=='22.23.3'||build.versions.typescript!=='5.9.3'||build.versions.vitest!=='2.1.9')throw Error('tool versions')
  state.after=await qualify();for(const [exe,pin] of Object.values(TOOLS))checkedFile(exe,pin);checkedFile(PLUGIN,PLUGIN_SHA);checkedFile(home+'/cli-plugins/docker-buildx.exe',PLUGIN_SHA)
  state={...state,status:'ready',imageId:image[0].Id,buildMetadata:buildMeta,iidValue,build,imageConfig:image[0].Config,resourcesAfter:await resources(),commands,finishedAt:new Date().toISOString()};fs.writeFileSync(receiptFile,JSON.stringify(state,null,2));console.log(JSON.stringify({status:state.status,imageId:state.imageId,build}))
 }catch(e){state={...state,status:'blocked',reason:e.message,commands,finishedAt:new Date().toISOString()};fs.writeFileSync(receiptFile,JSON.stringify(state,null,2));throw e}
 finally{const s=fs.lstatSync(home);if(s.isSymbolicLink()||s.dev!==homeStat.dev||s.ino!==homeStat.ino)throw Error('retained plugin config');fs.rmSync(home,{recursive:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1})
