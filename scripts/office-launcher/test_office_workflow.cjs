const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../..'),cache={}
function load(rel){const file=path.join(root,rel);if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;const src=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext('(function(require,module,exports){'+src+'\n})',{filename:file})(id=>id.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),id+'.ts'))):require(id),m,m.exports);return m.exports}
const {projectWorkflowState}=load('apps/web/lib/atlas/office/workflow-state.ts'),{createWorkflowVisitHandlers}=load('apps/web/lib/atlas/office/workflow-visits.ts'),{createVisitHandlers}=load('apps/web/lib/atlas/office/visits.ts')
const P='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333',V='019a7d46-1222-7000-8000-000000000001',U='11111111-1111-4111-8111-111111111111',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',R='44444444-4444-4444-8444-444444444444',C='55555555-5555-4555-8555-555555555555'
const secret=Buffer.alloc(32,42).toString('base64url'),digest=crypto.createHash('sha256').update(Buffer.from(secret,'base64url')).digest('hex'),now=Date.now(),iso=n=>new Date(now+n).toISOString()
const selection={projectId:P,agentId:A}
const unknown={state:'unknown',coverage:'incomplete',validUntil:now}
function run(status='running'){return{id:R,project_id:P,status,claim_id:status==='running'?C:null,claimed_at:status==='running'?iso(-10000):null,lease_until:status==='running'?iso(12000):null,finished_at:null,cancel_requested:false,reconciliation_required:false,steps_snapshot:[{order:0,agent_id:A}]}}
const facts=(runs=[])=>({complete:true,runs})
const classify=f=>projectWorkflowState(f,selection,now)
function row(){const t=Date.now();return{visitId:V,avatarId:'office-familje-pling',projectId:P,agentId:A,createdAt:new Date(t).toISOString(),expiresAt:new Date(t+14400000).toISOString(),leaseUntil:new Date(t+30000).toISOString(),generatedAt:new Date(t).toISOString(),readScope:'workflow_state_v1',nativeWorkflowProtocol:1,workflowRevision:1,workflowFacts:facts()}}
const grant={visitId:V,avatarId:'office-familje-pling',projectId:P,agentId:A,secretDigest:digest,readScope:'workflow_state_v1',nativeWorkflowProtocol:'1'}
function request(op='presence',data=op==='presence'?{visitId:V}:grant,headers={}){return new Request('https://omniraos.se/api/atlas/office/visits/workflow'+(op==='presence'?'/presence':''),{method:'POST',headers:{'Content-Type':'application/json',...(op==='presence'?{'x-omnira-office-visit':secret}:{Origin:'https://omniraos.se'}),...headers},body:typeof data==='string'?data:JSON.stringify(data)})}
function harness({enabled=true,owner={ownerId:U,sessionId:S},mutate=()=>{},error=false}={}){const calls=[];return{calls,api:createWorkflowVisitHandlers({enabled:()=>enabled,owner:async()=>owner,rpc:async(name,args)=>{calls.push({name,args});if(error)throw Error('SECRET_DATABASE_DIAGNOSTIC');const value=row();mutate(value);return value}})}}

