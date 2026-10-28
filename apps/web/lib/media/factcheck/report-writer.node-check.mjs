import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {readFileSync} from 'node:fs'

const stub=source=>({url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true})
registerHooks({
  resolve(specifier,ctx,next) {
    if (specifier==='server-only') return stub('export {}')
    if (specifier==='@/lib/supabase/admin') {
      return stub('export function createAdminClient(){return globalThis.__factcheckFakeDb()}')
    }
    if (specifier==='@/lib/cost/spend-gate-flag') {
      return stub('export function isSpendGateEnforced(){return globalThis.__factcheckHardGate===true}')
    }
    if (['./report-record','./contract','./independent-review',
      './reviewer-preview','./source-collector'].includes(specifier) &&
      ctx.parentURL?.includes('/factcheck/')) return next(specifier+'.ts',ctx)
    return next(specifier,ctx)
  },
})

const {persistFactCheckReport}=await import('./report-writer.ts')
const {evaluateIndependentReview}=await import('./independent-review.ts')
const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const scriptId='b9271d5b-5254-4ad8-a36c-ce7c66e9c63e'
const runId='94e620bf-31d4-401c-baf8-ec1521f5ba13'
const claimId='824ecfe1-cbda-4a7a-9de5-7683d454bc08'
const reportId='28d29a7d-506c-487f-a5f9-7aa6ff1c5874'
const now=Date.parse('2026-10-28T11:40:00Z')
const material={
  projectId,scriptId,revisionId:'v1',
  hook:'Researchers published a new public research API.',
  script:'Developers can read the official documentation today.',
  captions:['Researchers published a new public research API.'],
  socialCaption:'Developers can read the official documentation today.',
  cta:'The documentation is available to the public.',
  riskTier:'standard',
}
const textSource=[material.hook,material.script,material.cta,
  'All additional technical documentation is published on the official page.'].join(' ')
const sources=[
  {id:'source-0',url:'https://www.gov.uk/government/news/research-tool',
    publisherGroup:'uk-government',kind:'primary',
    retrievedAt:new Date(now).toISOString(),text:textSource+' First publisher.'},
  {id:'source-1',url:'https://www.reuters.com/world/public-api-announcement',
    publisherGroup:'reuters',kind:'independent_reporting',
    retrievedAt:new Date(now).toISOString(),text:textSource+' Independent publisher.'},
]
const input=(review,patch={})=>({
  material,sources,review,
  authority:{kind:'RUN_BOUND',runId,claimId,context:'AUTONOMOUS'},
  nowMs:now,...patch,
})

async function checkedReview(m=material,s=sources){
  return evaluateIndependentReview(m,s,m.projectId,'claude-sonnet-4-6',now,
    async prompt=>{
      const {requiredUnits}=JSON.parse(prompt.user)
      return JSON.stringify({
        framing:'faithful_to_evidence',
        framingReason:'The mock evidence contains all synthetic claims.',
        findings:requiredUnits.map(unit=>({
          unitId:unit.id,exactText:unit.text,verdict:'supported',
          explanation:'The synthetic sentence appears in both documents.',
          evidence:[{sourceId:'source-0',exactQuote:unit.text},
            {sourceId:'source-1',exactQuote:unit.text}],
        })),
      })
    })
}

function makeDb(overrides={}){
  const history=[]
  const project={id:projectId,slug:'ai-media-automation'}
  const script={id:scriptId,project_id:projectId,version:1,
    hook:material.hook,script:material.script,
    captions:[...material.captions],cta:material.cta,
    raw_output:{writer_model:'claude-sonnet-4-6'}}
  const run={id:runId,project_id:projectId,claim_id:claimId,status:'running',
    cancel_requested:false,lease_until:new Date(now+60000).toISOString()}
  const rows={projects:overrides.project===undefined?project:overrides.project,
    media_scripts:overrides.script===undefined?script:overrides.script,
    runs:overrides.run===undefined?run:overrides.run}
  const db={
    from(table){
      const filters=[]
      let insertBody=null
      const builder={
        select(){return builder},
        eq(field,value){filters.push([field,value]);return builder},
        async maybeSingle(){
          history.push({action:'read',table,filters})
          return {data:rows[table]??null,error:null}
        },
        insert(body){
          history.push({action:'insert',table,body})
          insertBody=body
          return builder
        },
        async single(){
          if(insertBody && overrides.insertError){
            return {data:null,error:{code:'TEST_NETWORK_AMBIGUITY'}}
          }
          return {data:{id:reportId},error:null}
        },
      }
      return builder
    },
  }
  return {db,history}
}

