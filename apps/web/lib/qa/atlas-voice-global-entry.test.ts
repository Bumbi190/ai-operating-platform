import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({push:vi.fn(),recognition:vi.fn(),value:null as any,controller:null as any}))
vi.mock('next/navigation',()=>({useRouter:()=>({push:state.push}),usePathname:()=>'/dashboard'}))
vi.mock('@/lib/supabase/client',()=>({createClient:vi.fn()}))
vi.mock('@/lib/atlas/conversation/provider',()=>({useAtlasConversation:()=>({controller:state.controller,snapshot:state.controller.snapshot()})}))
import { AtlasConversationController } from '@/lib/atlas/conversation/controller'
import { AtlasRuntimeProvider, useAtlas } from '@/lib/atlas/runtime'
import { atlasVoiceLiveEnabled, atlasVoiceConversationEnabled } from '@/lib/atlas/voice-pilot/deployment'
function Consumer(){state.value=useAtlas();return null}
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();state.controller=new AtlasConversationController();vi.stubGlobal('React',React);vi.stubGlobal('requestAnimationFrame',vi.fn());vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.stubGlobal('window',{SpeechRecognition:state.recognition})})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs()})
function mount(props:Record<string,unknown>){renderToStaticMarkup(React.createElement(AtlasRuntimeProvider,{...props,children:React.createElement(Consumer)} as any))}
it('does not navigate or start legacy recognition when voice is requested before hydration',()=>{
 mount({voiceConversationEnabled:true});state.value.activate()
 expect(state.push).not.toHaveBeenCalled();expect(state.recognition).not.toHaveBeenCalled()
})
it('blocks read-only global activation even when the conversation gate is enabled',()=>{
 mount({voiceConversationEnabled:true,voiceReadOnly:true});state.value.activate()
 expect(state.push).not.toHaveBeenCalled();expect(state.recognition).not.toHaveBeenCalled()
})
it('blocks read-only activation with the live gate disabled too',()=>{
 mount({voiceReadOnly:true});state.value.activate()
 expect(state.push).not.toHaveBeenCalled();expect(state.recognition).not.toHaveBeenCalled()
})
it('retains explicit legacy fallback without live conversation availability',()=>{
 mount({});state.value.activate();expect(state.recognition).toHaveBeenCalledTimes(1);expect(state.push).not.toHaveBeenCalled()
})
it('allows managed Nova in preview while selecting only stable batch transcription',()=>{
 vi.stubEnv('NODE_ENV','production');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('ATLAS_VOICE_STREAM_MODE','pilot')
 expect(atlasVoiceConversationEnabled()).toBe(true)
 expect(atlasVoiceLiveEnabled()).toBe(false)
 vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('ATLAS_VOICE_STREAM_MODE','live')
 expect(atlasVoiceConversationEnabled()).toBe(true)
 expect(atlasVoiceLiveEnabled()).toBe(true)
})
it('passes the server release gate and collaborator restriction into the persistent provider',()=>{
 const layout=readFileSync(resolve('app/(platform)/layout.tsx'),'utf8')
 expect(layout).toContain("from '@/lib/atlas/voice-pilot/entry'")
 expect(layout).toMatch(/voiceConversationEnabled=\{atlasVoiceConversationEntryEnabled\(user\.email, Boolean\(isCollaborator\)\)\}/)
 expect(layout).toMatch(/voiceReadOnly=\{Boolean\(isCollaborator\)\}/)
 expect(layout).toContain('voiceRealtimePreferred={atlasVoiceLiveEnabled()}')
 expect(layout).toContain("from '@/lib/atlas/voice-pilot/deployment'")
 const runtime=readFileSync(resolve('lib/atlas/runtime.tsx'),'utf8')
 expect(runtime).toContain('streamingAvailable: voiceRealtimePreferred, live: true')
})

it.each([
 ['operator', 'operator@example.test', false, 'live', true],
 ['ordinary owner', 'owner@example.test', false, 'live', false],
 ['collaborator', 'operator@example.test', true, 'live', false],
 ['unknown identity', undefined, false, 'live', false],
 ['disabled release', 'operator@example.test', false, '', false],
] as const)('only offers the authorized conversation entry for %s',async(_name,email,readOnly,mode,expected)=>{
 vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('ATLAS_VOICE_STREAM_MODE',mode);vi.stubEnv('PLATFORM_OPERATOR_EMAILS','operator@example.test')
 const module=await import('@/lib/atlas/voice-pilot/entry').catch(()=>null)
 expect(module?.atlasVoiceConversationEntryEnabled).toBeTypeOf('function')
 expect(module!.atlasVoiceConversationEntryEnabled(email,readOnly)).toBe(expected)
})
