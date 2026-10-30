
import {it,expect,vi,beforeEach,afterEach} from 'vitest'
const state=vi.hoisted(()=>({calls:[] as any[]}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('./worker',()=>({runScheduleTick:async(_db:unknown,input:any)=>{state.calls.push(input);return {mode:input.dryRun?'dry_run':'execute',jobId:null,result:'no_jobs'}}}))
import {socialScheduleTickApi} from './api'
beforeEach(()=>{state.calls=[];vi.stubEnv('CRON_SECRET','fixture-cron');vi.stubEnv('SOCIAL_SCHEDULE_DISPATCH_ENABLED','true');vi.stubEnv('SOCIAL_SCHEDULE_PROJECT_IDS','10000000-0000-4000-8000-000000000001')})
afterEach(()=>vi.unstubAllEnvs())
const req=(token?:string,query='',method='GET')=>new Request('http://localhost/api/social-schedule-tick'+query,{method,headers:token?{authorization:'Bearer '+token}:{}})
it('requires the existing cron bearer and never executes invalid requests',async()=>{
 for(const token of [undefined,'invalid'])expect((await socialScheduleTickApi(req(token))).status).toBe(401)
 expect((await socialScheduleTickApi(req('fixture-cron','','POST'))).status).toBe(405)
 expect((await socialScheduleTickApi(req('fixture-cron','?projectId=override'))).status).toBe(400)
 expect(state.calls).toHaveLength(0)
})
it('disabled mode makes no claim and an authenticated dry run stays read only',async()=>{
 vi.stubEnv('SOCIAL_SCHEDULE_DISPATCH_ENABLED','false')
 const disabled=await socialScheduleTickApi(req('fixture-cron'));expect(await disabled.json()).toMatchObject({result:'disabled'});expect(state.calls).toHaveLength(0)
 vi.stubEnv('SOCIAL_SCHEDULE_DISPATCH_ENABLED','true')
 const dry=await socialScheduleTickApi(req('fixture-cron','?dryRun=1'));expect(await dry.json()).toMatchObject({mode:'dry_run'});expect(state.calls[0].dryRun).toBe(true)
})
