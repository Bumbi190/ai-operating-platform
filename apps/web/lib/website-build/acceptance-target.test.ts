import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
// Mock-only: no Supabase client, auth session or provider is ever constructed.
const access=vi.hoisted(()=>vi.fn())
const admin=vi.hoisted(()=>vi.fn(()=>{throw new Error('ADMIN_CLIENT_REACHED')}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:access}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:admin}))
import {ACCEPTANCE_BRANCH,PRODUCTION_SUPABASE_REF,evaluateAcceptanceTarget} from './acceptance-target'
import {POST as cinematicPost,GET as cinematicGet} from '../../app/api/website-build/studio/cinematic-plan/route'
import {POST as approvePost} from '../../app/api/website-build-plans/[planId]/approve/route'
import {POST as startPost} from '../../app/api/website-build-plans/[planId]/start/route'
import {POST as mockupApprovePost} from '../../app/api/website-build-plans/[planId]/mockups/approve/route'
import {POST as feedbackPost} from '../../app/api/website-builds/[sessionId]/feedback/route'
import {POST as createPost} from '../../app/api/website-builds/route'
import {studioApi} from './studio/api'
import {websitePlanApi} from './planning/api'
import {handleWebsiteBuildTool} from './atlas-tools'
import {handleWebsitePlanningTool} from './planning/chat-tools'
import {POST as referenceAnalysisPost} from '../../app/api/website-build/references/analysis/route'
import {POST as referenceTicketPost} from '../../app/api/website-build/references/tickets/route'
import {POST as referenceFinishPost} from '../../app/api/website-build/references/finish/route'

const ISOLATED='abcdefghijklmnopqrst' // fictional 20-char ref
const isolated={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:ACCEPTANCE_BRANCH,WEBSITE_BUILDER_ACCEPTANCE_MODE:'1',WEBSITE_BUILDER_ACCEPTANCE_SUPABASE_REF:ISOLATED,NEXT_PUBLIC_SUPABASE_URL:`https://${ISOLATED}.supabase.co`,H1_SPEND_GATE:'1'}
const KEYS=[...Object.keys(isolated),'CRON_SECRET']
function setEnv(env:Record<string,string|undefined>){for(const k of KEYS)vi.stubEnv(k,env[k] as string)}
const post=(path:string)=>new Request('https://studio.example'+path,{method:'POST',headers:{origin:'https://studio.example','content-type':'application/json'},body:'{}'})
const plan={params:Promise.resolve({planId:'p1'})},session={params:Promise.resolve({sessionId:'s1'})}
const mutating:[string,()=>Promise<Response>][]=[
 ['cinematic import',()=>cinematicPost(post('/api/website-build/studio/cinematic-plan'))],
 ['plan approve',()=>approvePost(post('/api/website-build-plans/p1/approve'),plan)],
 ['plan build start',()=>startPost(post('/api/website-build-plans/p1/start'),plan)],
 ['mockup approve',()=>mockupApprovePost(post('/api/website-build-plans/p1/mockups/approve'),plan)],
 ['build feedback',()=>feedbackPost(post('/api/website-builds/s1/feedback'),session)],
 ['build create',()=>createPost(post('/api/website-builds'),{params:Promise.resolve({})})],
 ['plan save',()=>websitePlanApi('save',post('/api/website-build-plans'),{})],
 ['studio ensure',()=>studioApi('ensure',post('/api/website-build/studio'))],
 ['studio workspace request',()=>studioApi('workspace-request',post('/api/website-build/studio/workspace-request'))],
 ['studio budget',()=>studioApi('budget',post('/api/website-build/studio/budget'))],
 ['reference analysis',()=>referenceAnalysisPost(post('/api/website-build/references/analysis'))],
 ['reference ticket',()=>referenceTicketPost(post('/api/website-build/references/tickets'))],
 ['reference finish',()=>referenceFinishPost(post('/api/website-build/references/finish'))],
]

beforeEach(()=>{access.mockReset();admin.mockClear();vi.spyOn(console,'warn').mockImplementation(()=>{})})
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks()})

