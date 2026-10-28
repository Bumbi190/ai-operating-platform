import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
registerHooks({resolve(specifier,ctx,next){
  if (specifier==='server-only') {
    return next('data:text/javascript,export {}',ctx)
  }
  if (specifier==='@/lib/supabase/server') {
    return next('data:text/javascript,export async function createClient(){return globalThis.__ownerAuthClient()}',ctx)
  }
  if (specifier==='@/lib/supabase/admin') {
    return next('data:text/javascript,export function createAdminClient(){return globalThis.__ownerAdminClient()}',ctx)
  }
  if (['./contract','./source-collector','./editorial-admission',
    './owner-decision-intent'].includes(specifier) &&
      ctx.parentURL?.includes('/factcheck/')) {
    return next(specifier+'.ts',ctx)
  }
  if (specifier==='../script-writer-provenance' &&
      ctx.parentURL?.includes('/factcheck/')) {
    return next(specifier+'.ts',ctx)
  }
  return next(specifier,ctx)
}})
const {parseOwnerDecisionRequest,prepareOwnerEditorialDecision}
  =await import('./owner-decision-intent.ts')
const {submitAuthenticatedFactCheckDecision}
  =await import('./owner-decision-writer.ts')
const {contentDigest}=await import('./contract.ts')
const {stampedScriptOutput}=await import('../script-writer-provenance.ts')

const NOW=Date.parse('2026-10-28T10:00:00Z')
const ago=m=>new Date(NOW-m*60_000).toISOString()
const pid='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const sid='b9271d5b-5254-4ad8-a36c-ce7c66e9c63e'
const owner='66666666-6666-4666-8666-666666666666'
const reportId='77777777-7777-4777-8777-777777777777'
const digest='d'.repeat(64)
const material={
  projectId:pid,scriptId:sid,revisionId:'v1',
  hook:'Researchers released a new public API.',
  script:'The official developer documentation was published today.',
  captions:['Public research API'],
  cta:'Read the official technical documentation.',
  socialCaption:'The public research API is available.',
  thumbnailText:'Research API',riskTier:'standard',
}
const author={
  hook:material.hook,script:material.script,
  captions:[...material.captions],hashtags:['#AI'],
  cta:material.cta,tone:'educational',estimated_duration:'~22 seconds',
  difficulty:'intermediate',
}
const project={id:pid,slug:'ai-media-automation',
  owner_id:owner,execution_paused:false}
const script={
  id:sid,project_id:pid,version:1,...author,
  raw_output:stampedScriptOutput(author,{
    type:'message',id:'msg_original',model:'claude-sonnet-4-6',
  },1),
}
const evidence=[
 {sourceId:'source-0',exactQuote:'Researchers released a new public API.'},
 {sourceId:'source-1',exactQuote:'Researchers released a new public API.'},
]
const report={
  id:reportId,project_id:pid,script_id:sid,script_version:1,
  revision_id:'v1',content_sha256:contentDigest(material),
  source_set_sha256:digest,reviewer_model:'gpt-5.4-mini',
  writer_model:'claude-sonnet-4-6',risk_tier:'standard',
  outcome:'ready_for_editor',framing:'faithful_to_evidence',
  reasons:[],reviewed_at:ago(30),recorded_at:ago(25),
  manuscript_snapshot:{...material},
  source_receipts:[
    {sourceId:'source-0',publisherGroup:'bbc',
      url:'https://www.bbc.com/news/research-api',textSha256:'a'.repeat(64)},
    {sourceId:'source-1',publisherGroup:'reuters',
      url:'https://www.reuters.com/world/research-api',textSha256:'b'.repeat(64)},
  ],
  findings:[
    {unitId:'hook:0',verdict:'supported',evidence},
    {unitId:'script:0',verdict:'supported',evidence},
  ],
}
const request={
  reportId,expectedScriptId:sid,expectedScriptVersion:1,
  expectedRevisionId:'v1',expectedContentSha256:report.content_sha256,
  expectedSourceSetSha256:digest,decision:'approve',
  notes:'I read both sources and reviewed the entire unchanged script.',
  sensitiveRiskAcknowledged:false,
}
function run(raw=request,more={}){
  const parsed=parseOwnerDecisionRequest(raw)
  if(!parsed) return {ok:false,reason:'request_not_valid'}
  return prepareOwnerEditorialDecision({
    request:parsed,project,script,report,authenticatedUserId:owner,
    nowMs:NOW,...more,
  })
}
const hold=r=>assert.equal(r.ok,false,'Expected HOLD, got '+JSON.stringify(r))

