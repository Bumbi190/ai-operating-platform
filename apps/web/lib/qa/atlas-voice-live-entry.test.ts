import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const s=vi.hoisted(()=>({click:undefined as undefined|(()=>void),activate:vi.fn(),deactivate:vi.fn(),openWorkspace:vi.fn(),stopAudio:vi.fn()}))
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams()}))
vi.mock('@/lib/atlas/runtime',()=>({useAtlas:()=>({voicePhase:'idle',isSessionActive:false,activate:s.activate,deactivate:s.deactivate,openWorkspace:s.openWorkspace,stopAudio:s.stopAudio}),useAtlasAudioLevel:()=>0}))
vi.mock('@/components/platform/os/AtlasOrb',()=>({AtlasOrb:(props:any)=>{s.click=props.onClick;return null}}))
vi.mock('@/components/platform/vnext/AtlasFace',()=>({AtlasFace:()=>null}))
import { AtlasVoiceHome } from '@/app/(platform)/atlas/AtlasVoiceHome'
import { AtlasCommandCore } from '@/components/platform/vnext/AtlasCommandCore'
beforeEach(()=>{vi.stubGlobal('React',{...React,createElement:(type:any,props:any,...children:any[])=>{if(type==='button'&&props?.['aria-label']==='Aktivera Atlas röst')s.click=props.onClick;return React.createElement(type,props,...children)}});vi.clearAllMocks();s.click=undefined})
afterEach(()=>vi.unstubAllGlobals())
it.each(['legacy','vnext'])('starts shared runtime voice from the %s home voice control',kind=>{
 renderToStaticMarkup(kind==='legacy'?React.createElement(AtlasVoiceHome,{operatorName:'Test',voiceHref:'/atlas/rost'} as any):React.createElement(AtlasCommandCore,{voiceHref:'/atlas/rost'} as any))
 s.click!()
 expect(s.activate).toHaveBeenCalledTimes(1);expect(s.openWorkspace).not.toHaveBeenCalled();expect(s.deactivate).not.toHaveBeenCalled()
})
it('keeps collaborator voice controls inert',()=>{
 renderToStaticMarkup(React.createElement(AtlasCommandCore,{readOnly:true,voiceHref:'/atlas/rost'} as any));s.click!()
 expect(s.openWorkspace).not.toHaveBeenCalled();expect(s.activate).not.toHaveBeenCalled()
})