test('complete empty census alone permits bounded idle; pending/running/approval reserve selected agent',()=>{
 assert.deepEqual(classify(facts()),{state:'idle',coverage:'complete',validUntil:now+20000})
 for(const state of ['pending','running','awaiting_approval'])assert.equal(classify(facts([run(state)])).state,'busy')
 assert.equal(classify(facts([run()])).validUntil,now+12000)
})
test('incomplete/capped/malformed census never claims idle',()=>{
 for(const f of [null,{},facts(Array(12).fill(run())),{complete:false,runs:[]},facts([run(),run()]),facts([{...run(),project_id:A}]),facts([{...run(),steps_snapshot:[{order:0,agent_id:P}]}])])assert.deepEqual(classify(f),unknown)
 for(const mutate of[r=>r.steps_snapshot=[],r=>r.steps_snapshot=Array(101).fill({order:0,agent_id:A}),r=>r.steps_snapshot.push({order:0,agent_id:P}),r=>r.steps_snapshot[0].order=1.5,r=>r.steps_snapshot[0].agent_id='bad',r=>r.status='queued',r=>r.status='done',r=>r.finished_at=iso(-1),r=>r.cancel_requested=true,r=>r.reconciliation_required=true]){const r=run();mutate(r);assert.deepEqual(classify(facts([r])),unknown)}
})
test('stale/missing/contradictory claims and terminal anomalies remain unknown',()=>{
 for(const change of[{claim_id:null},{claimed_at:iso(1)},{lease_until:iso(0)},{lease_until:'bad'},{claim_id:'bad'},{claimed_at:null},{claimed_at:iso(-5),lease_until:iso(-10)}])assert.deepEqual(classify(facts([{...run(),...change}])),unknown)
 for(const status of ['pending','awaiting_approval'])assert.equal(classify(facts([{...run(status),claim_id:C}])).state,'unknown')
 for(const value of [NaN,Infinity])assert.equal(projectWorkflowState(facts(),selection,value).state,'unknown')
})
test('workflow endpoints are off by default without touching owner or database',async()=>{
 let touched=false;const api=createWorkflowVisitHandlers({enabled:()=>false,owner:async()=>{touched=true;throw Error()},rpc:async()=>{touched=true;throw Error()}})
 assert.equal((await api.create(request('create'))).status,503);assert.equal((await api.presence(request())).status,503);assert.equal(touched,false)
 const h=harness({enabled:'true'});assert.equal((await h.api.presence(request())).status,503);assert.equal(h.calls.length,0)
})
test('owner makes a new exact workflow grant, with no secret/session echo',async()=>{
 const h=harness(),response=await h.api.create(request('create'));assert.equal(response.status,200);const text=await response.text();for(const value of [secret,digest,U,S])assert(!text.includes(value));assert.equal(h.calls[0].name,'office_visit_workflow_create');assert.equal(h.calls[0].args.p_owner,U);assert.equal(h.calls[0].args.p_session,S)
 for(const owner of [null,{ownerId:U,sessionId:'bad'}]){const x=harness({owner});assert.equal((await x.api.create(request('create'))).status,401);assert.equal(x.calls.length,0)}
})
test('new scope requires explicit exact consent/protocol and same origin before writes',async()=>{
 for(const change of[{readScope:'step_activity_v1'},{readScope:undefined},{nativeWorkflowProtocol:'true'},{nativeWorkflowProtocol:1},{nativeWorkflowProtocol:undefined},{avatarId:'office-prompt-pling'},{projectId:'bad'},{owner_id:U}]){const h=harness();assert.equal((await h.api.create(request('create',{...grant,...change}))).status,400);assert.equal(h.calls.length,0)}
 for(const headers of [{Origin:'https://evil.test'},{Origin:'null'},{Authorization:'Bearer fake'},{'sec-fetch-site':'cross-site'}]){const h=harness();assert.equal((await h.api.create(request('create',grant,headers))).status,403);assert.equal(h.calls.length,0)}
})
test('native workflow read uses dedicated secret boundary and minimal DTO',async()=>{
 const h=harness({mutate:r=>{r.secret='SECRET';r.workflowFacts.prompt='SECRET'}}),response=await h.api.presence(request());assert.equal(response.status,200);const data=await response.json();assert.equal(data.workflow_state,'idle');assert.equal(data.execution,'not_verified');assert.equal(data.coverage,'complete');assert.equal(data.scope,'workflow_state_v1');assert(data.expires_at_unix-data.observed_at_unix<=20);assert.equal(h.calls[0].args.p_digest,digest)
 assert.deepEqual(Object.keys(data).sort(),['schema','scope','visit_id','avatar_id','project_id','agent_id','revision','observed_at_unix','expires_at_unix','workflow_state','coverage','execution'].sort());assert(!JSON.stringify(data).includes('SECRET'));assert.match(response.headers.get('cache-control'),/private, no-store/)
 for(const headers of [{Cookie:'session=forbidden'},{Authorization:'Bearer fake'},{Origin:'https://omniraos.se'},{'x-omnira-office-visit':'bad'}]){const x=harness();assert.equal((await x.api.presence(request('presence',{visitId:V},headers))).status,403);assert.equal(x.calls.length,0)}
})
test('a running claim shortens busy; failed census is unknown, never idle',async()=>{
 const h=harness({mutate:r=>{r.workflowFacts=facts([run()])}});const response=await h.api.presence(request());assert.equal(response.status,200);const data=await response.json();assert.equal(data.workflow_state,'busy');assert(data.expires_at_unix<=Date.parse(run().lease_until)/1000)
 for(const f of [{complete:false,runs:[]},facts([{...run(),reconciliation_required:true}]),facts([{...run(),steps_snapshot:null}])]){const x=harness({mutate:r=>{r.workflowFacts=f}});const response=await x.api.presence(request());assert.equal(response.status,200);assert.equal((await response.json()).workflow_state,'unknown')}
})
test('legacy scope, malformed revision, stale/future RPC metadata fail closed',async()=>{
 for(const change of [{readScope:'identity_v1'},{readScope:'step_activity_v1'},{readScope:undefined},{nativeWorkflowProtocol:true},{workflowRevision:0},{workflowRevision:true},{workflowRevision:1.5},{workflowRevision:2**53},{generatedAt:iso(-21000)},{generatedAt:iso(20000)},{visitId:A}]){const h=harness({mutate:r=>Object.assign(r,change)});assert.equal((await h.api.presence(request())).status,503)}
 const h=harness({mutate:r=>{r.generatedAt=iso(-10000);r.workflowFacts=facts([{...run(),claimed_at:iso(-20000),lease_until:iso(-5000)}])}});assert.equal((await h.api.presence(request())).status,503)
})
test('strict JSON rejects duplicate keys and extra inputs; errors are redacted',async()=>{
 for(const data of ['{"visitId":"'+V+'","visitId":"'+V+'"}',{visitId:V,state:'idle'},' '.repeat(2049),'[1]',{visitId:{id:V}}]){const h=harness();assert.equal((await h.api.presence(request('presence',data))).status,400);assert.equal(h.calls.length,0)}
 const h=harness({error:true}),r=await h.api.presence(request());assert.equal(r.status,503);assert(!((await r.text()).includes('SECRET_DATABASE_DIAGNOSTIC')))
})
test('old endpoints never gain a workflow grant through the new metadata parser',async()=>{
 const calls=[],old=createVisitHandlers({owner:async()=>({ownerId:U,sessionId:S}),rpc:async(name,args)=>{calls.push({name,args});return row()}})
 const legacy={visitId:V,secretDigest:digest,projectId:P,agentId:A,avatarId:'office-familje-pling'};assert.equal((await old.create(request('create',legacy))).status,503);assert.equal((await old.presence(request())).status,503)
})