test('client request has an exact 9-field grammar and no identity authoring',()=>{
  assert.ok(parseOwnerDecisionRequest(request))
  for(const key of ['decided_by','project_id','reportHash','approved',
    'reviewerRunId','decidedAt','publicationAuthority','status']){
    hold(run({...request,[key]:'an-attacker-supplied-value'}))
  }
  hold(run({...request,decision:'published'}))
  hold(run({...request,notes:'ok'}))
  hold(run({...request,expectedScriptVersion:0}))
  hold(run({...request,expectedContentSha256:'broken'}))
  hold(run({...request,expectedRevisionId:'v2'}))
  hold(run({...request,sensitiveRiskAcknowledged:'yes'}))
  hold(run('not a JSON object'))
})

test('approval uses ONLY trusted current project, report, owner and exact digest',()=>{
  const result=run()
  assert.equal(result.ok,true)
  if(!result.ok)return
  const row=result.row
  assert.equal(row.project_id,pid)
  assert.equal(row.report_id,reportId)
  assert.equal(row.decided_by,owner)
  assert.equal(row.content_sha256,report.content_sha256)
  assert.equal(row.source_set_sha256,digest)
  assert.equal(row.script_version,1)
  assert.equal(row.decision,'approve')
  assert.equal(Object.hasOwn(row,'canPublish'),false)
  assert.equal(Object.hasOwn(row,'decided_at'),false)
  assert.equal(Object.isFrozen(row),true)
})

test('a non-owner or altered/paused project cannot submit any decision',()=>{
  for(const changes of [
    {authenticatedUserId:sid},
    {project:{...project,owner_id:sid}},
    {project:{...project,execution_paused:true}},
    {project:{...project,slug:'handlarborsen'}},
    {project:{...project,id:sid}},
  ]) hold(run(request,changes))
})

test('old version, swapped report, altered script or stale source hash fail closed',()=>{
  for(const changes of [
    {script:{...script,version:2}},
    {script:{...script,hook:'Misleading rewritten title'}},
    {script:{...script,captions:['Different caption']}},
    {report:{...report,project_id:sid}},
    {report:{...report,revision_id:'v2'}},
    {report:{...report,source_set_sha256:'c'.repeat(64)}},
    {report:{...report,content_sha256:'c'.repeat(64)}},
  ]) hold(run(request,changes))
  hold(run({...request,expectedScriptId:owner}))
  hold(run({...request,expectedContentSha256:'c'.repeat(64)}))
  hold(run({...request,expectedSourceSetSha256:'c'.repeat(64)}))
})

test('unverified facts cannot receive owner approval',()=>{
  const bad={
    ...report,outcome:'requires_review',framing:'unverified',
    reasons:['claim_unverified'],
    findings:[{unitId:'hook:0',verdict:'unsupported',evidence:[]}],
  }
  hold(run(request,{report:bad}))
})

test('a written rejection of unsupported claims stays possible but is NOT approval',()=>{
  const bad={
    ...report,outcome:'requires_review',framing:'unverified',
    reasons:['claim_unverified'],
    findings:[{unitId:'hook:0',verdict:'unsupported',evidence:[]}],
  }
  const result=run({...request,decision:'reject',
    notes:'I checked the material and rejected this unsupported report.'},
    {report:bad})
  assert.equal(result.ok,true)
  if(result.ok){
    assert.equal(result.row.decision,'reject')
    assert.equal(result.row.decided_by,owner)
  }
})

test('a source change or forged provider stamp cannot be approved',()=>{
  for(const changed of [
    {report:{...report,source_receipts:[]}},
    {report:{...report,findings:[{unitId:'hook:0',verdict:'misleading',
      evidence:[]}]}},
    {script:{...script,raw_output:{writer_model:'claude-sonnet-4-6'}}},
    {report:{...report,reviewer_model:'claude-sonnet-4-6'}},
    {report:{...report,recorded_at:ago(4000)}},
  ]) hold(run(request,changed))
})

