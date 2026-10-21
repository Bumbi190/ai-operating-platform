import {it,expect,vi} from 'vitest'
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>{throw Error('Unsupported provider must not read scripts')}})}))
vi.mock('@/lib/media/social-bindings',()=>({listActiveBindings:async()=>({ok:true,bindings:['linkedin','pinterest','x'].map(platform=>({projectId:'project',platform}))})}))
vi.mock('@/lib/media/social-credentials',()=>({createCredentialResolver:()=>({})}))
import {GET} from '@/app/api/media/cron/account-snapshot/route'
it('does not route new provider snapshots through YouTube',async()=>{
 vi.stubEnv('CRON_SECRET','fixture');vi.stubEnv('YOUTUBE_API_KEY','fixture')
 const result=await GET(new Request('https://app.omniraos.se/api/media/cron/account-snapshot',{headers:{authorization:'Bearer fixture'}}))
 expect(result.status).toBe(200);expect((await result.json()).results).toEqual([])
 vi.unstubAllEnvs()
})