describe('evaluateAcceptanceTarget',()=>{
 it('shares its constants with the read-only preflight script',async()=>{
  const script=await import('../../scripts/website-acceptance-preflight.mjs')
  expect([script.ACCEPTANCE_BRANCH,script.PRODUCTION_SUPABASE_REF]).toEqual([ACCEPTANCE_BRANCH,PRODUCTION_SUPABASE_REF])
 })
 it('is out of scope for production, other branches and local runs',()=>{
  for(const env of [{...isolated,VERCEL_ENV:'production'},{...isolated,VERCEL_GIT_COMMIT_REF:'main'},{...isolated,VERCEL_ENV:undefined},{}]){
   setEnv(env);expect(evaluateAcceptanceTarget()).toEqual({scope:'out_of_scope'})
  }
 })
 it('reports every blocker for the acceptance preview with no provisioning',()=>{
  setEnv({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:ACCEPTANCE_BRANCH,NEXT_PUBLIC_SUPABASE_URL:`https://${PRODUCTION_SUPABASE_REF}.supabase.co`})
  expect(evaluateAcceptanceTarget()).toEqual({scope:'acceptance',allowed:false,blockers:['ACCEPTANCE_MODE_NOT_ENABLED','ISOLATED_REF_MISSING','SUPABASE_URL_NOT_ISOLATED_REF','SPEND_GATE_NOT_ENFORCED']})
 })
 it.each([
  ['production ref authorized',{WEBSITE_BUILDER_ACCEPTANCE_SUPABASE_REF:PRODUCTION_SUPABASE_REF,NEXT_PUBLIC_SUPABASE_URL:`https://${PRODUCTION_SUPABASE_REF}.supabase.co`},['ISOLATED_REF_IS_PRODUCTION','SUPABASE_URL_NOT_ISOLATED_REF']],
  ['URL still on production',{NEXT_PUBLIC_SUPABASE_URL:`https://${PRODUCTION_SUPABASE_REF}.supabase.co`},['SUPABASE_URL_NOT_ISOLATED_REF']],
  ['URL lookalike host',{NEXT_PUBLIC_SUPABASE_URL:`https://${ISOLATED}.supabase.co.evil.example`},['SUPABASE_URL_NOT_ISOLATED_REF']],
  ['URL over http',{NEXT_PUBLIC_SUPABASE_URL:`http://${ISOLATED}.supabase.co`},['SUPABASE_URL_NOT_ISOLATED_REF']],
  ['URL with path',{NEXT_PUBLIC_SUPABASE_URL:`https://${ISOLATED}.supabase.co/x`},['SUPABASE_URL_NOT_ISOLATED_REF']],
  ['malformed ref',{WEBSITE_BUILDER_ACCEPTANCE_SUPABASE_REF:'ABC',NEXT_PUBLIC_SUPABASE_URL:'https://ABC.supabase.co'},['ISOLATED_REF_INVALID','SUPABASE_URL_NOT_ISOLATED_REF']],
  ['mode flag not exactly 1',{WEBSITE_BUILDER_ACCEPTANCE_MODE:'true'},['ACCEPTANCE_MODE_NOT_ENABLED']],
  ['spend gate off',{H1_SPEND_GATE:'0'},['SPEND_GATE_NOT_ENFORCED']],
 ])('blocks when %s',(_name,override,blockers)=>{
  setEnv({...isolated,...override})
  expect(evaluateAcceptanceTarget()).toEqual({scope:'acceptance',allowed:false,blockers})
 })
 it('allows only the fully provisioned isolated target',()=>{
  setEnv(isolated)
  expect(evaluateAcceptanceTarget()).toEqual({scope:'acceptance',allowed:true,ref:ISOLATED})
 })
})

describe('WebBuilder mutating routes on the acceptance preview',()=>{
 it.each(mutating)('%s fails closed before auth or any database client',async(_name,call)=>{
  setEnv({...isolated,NEXT_PUBLIC_SUPABASE_URL:`https://${PRODUCTION_SUPABASE_REF}.supabase.co`})
  const res=await call()
  expect(res.status).toBe(503)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  const body=await res.json()
  expect(body).toEqual({error:'ACCEPTANCE_TARGET_NOT_ISOLATED'})
  expect(JSON.stringify(body)).not.toContain(PRODUCTION_SUPABASE_REF)
  expect(access).not.toHaveBeenCalled()
  expect(admin).not.toHaveBeenCalled()
 })
 it.each(mutating)('%s passes the guard into normal auth when correctly provisioned',async(_name,call)=>{
  setEnv(isolated)
  access.mockResolvedValue({ok:false,response:new Response('Unauthorized',{status:401})})
  expect((await call()).status).toBe(401)
  expect(access).toHaveBeenCalledOnce()
  expect(admin).not.toHaveBeenCalled()
 })
 it.each(mutating)('%s is untouched in production and on other branches',async(_name,call)=>{
  for(const env of [{...isolated,VERCEL_ENV:'production',WEBSITE_BUILDER_ACCEPTANCE_MODE:undefined},{...isolated,VERCEL_GIT_COMMIT_REF:'main',H1_SPEND_GATE:undefined}]){
   setEnv(env);access.mockReset()
   access.mockResolvedValue({ok:false,response:new Response('Unauthorized',{status:401})})
   expect((await call()).status).toBe(401)
   expect(access).toHaveBeenCalledOnce()
  }
 })
 it('read-only cinematic binding GET is not guarded',async()=>{
  setEnv({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:ACCEPTANCE_BRANCH})
  access.mockResolvedValue({ok:false,response:new Response('Unauthorized',{status:401})})
  expect((await cinematicGet()).status).toBe(401)
  expect(access).toHaveBeenCalledOnce()
 })
 it('chat tools also refuse writes against production without touching the database',async()=>{
  setEnv({...isolated,NEXT_PUBLIC_SUPABASE_URL:`https://${PRODUCTION_SUPABASE_REF}.supabase.co`})
  const principal={} as any, db={} as any
  for(const name of ['start_website_build','submit_website_build_feedback','draft_website_build_plan']){
   expect(await handleWebsiteBuildTool(name,{},principal,null,db)).toMatchObject({code:'ACCEPTANCE_TARGET_NOT_ISOLATED'})
  }
  expect(await handleWebsiteBuildTool('control_website_build',{action:'resume'},principal,null,db)).toMatchObject({code:'ACCEPTANCE_TARGET_NOT_ISOLATED'})
  expect(await handleWebsitePlanningTool('draft_website_build_plan',{},principal,null,db)).toMatchObject({code:'ACCEPTANCE_TARGET_NOT_ISOLATED'})
  expect(access).not.toHaveBeenCalled()
  expect(admin).not.toHaveBeenCalled()
 })
 it('emergency stop stays reachable through normal authentication',async()=>{
  setEnv({...isolated,NEXT_PUBLIC_SUPABASE_URL:`https://${PRODUCTION_SUPABASE_REF}.supabase.co`})
  access.mockResolvedValue({ok:false,response:new Response('Unauthorized',{status:401})})
  expect((await studioApi('stop',post('/api/website-build/studio/costs'))).status).toBe(401)
  expect(access).toHaveBeenCalledOnce()
 })
})