test('a sensitive-only HOLD needs a detailed human risk acknowledgment',()=>{
  const mat={...material,riskTier:'sensitive'}
  const signed={...report,risk_tier:'sensitive',outcome:'requires_review',
    reasons:['sensitive_or_unclassified'],content_sha256:contentDigest(mat),
    manuscript_snapshot:mat,
  }
  const edited={...request,expectedContentSha256:signed.content_sha256,
    notes:'I checked the cited sources thoroughly and acknowledge the heightened risk in this particular sensitive article.',
    sensitiveRiskAcknowledged:true,
  }
  assert.equal(run(edited,{report:signed}).ok,true)
  hold(run({...edited,sensitiveRiskAcknowledged:false},{report:signed}))
  hold(run({...edited,notes:'Risk acknowledged.'},{report:signed}))
})

test('no accepted owner decision grants an actual media action',()=>{
  const good=run()
  assert.equal(good.ok,true)
  if(!good.ok)return
  assert.equal(Object.keys(good.row).some(k=>/render|publish|media|spend/i.test(k)),false)
})

function mockDb(options={}){
  const calls=[]
  const rows={
    projects:options.project===undefined?project:options.project,
    media_factcheck_reports:options.report===undefined?report:options.report,
    media_scripts:options.script===undefined?script:options.script,
  }
  const db={
    from(name){
      const filters=[]
      let insertBody
      const chain={
        select(columns){calls.push({action:'select',name,columns});return chain},
        eq(field,value){filters.push([field,value]);return chain},
        async maybeSingle(){
          calls.push({action:'read',name,filters:[...filters]})
          const row=rows[name]
          if(!row)return {data:null,error:null}
          if(filters.some(([field,value])=>row[field]!==value))
            return {data:null,error:null}
          return {data:row,error:null}
        },
        insert(payload){
          insertBody=payload
          calls.push({action:'insert',name,payload})
          return chain
        },
        async single(){
          if(insertBody && options.insertError)
            return {data:null,error:{code:'CONNECTION_RESET'}}
          return {data:{id:'39393939-3939-4939-8939-393939393939'},
            error:null}
        },
      }
      return chain
    },
  }
  return {db,calls}
}
function writerSetup(db,auth=true){
  delete process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED
  delete process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED
  const events=[]
  globalThis.__ownerAuthClient=()=>{
    events.push('auth_client_created')
    return {auth:{getUser:async()=>{
      events.push('getUser')
      return auth===false
        ? {data:{user:null},error:{message:'unauthenticated'}}
        : {data:{user:{id:auth===true?owner:auth}},error:null}
    }}}
  }
  globalThis.__ownerAdminClient=()=>{
    events.push('admin_client_created')
    if(!db)throw new Error('unexpected privileged DB call')
    return db
  }
  return events
}

test('dormant server writer rejects before auth or privileged DB access',async()=>{
  const events=writerSetup(null)
  const out=await submitAuthenticatedFactCheckDecision(request)
  assert.deepEqual(out,{status:'hold',reason:'factcheck_owner_decisions_disabled'})
  assert.deepEqual(events,[])
})

test('even explicit editor flag cannot run without separately enabled report ledger',async()=>{
  const events=writerSetup(null)
  process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED='true'
  const out=await submitAuthenticatedFactCheckDecision(request)
  assert.equal(out.reason,'factcheck_owner_decisions_disabled')
  assert.deepEqual(events,[])
})

test('malicious body with actor spoofing is denied before session or DB',async()=>{
  const events=writerSetup(null)
  process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  const out=await submitAuthenticatedFactCheckDecision({
    ...request,decided_by:owner,project_id:pid,
  })
  assert.equal(out.reason,'factcheck_decision_invalid_request')
  assert.deepEqual(events,[])
})

test('no session always refuses before any service-role client is constructed',async()=>{
  const {db,calls}=mockDb()
  const events=writerSetup(db,false)
  process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  const out=await submitAuthenticatedFactCheckDecision(request)
  assert.equal(out.reason,'factcheck_owner_session_required')
  assert.deepEqual(events,['auth_client_created','getUser'])
  assert.deepEqual(calls,[])
})

