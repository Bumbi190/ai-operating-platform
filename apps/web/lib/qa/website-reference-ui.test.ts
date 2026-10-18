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
      projectId:randomUUID(),conversationId:randomUUID(),readOnly:false,
    }))
    expect(html).toContain('Kontrollerar bildfunktionen')
    expect(html).toContain('disabled')
    expect(html).toContain('Bildreferenser')
    expect(html).not.toContain('Sparad privat')
  })
  it('never enables upload in a paused or read-only workspace',()=>{
    const html=renderToStaticMarkup(createElement(StudioReferenceUploads,{
      projectId:randomUUID(),conversationId:randomUUID(),readOnly:true,
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
