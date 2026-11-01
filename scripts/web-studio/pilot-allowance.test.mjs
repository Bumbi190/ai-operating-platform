import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {createAllowance,readAllowance,consumeAllowance,withAllowance} from './pilot-allowance.mjs'
const approval=()=>({version:1,budgetId:'demo-pilot',scope:'fictional-preview',currency:'USD',recurrence:'none',projectId:'11111111-1111-4111-8111-111111111111',conversationId:'22222222-2222-4222-8222-222222222222',designSha256:'a'.repeat(64),sourceSha:'b'.repeat(40),limitMicros:10_000_000})
const attempt=(ceilingMicros=1_000_000)=>({id:randomUUID(),operation:'website.artifact.generate',model:'claude-sonnet-4-6',payloadSha256:'c'.repeat(64),priceEvidenceSha256:'d'.repeat(64),ceilingMicros})
function fixture(t){const parent=mkdtempSync(join(tmpdir(),'omnira-pilot-envelope-test-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));const path=join(parent,'allowance'),a=approval();createAllowance(path,a);return {path,a,parent}}

test('new allowance binds the site and reports a ceiling, not invented actual charges',t=>{
 const {path,a}=fixture(t),s=readAllowance(path,a)
 assert.equal(s.limitMicros,10_000_000);assert.equal(s.consumedCeilingMicros,0);assert.equal(s.remainingMicros,10_000_000)
 assert.equal(s.attempts,0);assert.equal(s.actualSpendKnown,false)
})
test('initialization cannot overwrite or reset an existing allowance',t=>{
 const {path,a}=fixture(t);consumeAllowance(path,a,attempt(4_000_000))
 assert.throws(()=>createAllowance(path,a));assert.throws(()=>createAllowance(path,{...a,limitMicros:20_000_000}))
 assert.equal(readAllowance(path,a).remainingMicros,6_000_000)
})
test('exact total passes; one extra microdollar fails before callback',async t=>{
 const {path,a}=fixture(t);let calls=0
 await withAllowance(path,a,attempt(10_000_000),async()=>{calls++;return 'result'})
 await assert.rejects(withAllowance(path,a,attempt(1),async()=>{calls++}),/ALLOWANCE_EXCEEDED/)
 assert.equal(calls,1);assert.equal(readAllowance(path,a).remainingMicros,0)
})
test('admission is durable before callback; native authority remains separately required',async t=>{
 const {path,a}=fixture(t);let calls=0
 const r=await withAllowance(path,a,attempt(2_000_000),async()=>{calls++;assert.equal(readAllowance(path,a).consumedCeilingMicros,2_000_000);return 'native authority still required'})
 assert.equal(calls,1);assert.equal(r.result,'native authority still required');assert.equal(r.receipt.sequence,1)
})
test('uncertain or refused native call never refunds its admitted maximum',async t=>{
 const {path,a}=fixture(t)
 await assert.rejects(withAllowance(path,a,attempt(3_000_000),async()=>{throw Error('unknown provider outcome')}),/unknown provider/)
 assert.equal(readAllowance(path,a).remainingMicros,7_000_000)
})
test('same attempt cannot dispatch twice, including after callback failure',async t=>{
 const {path,a}=fixture(t),item=attempt();let calls=0
 await assert.rejects(withAllowance(path,a,item,async()=>{calls++;throw Error('unknown')}))
 await assert.rejects(withAllowance(path,a,item,async()=>{calls++}),/ATTEMPT_ALREADY_ADMITTED/)
 assert.equal(calls,1)
})
test('project, conversation, design, source, currency, recurrence and total are immutable',t=>{
 const {path,a}=fixture(t)
 for(const change of [{projectId:randomUUID()},{conversationId:randomUUID()},{designSha256:'e'.repeat(64)},{sourceSha:'f'.repeat(40)},{currency:'SEK'},{recurrence:'monthly'},{limitMicros:20_000_000},{budgetId:'other-demo'},{scope:'live-marketplace'}])assert.throws(()=>consumeAllowance(path,{...a,...change},attempt()))
 assert.equal(readAllowance(path,a).attempts,0)
})
test('invalid amounts and unbounded/unknown fields fail closed',t=>{
 const {path,a}=fixture(t)
 for(const amount of [0,-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER,undefined,'1000000'])assert.throws(()=>consumeAllowance(path,a,{...attempt(),ceilingMicros:amount}))
 for(const change of [{model:'../shell'},{operation:'publish'},{payloadSha256:'bad'},{priceEvidenceSha256:''},{id:'../attempt'},{approve:true}])assert.throws(()=>consumeAllowance(path,a,{...attempt(),...change}))
 assert.equal(readAllowance(path,a).attempts,0)
})
test('invalid callback consumes nothing',async t=>{
 const {path,a}=fixture(t);await assert.rejects(withAllowance(path,a,attempt(),null));assert.equal(readAllowance(path,a).attempts,0)
})
test('calendar rollover never renews the allowance',t=>{
 const {path,a}=fixture(t),RealDate=globalThis.Date
 try{
  globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-30T23:59:59Z']))}}
  consumeAllowance(path,a,attempt(7_000_000))
  globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-12-01T00:00:01Z']))}}
  assert.equal(readAllowance(path,a).remainingMicros,3_000_000)
  assert.throws(()=>consumeAllowance(path,a,attempt(4_000_000)),/ALLOWANCE_EXCEEDED/)
 }finally{globalThis.Date=RealDate}
})
test('leftover writer lock is never reclaimed automatically',t=>{
 const {path,a}=fixture(t);writeFileSync(join(path,'writer.lock'),'unknown prior writer')
 assert.throws(()=>consumeAllowance(path,a,attempt()),/ALLOWANCE_BUSY/)
 assert.equal(readFileSync(join(path,'writer.lock'),'utf8'),'unknown prior writer')
})
test('partial journal fails closed rather than implying zero spend',t=>{
 const {path,a}=fixture(t);consumeAllowance(path,a,attempt())
 const file=join(path,'admissions.jsonl');writeFileSync(file,readFileSync(file,'utf8').slice(0,-3))
 assert.throws(()=>readAllowance(path,a),/ALLOWANCE_CORRUPT/);assert.throws(()=>consumeAllowance(path,a,attempt()),/ALLOWANCE_CORRUPT/)
})
test('modified amount and approval are rejected',t=>{
 const {path,a}=fixture(t);consumeAllowance(path,a,attempt())
 const file=join(path,'admissions.jsonl');writeFileSync(file,readFileSync(file,'utf8').replace('1000000','1'))
 assert.throws(()=>readAllowance(path,a),/ALLOWANCE_CORRUPT/)
 writeFileSync(join(path,'approval.json'),JSON.stringify({...a,limitMicros:30_000_000}));assert.throws(()=>readAllowance(path,a))
})
test('missing state never creates an implicit allowance',t=>{
 const parent=mkdtempSync(join(tmpdir(),'omnira-pilot-absent-'));t.after(()=>rmSync(parent,{recursive:true,force:true}))
 const dir=join(parent,'absent');assert.throws(()=>readAllowance(dir,approval()));mkdirSync(dir)
 assert.throws(()=>consumeAllowance(dir,approval(),attempt()));assert.deepEqual(readdirSync(dir),[])
})
function child(code){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);p.on('error',reject);p.on('close',exit=>resolve({exit,stdout,stderr}))})}
test('independent processes cannot oversubscribe one total',async t=>{
 const {path,a}=fixture(t),url=new URL('./pilot-allowance.mjs',import.meta.url).href
 const run=()=>child(`import {consumeAllowance} from ${JSON.stringify(url)};try{consumeAllowance(${JSON.stringify(path)},${JSON.stringify(a)},${JSON.stringify(attempt(6_000_000))});console.log('admitted')}catch(e){if(!/ALLOWANCE_EXCEEDED|ALLOWANCE_BUSY/.test(e.message))throw e;console.log('refused')}`)
 const results=await Promise.all([run(),run(),run()]);for(const r of results)assert.equal(r.exit,0,r.stderr)
 assert.equal(results.filter(r=>r.stdout.trim()==='admitted').length,1);assert.equal(readAllowance(path,a).consumedCeilingMicros,6_000_000)
})
test('new process retains prior allocation instead of restarting from zero',async t=>{
 const {path,a}=fixture(t);consumeAllowance(path,a,attempt(2_500_000));const url=new URL('./pilot-allowance.mjs',import.meta.url).href
 const r=await child(`import {readAllowance} from ${JSON.stringify(url)};console.log(readAllowance(${JSON.stringify(path)},${JSON.stringify(a)}).remainingMicros)`)
 assert.equal(r.exit,0,r.stderr);assert.equal(r.stdout.trim(),'7500000')
})

test('complete trailing-entry loss cannot silently restore spent allowance',t=>{
 const {path,a}=fixture(t);consumeAllowance(path,a,attempt(4_000_000));consumeAllowance(path,a,attempt(5_000_000))
 const file=join(path,'admissions.jsonl'),first=readFileSync(file,'utf8').split('\n')[0]+'\n';writeFileSync(file,first)
 assert.throws(()=>readAllowance(path,a),/ALLOWANCE_CORRUPT/)
})
test('identity values must be strings rather than regex-coerced arrays',t=>{
 const {path,a}=fixture(t)
 for(const key of ['projectId','conversationId','designSha256','sourceSha'])assert.throws(()=>readAllowance(path,{...a,[key]:[a[key]]}))
 for(const key of ['id','payloadSha256','priceEvidenceSha256']){const item=attempt();assert.throws(()=>consumeAllowance(path,a,{...item,[key]:[item[key]]}))}
 assert.equal(readAllowance(path,a).attempts,0)
})