test('a logged-in project outsider cannot see the report or INSERT',async()=>{
  const {db,calls}=mockDb()
  const events=writerSetup(db,sid)
  process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  const out=await submitAuthenticatedFactCheckDecision(request)
  assert.equal(out.reason,'factcheck_project_owner_required')
  assert.deepEqual(events,[
    'auth_client_created','getUser','admin_client_created',
  ])
  assert.equal(calls.some(x=>x.name==='media_factcheck_reports'),false)
  assert.equal(calls.some(x=>x.action==='insert'),false)
})

test('auth-verified owner can send exactly one bound decision after DB reads',async()=>{
  const {db,calls}=mockDb()
  const events=writerSetup(db,true)
  process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  const out=await submitAuthenticatedFactCheckDecision(request)
  assert.equal(out.status,'recorded')
  assert.equal(out.decision,'approve')
  assert.deepEqual(events,['auth_client_created','getUser','admin_client_created'])
  const reads=calls.filter(c=>c.action==='read')
  assert.deepEqual(reads.map(c=>c.name),[
    'projects','media_factcheck_reports','media_scripts',
  ])
  assert.deepEqual(reads[1].filters,[
    ['id',reportId],['project_id',pid],
  ])
  assert.deepEqual(reads[2].filters,[
    ['id',sid],['project_id',pid],
  ])
  const inserts=calls.filter(c=>c.action==='insert')
  assert.equal(inserts.length,1)
  assert.equal(inserts[0].name,'media_factcheck_editorial_decisions')
  assert.equal(inserts[0].payload.decided_by,owner)
  assert.equal(inserts[0].payload.content_sha256,report.content_sha256)
  assert.equal(Object.hasOwn(inserts[0].payload,'decided_at'),false)
  assert.equal(Object.hasOwn(inserts[0].payload,'canPublish'),false)
})

test('changed current manuscript and unreviewed facts cannot reach INSERT',async()=>{
  for(const mode of ['version','writer','report']){
    const changes=mode==='version'?{script:{...script,version:2}}
      :mode==='writer'?{script:{...script,
        raw_output:{writer_model:'claude-sonnet-4-6'}}}
      :{report:{...report,outcome:'requires_review',
        framing:'unverified',reasons:['claim_unverified']}}
    const {db,calls}=mockDb(changes)
    writerSetup(db,true)
    process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED='true'
    process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
    const out=await submitAuthenticatedFactCheckDecision(request)
    assert.equal(out.status,'hold',mode)
    assert.equal(calls.some(x=>x.action==='insert'),false,mode)
  }
})

test('foreign report selector cannot cause a cross-project read',async()=>{
  const {db,calls}=mockDb()
  writerSetup(db,true)
  process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  const out=await submitAuthenticatedFactCheckDecision({
    ...request,reportId:'48484848-4848-4848-8848-484848484848',
  })
  assert.equal(out.reason,'factcheck_report_unavailable')
  assert.equal(calls.some(c=>c.action==='insert'),false)
})

test('ambiguous insert never retries and cannot return fabricated approval',async()=>{
  const {db,calls}=mockDb({insertError:true})
  writerSetup(db,true)
  process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  const out=await submitAuthenticatedFactCheckDecision(request)
  assert.equal(out.reason,'factcheck_editorial_write_unconfirmed')
  assert.equal(calls.filter(c=>c.action==='insert').length,1)
})

test('session, project and model error details are not exposed to callers',async()=>{
  const events=writerSetup(null,true)
  process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  const result=await submitAuthenticatedFactCheckDecision(request)
  assert.equal(result.reason,'factcheck_editorial_unavailable')
  assert.equal(events.includes('getUser'),true)
  assert.equal(JSON.stringify(result).includes(owner),false)
})

test('no existing media route imports the dormant owner-decision writer',async()=>{
  const {readFileSync,readdirSync}=await import('node:fs')
  const {join}=await import('node:path')
  let paths=0
  const walk=dir=>{
    for(const item of readdirSync(dir,{withFileTypes:true})){
      const path=join(dir,item.name)
      if(item.isDirectory())walk(path)
      else if(item.isFile() && (path.endsWith('.ts')||path.endsWith('.tsx'))){
        paths++
        const source=readFileSync(path,'utf8')
        assert.equal(
          source.includes('submitAuthenticatedFactCheckDecision') ||
          source.includes('factcheck/owner-decision-writer'),
          false,'unapproved owner-decision API import in '+path)
      }
    }
  }
  walk('apps/web/app/api/media')
  assert.ok(paths>20)
})
