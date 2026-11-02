import {describe,expect,it} from 'vitest'
import {studioPageQuery} from './page-query'
import {studioSelection} from './api'

describe('Studio page URL: links with attribution remain safe and usable',()=>{
 it('opens the exact ChatGPT-attributed /build link with no Studio selector',()=>{
  const cleaned=studioPageQuery({utm_source:'chatgpt.com'})
  expect(cleaned.toString()).toBe('')
  expect(studioSelection(cleaned)).toEqual({selection:{},include:'active'})
 })
 it('ignores only supported UTM attribution while preserving a real project choice',()=>{
  const cleaned=studioPageQuery({
   utm_source:'chatgpt.com',utm_campaign:'studio-preview',utm_medium:'link',
   project:'demo-motors',include:'archived'
  })
  expect(studioSelection(cleaned)).toEqual({
   selection:{projectSlug:'demo-motors'},include:'archived'
  })
 })
 it('never silently skips unknown selectors or duplicated protected selectors',()=>{
  expect(()=>studioSelection(studioPageQuery({project:'demo',forbidden:'1'}))).toThrow('INVALID_STUDIO_INPUT')
  expect(()=>studioSelection(studioPageQuery({project:['demo','other']}))).toThrow('INVALID_STUDIO_INPUT')
  // UUID shape is validated by loadStudioView, after the selector is parsed.
  expect(studioSelection(studioPageQuery({session:'bad-uuid'})).selection.sessionId).toBe('bad-uuid')
 })
 it('does not change the strict API selector validation',()=>{
  expect(()=>studioSelection(new URLSearchParams('utm_source=chatgpt.com'))).toThrow('INVALID_STUDIO_INPUT')
 })
})
