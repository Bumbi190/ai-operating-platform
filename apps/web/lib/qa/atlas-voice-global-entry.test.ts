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
function Consumer(){state.value=useAtlas();return null}
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();state.controller=new AtlasConversationController();vi.stubGlobal('React',React);vi.stubGlobal('requestAnimationFrame',vi.fn());vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.stubGlobal('window',{SpeechRecognition:state.recognition})})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
function mount(props:Record<string,unknown>){renderToStaticMarkup(React.createElement(AtlasRuntimeProvider,{...props,children:React.createElement(Consumer)} as any))}
it('routes global activation to the approved voice page before any legacy microphone starts',()=>{
 mount({voiceConversationEnabled:true});state.value.activate()
 expect(state.push).toHaveBeenCalledWith('/atlas/rost');expect(state.recognition).not.toHaveBeenCalled()
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
it('passes the server release gate and collaborator restriction into the persistent provider',()=>{
 const layout=readFileSync(resolve('app/(platform)/layout.tsx'),'utf8')
 expect(layout).toContain("from '@/lib/atlas/voice-pilot/deployment'")
 expect(layout).toMatch(/voiceConversationEnabled=\{!isCollaborator && atlasVoiceConversationEnabled\(\)\}/)
 expect(layout).toMatch(/voiceReadOnly=\{Boolean\(isCollaborator\)\}/)
})
