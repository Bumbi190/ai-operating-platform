import {describe,expect,it,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {randomUUID} from 'node:crypto'

vi.mock('@/lib/supabase/client',()=>({createClient:()=>{throw Error('Not allowed on initial render')}}))
import {StudioReferenceUploads} from '@/components/website-build/StudioReferenceUploads'
import {StudioLayout} from '@/components/website-build/StudioLayout'

describe('Atlas Builder reference-image UI',()=>{
  it('does not grant upload authority while availability has not been verified',()=>{
    const html=renderToStaticMarkup(createElement(StudioReferenceUploads,{
      projectId:'10000000-0000-4000-8000-000000000001',conversationId:'50000000-0000-4000-8000-000000000001',readOnly:false,
      activeConversation:{id:'50000000-0000-4000-8000-000000000001',projectId:'10000000-0000-4000-8000-000000000001',studio:true,state:'ok'},
    }))
    expect(html).toContain('Kontrollerar bildfunktionen')
    expect(html).toContain('disabled')
    expect(html).toContain('Bildreferenser')
    expect(html).not.toContain('Sparad privat')
  })
  it('never enables upload in a paused or read-only workspace',()=>{
    const html=renderToStaticMarkup(createElement(StudioReferenceUploads,{
      projectId:'10000000-0000-4000-8000-000000000001',conversationId:'50000000-0000-4000-8000-000000000001',readOnly:true,
      activeConversation:{id:'50000000-0000-4000-8000-000000000001',projectId:'10000000-0000-4000-8000-000000000001',studio:true,state:'ok'},
    }))
    expect(html).toContain('skrivskyddat')
    expect(html).toContain('disabled')
  })
  it('keeps the file subtree mounted when its tab is hidden on desktop and mobile',()=>{
    const html=renderToStaticMarkup(createElement(StudioLayout,{
      chat:createElement('span',null,'CHAT'),
      website:createElement('span',null,'WEBSITE'),
      desktop:createElement('span',null,'DESKTOP'),
      files:createElement('span',null,'FILES_PERSIST'),
      tasks:createElement('span',null,'TASKS'),
    }))
    expect(html).toContain('FILES_PERSIST')
    expect(html).toMatch(/hidden[^>]*>\s*<span>FILES_PERSIST<\/span>/)
    expect(html).toContain('WEBSITE')
  })
})

it('hides private references unless the active Studio conversation exactly matches the panel scope',()=>{
 const projectId='10000000-0000-4000-8000-000000000001',conversationId='50000000-0000-4000-8000-000000000001'
 for(const activeConversation of [
  {id:null,projectId:null,studio:false,state:'ok' as const},
  {id:randomUUID(),projectId,studio:true,state:'ok' as const},
  {id:conversationId,projectId:randomUUID(),studio:true,state:'ok' as const},
  {id:conversationId,projectId,studio:false,state:'ok' as const},
  {id:conversationId,projectId,studio:true,state:'error' as const},
 ])expect(renderToStaticMarkup(createElement(StudioReferenceUploads,{projectId,conversationId,readOnly:false,activeConversation}))).toBe('')
})
