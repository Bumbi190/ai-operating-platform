import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
// Mock-only drain entry: the database double records RPCs and claims nothing.
vi.mock('server-only',()=>({}))
const rpc=vi.hoisted(()=>vi.fn(async()=>({data:[],error:null})))
const admin=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:admin}))
vi.mock('@/lib/email/brevo',()=>({sendAdminNotification:()=>Promise.resolve()}))
vi.mock('@/lib/atlas/memory/record-event',()=>({recordMemoryEvent:()=>Promise.resolve()}))
import {ACCEPTANCE_BRANCH,PRODUCTION_SUPABASE_REF} from './acceptance-target'

const ISOLATED='abcdefghijklmnopqrst'
const isolated={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:ACCEPTANCE_BRANCH,WEBSITE_BUILDER_ACCEPTANCE_MODE:'1',WEBSITE_BUILDER_ACCEPTANCE_SUPABASE_REF:ISOLATED,NEXT_PUBLIC_SUPABASE_URL:`https://${ISOLATED}.supabase.co`,H1_SPEND_GATE:'1'}
function setEnv(env:Record<string,string|undefined>){for(const k of Object.keys(isolated))vi.stubEnv(k,env[k] as string);vi.stubEnv('CRON_SECRET','test-secret')}
const drain=()=>new Request('http://t/api/runs/drain',{headers:{authorization:'Bearer test-secret'}})
const db=()=>{const chain:Record<string,unknown>={};for(const m of ['select','eq','is','in','lt','lte','gte','not','order','limit','update','insert','upsert','delete'])chain[m]=()=>chain;chain.maybeSingle=async()=>({data:null,error:null});chain.single=async()=>({data:null,error:null});chain.then=(ok:(v:unknown)=>unknown)=>Promise.resolve({data:[],error:null}).then(ok);return {from:()=>chain,rpc}}

beforeEach(()=>{rpc.mockClear();admin.mockReset();admin.mockImplementation(db);vi.spyOn(console,'warn').mockImplementation(()=>{});vi.resetModules()})
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks()})

describe('runs drain on the Studio acceptance preview',()=>{
 it('refuses before any database client or claim_runs while still on production',async()=>{
  setEnv({...isolated,NEXT_PUBLIC_SUPABASE_URL:`https://${PRODUCTION_SUPABASE_REF}.supabase.co`,H1_SPEND_GATE:undefined})
  const {GET}=await import('@/app/api/runs/drain/route')
  const res=await GET(drain())
  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({error:'ACCEPTANCE_TARGET_NOT_ISOLATED'})
  expect(admin).not.toHaveBeenCalled()
  expect(rpc).not.toHaveBeenCalled()
 })
 it('keeps CRON_SECRET auth first: unauthenticated callers still get 401',async()=>{
  setEnv({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:ACCEPTANCE_BRANCH})
  const {GET}=await import('@/app/api/runs/drain/route')
  expect((await GET(new Request('http://t/api/runs/drain'))).status).toBe(401)
  expect(admin).not.toHaveBeenCalled()
 })
 it.each([
  ['the provisioned isolated target',isolated],
  ['production (out of scope)',{VERCEL_ENV:'production'}],
  ['another branch preview (out of scope)',{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'main'}],
 ])('reaches the normal claim path for %s',async(_name,env)=>{
  setEnv(env)
  const {GET}=await import('@/app/api/runs/drain/route')
  const res=await GET(drain())
  expect(res.status).not.toBe(503)
  expect(admin).toHaveBeenCalled()
  expect(rpc).toHaveBeenCalledWith('claim_runs',expect.anything())
 })
})
