const {test}=require('node:test')
const assert=require('node:assert/strict')
const {guardedFetch}=require('./fetch-guard.cjs')
test('permits exact owned origins and denies external or credentialed URLs before transport',async()=>{
 const calls=[]
 const run=guardedFetch(async input=>{calls.push(String(input));return 'ok'},['http://127.0.0.1:54406','http://127.0.0.1:54407'])
 assert.equal(await run('http://127.0.0.1:54407/auth/v1/user'),'ok')
 for(const url of ['https://production.supabase.co/auth/v1/user','https://api.anthropic.com/v1/messages','http://127.0.0.1:54321/rest/v1','http://user:pass@127.0.0.1:54407/auth/v1/user']){
  await assert.rejects(()=>run(url),/outside owned fixture/)
 }
 assert.deepEqual(calls,['http://127.0.0.1:54407/auth/v1/user'])
})
