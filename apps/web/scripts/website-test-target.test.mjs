import {test} from 'node:test'
import assert from 'node:assert/strict'
import {resolveWebsiteTestTarget,assertWebsiteTestTarget} from './website-test-target.mjs'
const id='12345678-1234-4123-8123-123456789abc'
const env={WEBSITE_BUILD_TEST_RUN_ID:id,WEBSITE_BUILD_TEST_CONTAINER:'omnira-website-sql-'+id}
const inspect=()=>({Name:'/'+env.WEBSITE_BUILD_TEST_CONTAINER,Config:{Labels:{'com.omnira.testplan':'atlas-live-build-20261014','com.omnira.website.sql.run':id}},State:{Running:true},HostConfig:{NetworkMode:'none',Memory:201326592,MemorySwap:201326592,PortBindings:{},Binds:null},Mounts:[{Type:'tmpfs',Destination:'/var/lib/postgresql/data'}]})
test('preserves the legacy fixed target without any overrides',()=>{
 const t=resolveWebsiteTestTarget({});assert.equal(t.container,'omnira-website-build-test-20261014');assert.equal(t.runId,null)
 assert.doesNotThrow(()=>assertWebsiteTestTarget({Name:'/'+t.container,Config:{Labels:{'com.omnira.testplan':'atlas-live-build-20261014'}}},t))
})
test('accepts only the exact unique run-bound ephemeral target',()=>{
 const t=resolveWebsiteTestTarget(env);assert.equal(t.container,env.WEBSITE_BUILD_TEST_CONTAINER);assert.equal(t.runId,id)
 assert.doesNotThrow(()=>assertWebsiteTestTarget(inspect(),t))
})
test('rejects partial overrides, arbitrary names and invalid run ids',()=>{
 for(const e of [{WEBSITE_BUILD_TEST_RUN_ID:id},{WEBSITE_BUILD_TEST_CONTAINER:env.WEBSITE_BUILD_TEST_CONTAINER},{...env,WEBSITE_BUILD_TEST_CONTAINER:'supabase_db_Handlarborsen'},{...env,WEBSITE_BUILD_TEST_RUN_ID:'../anything'},{...env,WEBSITE_BUILD_TEST_RUN_ID:id+'x'},{...env,WEBSITE_BUILD_TEST_CONTAINER:'omnira-website-sql-'+id.toUpperCase()}])assert.throws(()=>resolveWebsiteTestTarget(e))
})
test('refuses mismatched identity or labels',()=>{
 for(const mutate of [x=>x.Name='/other',x=>x.Config.Labels['com.omnira.website.sql.run']='other',x=>delete x.Config.Labels['com.omnira.testplan']]){const x=inspect();mutate(x);assert.throws(()=>assertWebsiteTestTarget(x,resolveWebsiteTestTarget(env)))}
})
test('ephemeral SQL has no exposed network, host mount or unlimited memory',()=>{
 for(const mutate of [x=>x.State.Running=false,x=>x.HostConfig.NetworkMode='bridge',x=>x.HostConfig.Memory=0,x=>x.HostConfig.Memory=1073741824,x=>x.HostConfig.MemorySwap=-1,x=>x.HostConfig.PortBindings={'5432/tcp':[{HostPort:'5432'}]},x=>x.HostConfig.Binds=['C:/:/host'],x=>x.Mounts=[{Type:'bind',Destination:'/host'}]]){const x=inspect();mutate(x);assert.throws(()=>assertWebsiteTestTarget(x,resolveWebsiteTestTarget(env)))}
})

test('SQL runner refuses missing opt-in before attempting Docker',async()=>{
 const {spawnSync}=await import('node:child_process')
 const {fileURLToPath}=await import('node:url')
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./run-website-sql-roundtrip.mjs',import.meta.url))],{encoding:'utf8',timeout:5000,env:{PATH:'',WEBSITE_SQL_ROUNDTRIP:''}})
 assert.notEqual(result.status,0)
 assert.match(result.stderr,/Explicit SQL-only opt-in required/)
 assert.doesNotMatch(result.stderr,/spawnSync docker|Docker fixture operation/)
})
