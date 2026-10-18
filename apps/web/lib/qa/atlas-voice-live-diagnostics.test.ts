import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const createClient = vi.hoisted(() => vi.fn(() => ({auth:{getUser:async()=>({data:{user:null}})}})))
vi.mock('@supabase/ssr',()=>({createServerClient:createClient}))
import { middleware } from '@/middleware'
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks()})
it.each(['/atlas-voice-provider-probe.html','/atlas-voice-connection-probe.html'])('blocks production diagnostic entry before auth: %s',async path=>{
 vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('ATLAS_VOICE_STREAM_MODE','live')
 const res=await middleware(new NextRequest('https://app.omniraos.se'+path+'?v=live'))
 expect(res.status).toBe(404);expect(createClient).not.toHaveBeenCalled()
})
it.each(['/atlas-voice-provider-probe.html','/atlas-voice-connection-probe.html'])('retains preview diagnostic auth: %s',async path=>{
 vi.stubEnv('VERCEL_ENV','preview')
 const res=await middleware(new NextRequest('https://preview.example'+path))
 expect(res.status).toBe(307);expect(createClient).toHaveBeenCalled()
})
