const {test}=require('node:test')
const assert=require('node:assert/strict')
const {guardedFetch,withOfflineNextVersionCheck}=require('./fetch-guard.cjs')
test('permits exact owned origins and denies external or credentialed URLs before transport',async()=>{
 const calls=[]
 const run=guardedFetch(async input=>{calls.push(String(input));return 'ok'},['http://127.0.0.1:54406','http://127.0.0.1:54407'])
 assert.equal(await run('http://127.0.0.1:54407/auth/v1/user'),'ok')
 for(const url of ['https://registry.npmjs.org/-/package/next/dist-tags','https://production.supabase.co/auth/v1/user','https://api.anthropic.com/v1/messages','http://127.0.0.1:54321/rest/v1','http://user:pass@127.0.0.1:54407/auth/v1/user']){
  await assert.rejects(()=>run(url),/outside owned fixture/)
 }
 assert.deepEqual(calls,['http://127.0.0.1:54407/auth/v1/user'])
})
test('offline Next update check uses locked installed version and never invokes transport',async()=>{
 const calls=[],checks=[]
 const run=withOfflineNextVersionCheck(guardedFetch(async input=>{calls.push(String(input));return 'owned'},['http://127.0.0.1:54407']),{
  installedVersion:'15.5.29',lockedVersion:'15.5.29',onCheck:check=>checks.push(check)})
 const response=await run('https://registry.npmjs.org/-/package/next/dist-tags')
 assert.equal(response.status,503)
 assert.equal(await response.text(),'')
 assert.equal(response.headers.get('cache-control'),'no-store')
 assert.deepEqual(checks,[{installedVersion:'15.5.29',lockedVersion:'15.5.29',status:503,staleness:'unknown'}])
 assert.deepEqual(calls,[])
 assert.equal(await run('http://127.0.0.1:54407/auth/v1/user'),'owned')
 assert.deepEqual(calls,['http://127.0.0.1:54407/auth/v1/user'])
})
test('offline version double still denies registry variants and other external traffic',async()=>{
 const calls=[],denied=[],checks=[]
 const run=withOfflineNextVersionCheck(guardedFetch(async input=>{calls.push(String(input))},['http://127.0.0.1:54407'],url=>denied.push(url)),{
  installedVersion:'15.5.29',lockedVersion:'15.5.29',onCheck:check=>checks.push(check)})
 const url='https://registry.npmjs.org/-/package/next/dist-tags'
 const cases=[
  [url,{method:'POST'}],[url,{method:'HEAD'}],[url,{headers:{authorization:'synthetic'}}],
  [url,{body:'synthetic'}],[url,{}],[url+'?unexpected=1'],[url+'#fragment'],[url+'/extra'],
  ['https://registry.npmjs.org/next'],['https://registry.npmjs.org:444/-/package/next/dist-tags'],
  ['https://user:pass@registry.npmjs.org/-/package/next/dist-tags'],
  ['https://registry.npmjs.org.evil.test/-/package/next/dist-tags'],
  ['https://production.supabase.co/rest/v1'],['https://api.anthropic.com/v1/messages'],
  [new URL(url)],[new Request(url)],
 ]
 for(const args of cases)await assert.rejects(()=>run(...args),/outside owned fixture/)
 assert.deepEqual(calls,[])
 assert.deepEqual(checks,[])
 assert.equal(denied.length,cases.length)
})
test('unlocked or mismatched installed Next versions fail closed',()=>{
 for(const [installedVersion,lockedVersion]of [['15.5.29','15.5.28'],['15.5.29',undefined],[undefined,'15.5.29'],['invalid','invalid']])
  assert.throws(()=>withOfflineNextVersionCheck(()=>{}, {installedVersion,lockedVersion}),/match package-lock/)
})

test('offline metadata preload refuses a non-isolated environment',()=>{
 const {spawnSync}=require('node:child_process')
 const result=spawnSync(process.execPath,['--require',require.resolve('./fetch-guard.cjs'),'-e','process.exit(0)'],{
  encoding:'utf8',env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,ATLAS_REFERENCE_FETCH_ORIGINS:'[\"http://127.0.0.1:54407\"]',
   ATLAS_REFERENCE_TEST_MODE:'preview',ATLAS_REFERENCE_NEXT_VERSION_METADATA:'offline',ATLAS_REFERENCE_NEXT_VERSION_RECEIPT:'not-used'}})
 assert.notEqual(result.status,0)
 assert.match(result.stderr,/Explicit isolated-local offline version fixture required/)
})