function setup(db){
  delete process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED
  delete process.env.THE_PROMPT_FACTCHECK_MODEL_ENABLED
  globalThis.__factcheckHardGate=false
  globalThis.__factcheckFakeDb=()=>{
    if(!db) throw new Error('unexpected database access')
    return db
  }
}
test('default-off feature gate refuses WITHOUT a database read or API call',async()=>{
  setup()
  const result=await persistFactCheckReport(input(null))
  assert.deepEqual(result,{status:'hold',reason:'factcheck_report_writes_disabled'})
})
test('writer requires BOTH flags and enforced hard spend gate',async()=>{
  setup()
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  assert.equal((await persistFactCheckReport(input(null))).status,'hold')
  process.env.THE_PROMPT_FACTCHECK_MODEL_ENABLED='true'
  assert.equal((await persistFactCheckReport(input(null))).reason,
    'factcheck_review_and_hard_spend_gate_required')
})
test('run must hold genuine UUID-bound claim before even reading project',async()=>{
  setup()
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_MODEL_ENABLED='true'
  globalThis.__factcheckHardGate=true
  const r=await persistFactCheckReport(input(null,{authority:{
    kind:'RUN_BOUND',runId:'forged',claimId,context:'AUTONOMOUS'}}))
  assert.equal(r.reason,'owned_factcheck_run_required')
})

test('unknown script writer metadata cannot be guessed or written',async()=>{
  const review=await checkedReview()
  const {db,history}=makeDb({script:{
    id:scriptId,project_id:projectId,version:1,
    hook:material.hook,script:material.script,captions:material.captions,
    cta:material.cta,raw_output:{hook:material.hook},
  }})
  setup(db)
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_MODEL_ENABLED='true'
  globalThis.__factcheckHardGate=true
  const result=await persistFactCheckReport(input(review))
  assert.equal(result.reason,'factcheck_writer_provenance_absent')
  assert.equal(history.filter(x=>x.action==='insert').length,0)
})

test('stale claims or wrong project cannot reach INSERT',async()=>{
  const review=await checkedReview()
  const {db,history}=makeDb({run:{
    id:runId,project_id:projectId,claim_id:'6f4b3fd8-1f76-4f33-bec5-d63c39fd0978',
    status:'running',cancel_requested:false,lease_until:new Date(now+60000).toISOString(),
  }})
  setup(db)
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_MODEL_ENABLED='true'
  globalThis.__factcheckHardGate=true
  const result=await persistFactCheckReport(input(review))
  assert.equal(result.reason,'factcheck_claim_fenced')
  assert.equal(history.filter(x=>x.action==='insert').length,0)
})

test('valid report creates exactly ONE project-bound append-only insert',async()=>{
  const review=await checkedReview()
  const {db,history}=makeDb()
  setup(db)
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_MODEL_ENABLED='true'
  globalThis.__factcheckHardGate=true
  const result=await persistFactCheckReport(input(review))
  assert.deepEqual(result,{
    status:'recorded',reportId,outcome:'ready_for_editor',
  })
  const calls=history.filter(x=>x.action==='insert')
  assert.equal(calls.length,1)
  assert.equal(calls[0].table,'media_factcheck_reports')
  assert.equal(calls[0].body.project_id,projectId)
  assert.equal(calls[0].body.run_id,runId)
  assert.equal(calls[0].body.claim_id,claimId)
  assert.equal(calls[0].body.outcome,'ready_for_editor')
  assert.equal(calls[0].body.source_receipts.length,2)
  assert.equal(history.filter(x=>x.action==='read').length,3)
})
test('ambiguous insert error fails closed and does NOT auto retry',async()=>{
  const review=await checkedReview()
  const {db,history}=makeDb({insertError:true})
  setup(db)
  process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED='true'
  process.env.THE_PROMPT_FACTCHECK_MODEL_ENABLED='true'
  globalThis.__factcheckHardGate=true
  const result=await persistFactCheckReport(input(review))
  assert.equal(result.reason,'factcheck_ledger_write_unconfirmed')
  assert.equal(history.filter(x=>x.action==='insert').length,1)
})

test('server-side report writer is dormant in all media routes',async()=>{
  const {readdirSync}=await import('node:fs')
  const {join}=await import('node:path')
  const files=[]
  const walk=(dir)=>{
    for(const item of readdirSync(dir,{withFileTypes:true})){
      const path=join(dir,item.name)
      if(item.isDirectory()) walk(path)
      else if(item.isFile() && (path.endsWith('.ts') || path.endsWith('.tsx'))) files.push(path)
    }
  }
  walk('apps/web/app/api/media')
  assert.ok(files.length>20,'expected real media API route files')
  for(const file of files){
    const source=readFileSync(file,'utf8')
    assert.equal(
      source.includes('persistFactCheckReport') ||
      source.includes('factcheck/report-writer') ||
      source.includes('factcheck/governed-reviewer'),
      false,'Unauthorized FactCheck activation in '+file)
  }
})
