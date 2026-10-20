import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const ROOT='C:/Users/Andre/Projects/Omnira/.worktrees/atlas-voice-recovery-20261016'
const MAIN='C:/Users/Andre/Projects/Omnira/Code/ai-operating-platform'
const BASE='d3f9fcc1045026042f6bb9c0cd302ed0b7283127'
const WS=ROOT+'/.superpowers/sdd/2026-10-19-windows-source-materialization'
const NODE_BASE='docker.io/library/node@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562'
const TOOLS={dotnet:['C:/Program Files/dotnet/dotnet.exe','7967467e8bad9c686de2ab2c1994112d5331a7c3d20f0b8a4fff7480221a1c37'],docker:['C:/Users/Andre/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe','6c699720bb9523dedb9eb5d22a49951ea9210dbdb1314a3554029eee9be76896'],git:['C:/Program Files/Git/cmd/git.exe','bd1bf0469426e2e67a27300176303b5e43e1dda81babc1c24c9c2ce627b97960']}
const PINS={'package.json':'d04f1e73243bd9d023a352fdc42b1892474d76f8c0519acd08819b926d500fdd','package-lock.json':'17ba6aedc7139835f0de6c62fc13c727682b737fe142ee7e99d452673625de80','apps/web/package.json':'def6e3795da9eb4250e703446080ddb824d2128a6e6869949c09efd374944313','packages/local-text-contract/package.json':'662e5cee1fd9e5bb13002f31793f54b50ea0a1eb67ab34a2931977f583c27cb3'}
const RECIPES=['Dockerfile','fixture-runner.mjs','vitest-fixture.config.mjs','dependency-inventory.mjs'],CONTEXT=[...Object.keys(PINS),...RECIPES].sort()
const sha=b=>createHash('sha256').update(b).digest('hex')
export function verifyDescriptor(name,bytes,pin){if(!Object.hasOwn(PINS,name)||!Buffer.isBuffer(bytes)||bytes.length>1048576||!/^([a-f0-9]{64})$/.test(pin)||sha(bytes)!==pin)throw Error('descriptor mismatch')}
export function validateContextPaths(paths){if(!Array.isArray(paths)||JSON.stringify([...paths].sort())!==JSON.stringify(CONTEXT))throw Error('nonallowlisted build context')}
export function validateLock(lock){
 if(lock?.lockfileVersion!==3||!lock.packages||Object.keys(lock.packages).length>2000)throw Error('lock shape')
 for(const [name,row] of Object.entries(lock.packages)){
  if(name.split('/').includes('..')||name.includes('\\')||name.startsWith('/'))throw Error('lock path')
  if(row.link===true){if(!['apps/web','packages/local-text-contract'].includes(row.resolved)||!name.startsWith('node_modules/'))throw Error('workspace link');continue}
  if(row.resolved!==undefined){
   let url;try{url=new URL(row.resolved)}catch{throw Error('dependency URL')}
   if(url.protocol!=='https:'||url.hostname!=='registry.npmjs.org'||url.port||url.username||url.password||url.search||url.hash)throw Error('dependency registry')
   if(typeof row.integrity!=='string'||!/^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(row.integrity))throw Error('dependency integrity')
  }else if(name.startsWith('node_modules/'))throw Error('unresolved dependency')
 }
}
export function validateRecipe(text){
 const from=text.split(/\r?\n/).filter(l=>l.startsWith('FROM '))
 if(from.length!==2||from[0]!=='FROM '+NODE_BASE+' AS dependencies'||from[1]!=='FROM '+NODE_BASE)throw Error('base pin')
 const ci=[...text.matchAll(/npm ci([^\n&]*)/g)].map(m=>m[1])
 if(ci.length!==2||ci.some(s=>!s.includes('--ignore-scripts')||!s.includes('--userconfig=/opt/omnira/npm-user.config')||!s.includes('--globalconfig=/opt/omnira/npm-global.config'))||!ci[0].includes('--include=dev --include=optional'))throw Error('lifecycle not disabled')
 if(/COPY\s+\.\s|\bADD\s|\bARG\s|npm (?:run|rebuild)|--ignore-scripts=false|--mount=|docker\.sock/.test(text)||!text.includes('COPY package.json package-lock.json ./')||!text.includes('USER 10001:10001'))throw Error('recipe scope')
}
async function setup(){
 if(process.platform!=='win32'||process.argv.length!==2||path.resolve(process.cwd()).toLowerCase()!==path.resolve(ROOT).toLowerCase())throw Error('fixed Windows operator setup only')
 for(const [exe,pin] of Object.values(TOOLS)){if(fs.lstatSync(exe).isSymbolicLink()||sha(fs.readFileSync(exe))!==pin)throw Error('tool pin')}
 const free=fs.statfsSync('C:/');if(free.bavail*free.bsize<8589934592)throw Error('need 8GiB free host space')
 const attemptFile=WS+'/toolchain-setup-attempt.json';if(fs.existsSync(attemptFile))throw Error('setup already attempted; reconciliation required')
 const context=WS+'/build-context-'+randomUUID(),home=WS+'/setup-config-'+randomUUID();fs.mkdirSync(context);fs.mkdirSync(home)
 const homeStat=fs.statSync(home);fs.writeFileSync(home+'/config.json','{}',{flag:'wx'})
 const env={SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',HOME:home,USERPROFILE:home,TEMP:home,TMP:home,DOCKER_CONFIG:home,DOTNET_MULTILEVEL_LOOKUP:'0',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL',GIT_CONFIG_SYSTEM:'NUL',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'none'}
 const deadline=Date.now()+900000,outputs=[]
 async function run(kind,args){
  const max=8388608,remaining=deadline-Date.now();if(remaining<1)throw Error('setup deadline')
  return await new Promise((resolve,reject)=>{
   const child=spawn(TOOLS[kind][0],args,{cwd:ROOT,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let out=[],err=[],bytes=0,exceeded=false
   const timer=setTimeout(()=>{exceeded=true;child.kill()},remaining)
   function collect(dest,b){bytes+=b.length;if(bytes>max){exceeded=true;child.kill();return}dest.push(b)}
   child.stdout.on('data',b=>collect(out,b));child.stderr.on('data',b=>collect(err,b));child.on('error',e=>{clearTimeout(timer);reject(e)})
   child.on('close',code=>{clearTimeout(timer);const stdout=Buffer.concat(out),stderr=Buffer.concat(err);outputs.push({kind,verb:args.find(x=>!x.startsWith('-')),code,bytes});if(kind==='docker'&&args.includes('build'))fs.writeFileSync(WS+'/toolchain-build.log',Buffer.concat([stdout,stderr]));if(code!==0||exceeded)reject(Error('fixed setup command failed '+kind+' exit '+code));else resolve(stdout)})
  })
 }
 const dockerPrefix=['--config',home,'--host','npipe:////./pipe/dockerDesktopLinuxEngine']
 const docker=(...args)=>run('docker',[...dockerPrefix,...args])
 const git=(...args)=>run('git',['--no-pager','--no-optional-locks','--no-replace-objects','-c','core.hooksPath=NUL','-c','core.fsmonitor=false','-c','credential.helper=','-c','protocol.allow=never','-c','gc.auto=0','-C',MAIN,...args])
 const qualify=async()=>{const q=JSON.parse((await run('dotnet',[ROOT+'/apps/code-broker/.native/windows-host/OmniraBrokerHost.dll','qualify'])).toString('utf8'));if(q.status!=='qualified_for_health_probe'||!q.docker)throw Error('host unqualified');return q.docker}
 const resources=async()=>({images:(await docker('image','ls','--no-trunc','--quiet')).toString('utf8').trim().split(/\r?\n/).filter(Boolean).sort(),containers:(await docker('ps','-aq','--no-trunc')).toString('utf8').trim().split(/\r?\n/).filter(Boolean).sort(),volumes:(await docker('volume','ls','-q')).toString('utf8').trim().split(/\r?\n/).filter(Boolean).sort()})
 let state={schema:'sdf.windows_node_setup.v1',status:'preflight',startedAt:new Date().toISOString(),productionAuthority:false,context,home}
 try{
  const before=await qualify();if((await git('rev-parse','refs/remotes/origin/main')).toString('utf8').trim()!==BASE)throw Error('approved base drift')
  const files=new Map()
  for(const [name,pin] of Object.entries(PINS)){const bytes=await git('cat-file','blob',BASE+':'+name);verifyDescriptor(name,bytes,pin);files.set(name,bytes)}
  validateLock(JSON.parse(files.get('package-lock.json')))
  const recipeHashes={}
  for(const name of RECIPES){const p=ROOT+'/apps/code-broker/toolchain/windows-fixture/'+name;if(!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())throw Error('recipe path');const bytes=fs.readFileSync(p);files.set(name,bytes);recipeHashes[name]=sha(bytes)}
  validateContextPaths([...files.keys()]);validateRecipe(files.get('Dockerfile').toString('utf8'))
  for(const [name,bytes] of files){const p=path.join(context,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes,{flag:'wx'})}
  state={...state,status:'invoking-once',before,resourcesBefore:await resources(),base:BASE,descriptorPins:PINS,recipeHashes};fs.writeFileSync(attemptFile,JSON.stringify(state,null,2),{flag:'wx'})
  await docker('pull','--platform','linux/amd64',NODE_BASE)
  const iid=WS+'/toolchain-image-id'
  await docker('build','--platform','linux/amd64','--pull=false','--no-cache','--progress=plain','--network=default','--iidfile',iid,'--label','omnira.sdf.node.version=1','--label','omnira.sdf.node.lock='+PINS['package-lock.json'],'--label','omnira.sdf.node.recipe='+recipeHashes.Dockerfile,'--label','omnira.sdf.node.runner='+recipeHashes['fixture-runner.mjs'],'--file',context+'/Dockerfile',context)
  const imageId=fs.readFileSync(iid,'utf8').trim();if(!/^sha256:[a-f0-9]{64}$/.test(imageId))throw Error('image ID')
  const image=JSON.parse((await docker('image','inspect',imageId)).toString('utf8'));if(image.length!==1||image[0].Id!==imageId||image[0].Os!=='linux'||image[0].Architecture!=='amd64'||image[0].Config.User!=='10001:10001')throw Error('image qualification')
  const log=fs.readFileSync(WS+'/toolchain-build.log','utf8'),matches=[...log.matchAll(/OMNIRA_TOOLCHAIN_RECEIPT=(\{[^\r\n]+\})/g)]
  if(matches.length!==1)throw Error('build receipt missing or duplicated');const build=JSON.parse(matches[0][1])
  if(build.schema!=='sdf.node_toolchain_build.v1'||build.lifecycleSentinelAbsent!==true||!/^([a-f0-9]{64})$/.test(build.inventorySha256)||build.versions.node!=='22.23.3'||build.versions.typescript!=='5.9.3'||build.versions.vitest!=='2.1.9')throw Error('build receipt mismatch')
  const after=await qualify();if(before.backendIdentityHash!==after.backendIdentityHash||before.daemonIdentityHash!==after.daemonIdentityHash)throw Error('setup peer changed')
  state={...state,status:'ready',imageId,baseReference:NODE_BASE,build,after,imageConfig:image[0].Config,resourcesAfter:await resources(),finishedAt:new Date().toISOString(),commands:outputs};fs.writeFileSync(attemptFile,JSON.stringify(state,null,2));console.log(JSON.stringify({status:state.status,imageId,build}))
 }catch(e){state={...state,status:'blocked',reason:String(e.message),finishedAt:new Date().toISOString(),commands:outputs};fs.writeFileSync(attemptFile,JSON.stringify(state,null,2));throw e}
 finally{
  const now=fs.lstatSync(home);if(now.isSymbolicLink()||now.dev!==homeStat.dev||now.ino!==homeStat.ino||path.resolve(fs.realpathSync(home)).toLowerCase()!==path.resolve(home).toLowerCase())throw Error('retained setup config')
  fs.rmSync(home,{recursive:true})
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))setup().catch(e=>{console.error(e.message);process.exitCode=1})

export {PINS as FIXED_DESCRIPTOR_PINS,NODE_BASE as FIXED_NODE_BASE}
