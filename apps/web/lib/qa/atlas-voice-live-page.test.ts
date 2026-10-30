import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/atlas/runtime',()=>({useOptionalAtlas:()=>null}))
vi.mock('@/lib/supabase/client',()=>({createClient:vi.fn()}))
vi.mock('next/link',()=>({default:({children}:any)=>children}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:async()=>({ok:true,userId:'operator'})}))
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('not_found')},redirect:()=>{throw Error('login')}}))
import { AtlasVoiceTrial } from '@/app/(platform)/atlas/rosttest/voice-trial'
const page = () => import('@/app/(platform)/atlas/rost/page').catch(()=>null)
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubEnv('NODE_ENV','production');vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('ATLAS_VOICE_STREAM_MODE','live')})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
it('provides the live operator voice page with streaming default',async()=>{
 const module=await page();expect(module?.default).toBeTypeOf('function')
 const view=await module!.default()
 expect(view.props).toMatchObject({streamingAvailable:true,live:true})
 const html=renderToStaticMarkup(view)
 expect(html).toMatch(/value="streaming" selected=""/)
 expect(html).toContain('Prata med Atlas')
 expect(html).not.toContain('separat rösttest')
 expect(html).not.toContain('Strömmande tal · test')
})
it.each(['','pilot','verify','probe'])('does not publish live page without production live flag (%s)',async mode=>{
 vi.stubEnv('ATLAS_VOICE_STREAM_MODE',mode)
 const module=await page();expect(module?.default).toBeTypeOf('function')
 await expect(module!.default()).rejects.toThrow('not_found')
})
it('keeps the existing preview component default in batch',()=>{
 const html=renderToStaticMarkup(React.createElement<{streamingAvailable?:boolean}>(AtlasVoiceTrial,{streamingAvailable:true}))
 expect(html).toMatch(/value="batch" selected=""/)
})
it('offers a batch-only live rollback when passed no streaming availability',()=>{
 const html=renderToStaticMarkup(React.createElement(AtlasVoiceTrial,{live:true,streamingAvailable:false} as any))
 expect(html).not.toMatch(/value="streaming" selected=""/)
})
