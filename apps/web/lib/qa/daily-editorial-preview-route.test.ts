import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const mock=vi.hoisted(()=>({auth:vi.fn(),plan:vi.fn()}))
vi.mock('@/lib/ai/bedrock-pilot/saved-review-data',()=>({ownedPromptProject:mock.auth}))
vi.mock('@/lib/article/daily/inventory',()=>({planTodaysPromptArticles:mock.plan}))

const PID='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const ORIGIN='https://preview.example.test'
const prev={env:process.env.VERCEL_ENV,ref:process.env.VERCEL_GIT_COMMIT_REF}
function request(body='{}',headers:Record<string,string>={}){
  return new Request(ORIGIN+'/api/article/daily/preview',{
    method:'POST',body,
    headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json',...headers},
  })
}
async function invoke(r:Request){
  const {POST}=await import('@/app/api/article/daily/preview/route')
  const result=await POST(r)
  return {status:result.status,body:await result.json(),headers:result.headers}
}
beforeEach(()=>{
  vi.clearAllMocks()
  process.env.VERCEL_ENV='preview'
  process.env.VERCEL_GIT_COMMIT_REF='feat/omnira-bedrock-pilot-20261116'
  mock.auth.mockResolvedValue({ok:true,projectId:PID,projectName:'The Prompt'})
  mock.plan.mockResolvedValue({ok:true,plan:{
    projectId:PID,generatedAt:'2026-11-17T08:00:00Z',
    mode:'prepare_only',canPublish:false,canDispatch:false,
    counts:{usableNews:2,socialWithReceipt:1,candidatesChosen:0},
    candidates:[],
  }})
})
afterAll(()=>{
  prev.env===undefined?delete process.env.VERCEL_ENV:process.env.VERCEL_ENV=prev.env
  prev.ref===undefined?delete process.env.VERCEL_GIT_COMMIT_REF:process.env.VERCEL_GIT_COMMIT_REF=prev.ref
})
describe('Owner-only daily editorial preview',()=>{
  it('shows a read-only daily plan and five dormant agent roles',async()=>{
    const r=await invoke(request())
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ok:true,projectName:'The Prompt',
      publicationDecision:'NO_GO',published:false,spent:false,modelInvoked:false})
    expect(r.body.roles).toHaveLength(5)
    expect(r.body.roles.every((role:{canInvokeModel:boolean,canPublish:boolean})=>
      !role.canInvokeModel&&!role.canPublish)).toBe(true)
    expect(r.headers.get('cache-control')).toContain('no-store')
  })
  it('production is refused before any private DB read',async()=>{
    process.env.VERCEL_ENV='production'
    expect((await invoke(request())).status).toBe(404)
    expect(mock.auth).not.toHaveBeenCalled()
  })
  it('wrong Preview branch is refused before any private DB read',async()=>{
    process.env.VERCEL_GIT_COMMIT_REF='main'
    expect((await invoke(request())).status).toBe(404)
    expect(mock.auth).not.toHaveBeenCalled()
  })
  it('cross-origin request is blocked prior to operator authentication',async()=>{
    expect((await invoke(request('{}',{Origin:'https://evil.example'}))).status).toBe(403)
    expect((await invoke(request('{}',{'Sec-Fetch-Site':'cross-site'}))).status).toBe(403)
    expect(mock.auth).not.toHaveBeenCalled()
  })
  it('payload cannot substitute a chosen project or altered settings',async()=>{
    expect((await invoke(request('{"projectId":"foreign"}'))).status).toBe(400)
    expect((await invoke(request('x'.repeat(200)))).status).toBe(413)
    expect(mock.auth).not.toHaveBeenCalled()
  })
  it('operator or project denial is 403, no inventory read',async()=>{
    mock.auth.mockResolvedValueOnce({ok:false,reason:'prompt_not_owned'})
    const r=await invoke(request())
    expect(r.status).toBe(403)
    expect(r.body).toMatchObject({reason:'operator_or_project_denied'})
    expect(mock.plan).not.toHaveBeenCalled()
  })
  it('project scope mismatch refuses, no candidate data leaks',async()=>{
    mock.plan.mockResolvedValueOnce({ok:true,plan:{
      projectId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      generatedAt:'2026-11-17T08:00:00Z',canPublish:false,canDispatch:false,
      mode:'prepare_only',counts:{usableNews:0,socialWithReceipt:0,candidatesChosen:0},candidates:[]}})
    const r=await invoke(request())
    expect(r.status).toBe(409)
    expect(r.body.candidates).toBe(undefined)
  })
  it('no publicly callable provider, authoring or publishing from dashboard route',()=>{
    const src=readFileSync(join(process.cwd(),'app/api/article/daily/preview/route.ts'),'utf8')
    expect(src).not.toMatch(/client\.send|@aws-sdk|publishArticle|generateArticle|withGovernedSpend/)
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/)
  })
})
