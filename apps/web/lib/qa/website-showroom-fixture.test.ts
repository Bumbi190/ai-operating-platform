import {describe,it,expect,vi} from 'vitest'
vi.mock('../website-build/test-db',()=>({TEST_PROJECT:'10000000-0000-4000-8000-000000000001'}))
import FixtureProvider from '../../e2e/atlas-build-chat-provider'
describe('explicit authored showroom planning fixture (not model reasoning)',()=>{
 it('uses the requested one-page starter through the normal plan tool',async()=>{
  const output=await new FixtureProvider().messages.stream({system:'',messages:[{role:'user',content:'Planera fiktiv bilfirma med premium-dealer-demo-v1'}]}).finalMessage()
  const call:any=output.content[0]
  expect(call.name).toBe('draft_website_build_plan')
  expect(call.input.content.design.starter).toBe('premium-dealer-demo-v1')
  expect(call.input.content.pages).toHaveLength(1)
  expect(call.input.content.domain.requestedName).toBeNull()
  expect(call.input).not.toHaveProperty('approved')
 })
 it('keeps the original café fixture for unrelated requests',async()=>{
  const output=await new FixtureProvider().messages.stream({system:'',messages:[{role:'user',content:'Bygg en sida för ett café'}]}).finalMessage()
  const call:any=output.content[0]
  expect(call.input.content.pages).toHaveLength(2)
  expect(call.input.content.design).not.toHaveProperty('starter')
 })
})
