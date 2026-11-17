import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const mock = vi.hoisted(()=>({plan:vi.fn()}))
vi.mock('@/lib/article/daily/inventory',()=>({planTodaysPromptArticles: mock.plan}))

const secret='test-cron-secret'
const URL='https://preview.example.test/api/article/cron/daily'
function get(key?: string): Request {
  return new Request(URL,{method:'GET',
    headers:key?{Authorization:'Bearer '+key}:{}})
}
async function invoke(request:Request){
  const { GET }=await import('@/app/api/article/cron/daily/route')
  const res=await GET(request)
  return {code:res.status,body:await res.json(),headers:res.headers}
}
const prev={secret:process.env.CRON_SECRET,flag:process.env.DAILY_ARTICLE_PLANNER_ENABLED}
beforeEach(()=>{
  vi.clearAllMocks()
  process.env.CRON_SECRET=secret
  delete process.env.DAILY_ARTICLE_PLANNER_ENABLED
  mock.plan.mockResolvedValue({ok:true,plan:{
    projectId:'aaaaaaaa-bbbb-4ccc-8ddd-000000000001',
    generatedAt:'2026-11-17T08:00:00Z',
    counts:{usableNews:2,socialWithReceipt:1,candidatesChosen:2},
    candidates:[{newsItemId:'news-1',slot:'social_expansion',canWrite:false,canPublish:false}],
    canDispatch:false,canPublish:false,mode:'prepare_only'}})
})
afterAll(()=>{
  prev.secret===undefined?delete process.env.CRON_SECRET:process.env.CRON_SECRET=prev.secret
  prev.flag===undefined?delete process.env.DAILY_ARTICLE_PLANNER_ENABLED:process.env.DAILY_ARTICLE_PLANNER_ENABLED=prev.flag
})
describe('Daily website editorial cron is safe by default',()=>{
  it('rejects anonymous callers, even when disabled',async()=>{
    expect((await invoke(get())).code).toBe(401)
    expect((await invoke(get('wrong'))).code).toBe(401)
    expect(mock.plan).not.toHaveBeenCalled()
  })
  it('no secret configured is fail-closed',async()=>{
    delete process.env.CRON_SECRET
    expect((await invoke(get(secret))).code).toBe(401)
    expect(mock.plan).not.toHaveBeenCalled()
  })
  it('default is disabled without even reading article inventory',async()=>{
    const res=await invoke(get(secret))
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({
      status:'disabled',mode:'prepare_only',published:false,spent:false,modelInvoked:false,
    })
    expect(mock.plan).not.toHaveBeenCalled()
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
  it('read-only daily inventory works with explicit planner opt-in; no publication',async()=>{
    process.env.DAILY_ARTICLE_PLANNER_ENABLED='true'
    const res=await invoke(get(secret))
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({status:'planned',mode:'prepare_only',published:false,spent:false,modelInvoked:false})
    expect(mock.plan).toHaveBeenCalledTimes(1)
    expect(res.body.candidates[0].canPublish).toBe(false)
    expect(res.body.publicationDecision).toBe('NO_GO')
    expect(res.body.agentRoles).toHaveLength(5)
    expect(res.body.agentRoles.every((r: {canInvokeModel:boolean;canPublish:boolean}) => !r.canInvokeModel && !r.canPublish)).toBe(true)
  })
  it('database or project failure returns 503 and never partial candidate publication',async()=>{
    process.env.DAILY_ARTICLE_PLANNER_ENABLED='true'
    mock.plan.mockResolvedValueOnce({ok:false,reason:'inventory_unavailable'})
    const res=await invoke(get(secret))
    expect(res.code).toBe(503)
    expect(res.body).toMatchObject({published:false,modelInvoked:false})
    expect(res.body.candidates).toBe(undefined)
  })
  it('even a fake autopublish environment flag does not invoke models',async()=>{
    process.env.DAILY_ARTICLE_PLANNER_ENABLED='true'
    process.env.ARTICLE_AUTOPUBLISH='high'
    try {
      const res=await invoke(get(secret))
      expect(res.body.published).toBe(false)
      expect(res.body.spent).toBe(false)
    } finally {delete process.env.ARTICLE_AUTOPUBLISH}
  })
  it('Vercel cron schedule is one daily slot, preserves existing jobs',()=>{
    const conf=JSON.parse(readFileSync(join(process.cwd(),'vercel.json'),'utf8'))
    expect(conf.crons).toContainEqual({path:'/api/article/cron/daily',schedule:'55 7 * * *'})
    expect(conf.crons).toContainEqual({path:'/api/media/cron/heartbeat',schedule:'0 7 * * *'})
    expect(conf.crons).toContainEqual({path:'/api/social-schedule-tick',schedule:'* * * * *'})
    expect(conf.crons).toHaveLength(4)
  })
  it('route never imports providers, publishing or mutates database',()=>{
    const src=readFileSync(join(process.cwd(),'app/api/article/cron/daily/route.ts'),'utf8')
    expect(src).not.toMatch(/@aws-sdk|new Bedrock|client\.send|runPublishPipeline|publishArticle\(|generateArticle\(/)
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/)
    expect(src).toContain('DAILY_ARTICLE_PLANNER_ENABLED')
  })
})
