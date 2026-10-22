import {describe,it,expect} from 'vitest'
import {handleCodeWorkIntakeDraft} from '@/lib/atlas/code-work/intake/preview-http'
import {parseCodeWorkInstruction} from '@/lib/atlas/code-work/intake/instruction'
const good={ok:true,userId:'synthetic',email:'operator@example.invalid',actor:'user:synthetic'} as const
const unauth={ok:false,reason:'unauthenticated'} as const
const forbidden={ok:false,reason:'not_platform_operator'} as const
const instruction='Atlas, planera kodjobb: Rätta texten | typ: ui_fix | filer: apps/web/lib/ui/display-preferences.ts'
function request(body:unknown,options:{origin?:string;host?:string;method?:string}={}){
 return new Request('https://omnira.test/api/atlas/code-work/intake-draft',{
  method:options.method??'POST',
  headers:{'Content-Type':'application/json',Host:options.host??'omnira.test',
   ...(options.origin===undefined?{Origin:'https://omnira.test'}:options.origin?{Origin:options.origin}:{})},
  body:JSON.stringify(body),
 })
}
const unavailable=async()=>({ok:false,reason:'trusted_git_base_unavailable'} as const)
const observed=async()=>({ok:true,repositoryId:'github.com/bumbi190/ai-operating-platform',baseRef:'refs/heads/main',pinnedBaseSha:'a'.repeat(40)} as const)
const post=(body:unknown,operator:any=async()=>good)=>handleCodeWorkIntakeDraft(request(body),{operator,gitBase:unavailable})
describe('inert authenticated code-work intake endpoint',()=>{
 it('rejects missing/wrong origin before calling the operator identity service',async()=>{
  let calls=0
  for(const origin of ['', 'https://attacker.invalid']){
   const r=await handleCodeWorkIntakeDraft(request({instruction,inputSource:'text'},{origin}),{operator:async()=>{calls++;return good}})
   expect(r.status).toBe(403)
   expect(r.headers.get('cache-control')).toBe('private, no-store')
  }
  expect(calls).toBe(0)
 })
 it('rejects unauthenticated and unconfigured/nonoperator callers without parsing',async()=>{
  for(const [actor,status] of [[async()=>unauth,401],[async()=>forbidden,404]] as const){
   const r=await post({instruction,inputSource:'text'},actor)
   expect(r.status).toBe(status)
   expect((await r.json())).not.toHaveProperty('draft')
  }
 })
 it('accepts a validated explicit text request but never returns an approval or bound SHA',async()=>{
  const r=await post({instruction,inputSource:'text'})
  expect(r.status).toBe(200)
  expect(r.headers.get('cache-control')).toBe('private, no-store')
  const body=await r.json()
  expect(body).toMatchObject({status:'binding_required',executionEnabled:false,
   approvalAvailable:false,reason:'trusted_git_base_unavailable',
   draft:{objective:'Rätta texten',kind:'ui_fix',writePaths:['apps/web/lib/ui/display-preferences.ts']}})
  expect(JSON.stringify(body)).not.toMatch(/pinnedBaseSha|authorizationId|admissionHash|tokenHash|previewFingerprint/)
 })
 it('the voice transcript passes the same parser without any changed authority',async()=>{
  const r=await post({instruction,inputSource:'voice'})
  const body=await r.json()
  expect(body.status).toBe('binding_required')
  expect(body.executionEnabled).toBe(false)
  expect(body.draft.kind).toBe('ui_fix')
 })
 it('returns missing details rather than a guessed scope',async()=>{
  const r=await post({instruction:'Atlas, planera kodjobb: Fixa knappen',inputSource:'text'})
  expect(await r.json()).toMatchObject({status:'needs_details',
   missing:['kind','writePaths'],executionEnabled:false})
 })
 it('refuses every caller-provided repository, SHA, risk, budget or authorization field',async()=>{
  for(const extra of [{pinnedBaseSha:'a'.repeat(40)},{repositoryId:'github.com/foo/bar'},
   {approved:true},{localQualified:true},{budget:100},{principalId:'synthetic'},
   {modelId:'expensive'},{securitySensitive:false}]){
   const r=await post({instruction,inputSource:'text',...extra})
   expect(r.status).toBe(400)
   expect((await r.json())).toMatchObject({executionEnabled:false})
  }
 })
 it('rejects unsupported source, excessive instructions and malformed request bodies',async()=>{
  for(const body of [{instruction,inputSource:'browser'}, {instruction:'x'.repeat(5000),inputSource:'text'},
   {instruction:27,inputSource:'text'}, {instruction}, {inputSource:'text'}]){
   expect((await post(body)).status).toBe(400)
  }
 })
 it('does not use chat messages or operation strings as fake approval',async()=>{
  const r=await post({instruction:'Godkänn kodjobbet',inputSource:'text'})
  expect(await r.json()).toMatchObject({status:'not_code_work_intent',executionEnabled:false})
  expect(parseCodeWorkInstruction('Starta och mergea allt','voice')).toMatchObject({status:'not_code_work_intent'})
 })
})

describe('verified Git read without a registered owned-project mapping',()=>{
 it('displays a server-verified main SHA and risk/cost proposal but never enables approval',async()=>{
  const result=await handleCodeWorkIntakeDraft(request({instruction,inputSource:'text'}),{operator:async()=>good,gitBase:observed})
  expect(result.status).toBe(200)
  const body=await result.json()
  expect(body).toMatchObject({
   status:'project_binding_required',projectBindingVerified:false,executionEnabled:false,approvalAvailable:false,
   reason:'owned_project_repository_mapping_unconfigured',
   verifiedGit:{repositoryId:'github.com/bumbi190/ai-operating-platform',baseRef:'refs/heads/main',pinnedBaseSha:'a'.repeat(40)},
   proposed:{risk:'low',authorProfile:'standard',authorCapSek:2,reviewerCapSek:3,
    totalCapSek:5,requiresOwnerChoice:true,requiresIndependentReview:true},
  })
  expect(body.proposed.previewFingerprint).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(body)).not.toMatch(/authorizationId|workId|grantId|brokerToken/)
 })
 it('automatically flags security-sensitive paths as high risk despite innocent wording',async()=>{
  const input='Atlas, planera kodjobb: Ändra etiketten | typ: ui_fix | filer: apps/web/lib/atlas/code-work/policy.ts'
  const r=await handleCodeWorkIntakeDraft(request({instruction:input,inputSource:'voice'}),{
   operator:async()=>good,gitBase:observed,
  })
  expect(await r.json()).toMatchObject({status:'project_binding_required',
   proposed:{risk:'high',authorProfile:'complex',totalCapSek:13,requiresOwnerChoice:true},
   approvalAvailable:false,executionEnabled:false})
 })
 it('does not ask GitHub on malformed, non-code, or incomplete instructions',async()=>{
  let calls=0
  const gitBase=async()=>{calls++;return observed()}
  for(const instr of ['Hej Atlas','planera kodjobb: fixa något','planera kodjobb: x | typ: bogus | filer: x/y.ts']){
   await handleCodeWorkIntakeDraft(request({instruction:instr,inputSource:'text'}),{
    operator:async()=>good,gitBase,
   })
  }
  expect(calls).toBe(0)
 })
})
