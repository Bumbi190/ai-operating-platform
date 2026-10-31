// Test infrastructure only: preserve legacy fixtures, allow an exact fresh isolated run.
import assert from 'node:assert/strict'
export function resolveWebsiteTestTarget(env=process.env){
 const runId=env.WEBSITE_BUILD_TEST_RUN_ID,container=env.WEBSITE_BUILD_TEST_CONTAINER
 if(runId===undefined&&container===undefined)return {container:'omnira-website-build-test-20261014',runId:null}
 assert.equal(typeof runId,'string','Missing test run identity')
 assert.match(runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,'Invalid test run identity')
 assert.equal(container,'omnira-website-sql-'+runId,'Container must be bound to this test run')
 return {container,runId}
}
export function assertWebsiteTestTarget(info,target){
 assert.equal(info?.Name,'/'+target.container,'Test container name mismatch')
 assert.equal(info?.Config?.Labels?.['com.omnira.testplan'],'atlas-live-build-20261014','Test container ownership missing')
 if(!target.runId)return
 assert.equal(info.Config.Labels['com.omnira.website.sql.run'],target.runId,'Test run ownership mismatch')
 assert.equal(info.State?.Running,true,'Test container is not running')
 const host=info.HostConfig
 assert.equal(host?.NetworkMode,'none','Test database must have no network')
 assert.equal(Object.keys(host?.PortBindings??{}).length,0,'Published ports refused')
 assert.equal((host?.Binds??[]).length,0,'Host bindings refused')
 assert.ok((info.Mounts??[]).every(m=>m.Type==='tmpfs'),'Non-ephemeral mounts refused')
 assert.ok(Number.isSafeInteger(host?.Memory)&&host.Memory>0&&host.Memory<=256*1024**2,'Unbounded memory refused')
 assert.equal(host.MemorySwap,host.Memory,'Additional swap refused')
}

export function resolveWebsiteTestMode(args){
 assert.ok(Array.isArray(args),'Runner arguments must be an array')
 if(args.length===0)return 'sql'
 assert.deepEqual(args,['--studio'],'Unsupported test runner arguments')
 return 'studio'
}
