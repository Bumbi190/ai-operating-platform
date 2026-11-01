// One disposable SQL-only fixture; never starts/reuses an existing database or Auth stack.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {randomUUID,randomBytes} from 'node:crypto'
import {freemem} from 'node:os'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {resolveWebsiteTestTarget,assertWebsiteTestTarget,resolveWebsiteTestMode} from './website-test-target.mjs'
const root=fileURLToPath(new URL('../../../',import.meta.url)),web=resolve(root,'apps/web')
assert.equal(process.env.WEBSITE_SQL_ROUNDTRIP,'isolated-local','Explicit SQL-only opt-in required')
const mode=resolveWebsiteTestMode(process.argv.slice(2))
assert.ok(freemem()>=2*1024**3,'Need 2GiB free; no resources started')
const id=randomUUID(),container='omnira-website-sql-'+id
const out=resolve(root,'.superpowers/sdd/2026-10-31-web-studio-sql-roundtrip/runs',id)
mkdirSync(out,{recursive:true})
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|programfiles|programfiles\(x86\)|programdata)$/i.test(k)))
Object.assign(env,{WEBSITE_BUILD_TEST_RUN_ID:id,WEBSITE_BUILD_TEST_CONTAINER:container,WEBSITE_BUILD_TEST_DATABASE_URL:'postgresql://postgres:local-fixture@127.0.0.1:54389/omnira_website_test',WEBSITE_BUILD_TEST_KEEP_DATABASE:'1',NODE_OPTIONS:'--max-old-space-size=512',NO_COLOR:'1'})
const target=resolveWebsiteTestTarget(env)
function docker(args,input,extra={}){
 const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:30000,maxBuffer:8*1024**2,env:{...env,...extra}})
 if(r.status!==0)throw Error('Docker fixture operation failed: '+(r.stderr||r.error?.message||'unknown').slice(-1200))
 return r.stdout.trim()
}
function runNode(args,name,timeout=180000,cwd=web){
 const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout,maxBuffer:12*1024**2,env})
 writeFileSync(resolve(out,name+'.log'),(r.stdout??'')+'\n'+(r.stderr??''))
 console.log(name+' EXIT='+r.status+' '+(r.error?.message??''))
 if(r.status!==0)throw Error(name+' failed; evidence '+resolve(out,name+'.log')+'\n'+(r.stderr||r.stdout||'').slice(-1800))
 return r.stdout
}
const local=docker(['context','inspect','--format','{{.Endpoints.docker.Host}}'])
assert.match(local,/^(npipe:\/\/|unix:\/\/)/,'Remote Docker refused')
assert.equal(docker(['ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}']),'','Existing name refused')
const before=docker(['ps','-a','--format','{{.ID}}|{{.Names}}|{{.Status}}'])
const image=docker(['image','inspect','postgres:17-alpine','--format','{{.Id}}'])
const result={id,container,image,mode,scope:mode==='studio'?'actual Studio UI, HTTP, PostgreSQL and worker; auth and models are fixtures, not GoTrue login':'real PostgreSQL and canonical RPC/worker; synthetic auth identities and provider fixture, no GoTrue login',startedAt:new Date().toISOString(),passed:false,cleaned:false}
let originalError
try{
 docker(['run','--pull=never','-d','--name',container,'--label','com.omnira.testplan=atlas-live-build-20261014','--label','com.omnira.website.sql.run='+id,'--network','none','--memory','192m','--memory-swap','192m','--cpus','1','--pids-limit','96','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=128m','-e','POSTGRES_PASSWORD',image,'-c','listen_addresses=','-c','shared_buffers=16MB','-c','max_connections=20','-c','work_mem=1MB'],undefined,{POSTGRES_PASSWORD:randomBytes(24).toString('hex')})
 assertWebsiteTestTarget(JSON.parse(docker(['inspect',container]))[0],target)
 let ready=false
 for(let i=0;i<80;i++){
  try{if(docker(['exec',container,'psql','-U','postgres','-Atc','select 1'])==='1'){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,250))
 }
 assert.ok(ready,'Fresh database readiness failed')
 // Require the final postgres process, not entrypoint's temporary init server.
 for(let i=0;i<40;i++){
  const command=docker(['exec',container,'sh','-c','cat /proc/1/comm'])
  if(command==='postgres')break
  if(i===39)throw Error('Database initialization did not finish')
  await new Promise(r=>setTimeout(r,250))
 }
 const setup=runNode([resolve(web,'scripts/test-website-build-db.mjs')],'bootstrap',180000,root)
 const name=setup.match(/KEEP_DB=(website_test_\d+)/)?.[1]
 assert.ok(name,'Bootstrap did not supply an owned test database')
 env.WEBSITE_BUILD_TEST_DATABASE_NAME=name
 result.database=name
 if(mode==='studio'){
  const report=resolve(out,'studio.json')
  env.PLAYWRIGHT_JSON_OUTPUT_FILE=report
  runNode([resolve(root,'node_modules/@playwright/test/cli.js'),'test','--config','playwright.atlas-builder-studio.config.ts','--reporter=list,json','--output',resolve(out,'browser'),'--global-timeout=420000','--max-failures=1'],'studio',480000)
  const reportData=JSON.parse(readFileSync(report,'utf8')),stats=reportData.stats
  Object.assign(result,{passed:stats.expected>0&&stats.unexpected===0&&stats.skipped===0&&stats.flaky===0&&(reportData.errors??[]).length===0,tests:stats.expected+stats.unexpected+stats.skipped+stats.flaky,passedTests:stats.expected,failedTests:stats.unexpected})
 }else{
  const report=resolve(out,'integration.json')
  runNode([resolve(root,'node_modules/vitest/vitest.mjs'),'run','lib/website-build/planning/visual-roundtrip.test.ts','lib/website-build/planning/starter-roundtrip.test.ts','lib/website-build/planning/mockup-store.test.ts','lib/website-build/test-db-bootstrap.test.ts','lib/website-build/worker.test.ts','--maxWorkers=1','--minWorkers=1','--reporter=json','--outputFile',report],'integration',240000)
  const tests=JSON.parse(readFileSync(report,'utf8'))
  Object.assign(result,{passed:tests.success,tests:tests.numTotalTests,passedTests:tests.numPassedTests,failedTests:tests.numFailedTests})
 }
 assert.equal(result.passed,true)
 console.log(JSON.stringify({tests:result.tests,passed:result.passedTests,scope:result.scope}))
}catch(e){originalError=e;result.error=e.message;console.error(e.message)}finally{
 try{
  const found=docker(['ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}'])
  if(found){
   assert.equal(found,container)
   const info=JSON.parse(docker(['inspect',container]))[0]
   assert.equal(info.Name,'/'+container)
   assert.equal(info.Config.Labels?.['com.omnira.website.sql.run'],id,'Cleanup ownership mismatch')
   assert.equal(info.Config.Labels?.['com.omnira.testplan'],'atlas-live-build-20261014')
   docker(['rm','-f',container])
  }
  assert.equal(docker(['ps','-a','--filter','label=com.omnira.website.sql.run='+id,'--format','{{.Names}}']),'')
  result.cleaned=true
 }catch(e){result.cleanupError=e.message;originalError??=e}
 writeFileSync(resolve(out,'before-containers.txt'),before+'\n')
 writeFileSync(resolve(out,'after-containers.txt'),docker(['ps','-a','--format','{{.ID}}|{{.Names}}|{{.Status}}'])+'\n')
 result.finishedAt=new Date().toISOString()
 writeFileSync(resolve(out,'receipt.json'),JSON.stringify(result,null,2)+'\n')
 console.log('SQL_FIXTURE_RECEIPT='+resolve(out,'receipt.json'))
 console.log('OWNED_SQL_REMOVED='+result.cleaned)
}
if(originalError)process.exitCode=1
