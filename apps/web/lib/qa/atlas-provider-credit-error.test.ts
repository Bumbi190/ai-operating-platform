import { describe, expect, it } from 'vitest'
import { classifyAnthropicError, getAtlasServiceErrorMessage, isAtlasServiceErrorCode } from '../atlas/provider-errors'
import { AtlasConversationController } from '../atlas/conversation/controller'
import { ATLAS_FAILED_NOTICE } from '../os/chat-shared'

const code = 'ATLAS_PROVIDER_INSUFFICIENT_CREDITS'
const expected = 'Anthropics API-krediter räcker inte för att generera ett svar. Fyll på saldot i Claude Console och försök igen.'
const conversationId = '50000000-0000-4000-8000-000000000001'

describe('Atlas provider credit failures', () => {
 it('classifies the observed HTTP 400 credit refusal', () => {
  const error = Object.assign(new Error('400 ' + JSON.stringify({ type:'error', error:{ type:'invalid_request_error',
   message:'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } })), {status:400})
  expect(classifyAnthropicError(error)).toBe(code)
 })
 it('exposes a stable actionable message rather than raw provider details', () => {
  expect(isAtlasServiceErrorCode(code)).toBe(true)
  expect(getAtlasServiceErrorMessage(code as Parameters<typeof getAtlasServiceErrorMessage>[0])).toBe(expected)
 })
 it.each([
  [{status:400,message:'messages: invalid content'}, 'ATLAS_PROVIDER_REQUEST_FAILED'],
  [{status:429,message:'Rate limit exceeded'}, 'ATLAS_PROVIDER_REQUEST_FAILED'],
  [{status:401,message:'Invalid API key'}, 'ATLAS_PROVIDER_AUTHENTICATION_FAILED'],
 ])('preserves the classification of other failures', (error, wanted) => {
  expect(classifyAnthropicError(error)).toBe(wanted)
 })
 it.each(['text','voice'] as const)('preserves the credit warning in the %s turn result used by the Atlas banner', async inputSource => {
  const controller = new AtlasConversationController(async () => new Response(
   'data: ' + JSON.stringify({event:'error',code,message:expected}) + '\n\n', {status:200}))
  controller.activateConversation({id:conversationId,saved:[],state:'ok'})
  const outcome = await controller.sendTurn({conversationId,text:'Vad skiljer M4 från Obsidian?',inputSource})
  expect(outcome).toEqual({ok:false,notice:expected})
  expect(controller.snapshot().pending).toBe(false)
  expect(controller.snapshot().history).toEqual([{role:'user',content:'Vad skiljer M4 från Obsidian?'}])
 })
 it('does not promote unknown server text into the returned warning', async () => {
  const controller = new AtlasConversationController(async () => new Response(
   'data: ' + JSON.stringify({event:'error',code:'UNKNOWN',message:'untrusted provider detail'}) + '\n\n', {status:200}))
  controller.activateConversation({id:conversationId,saved:[],state:'ok'})
  const outcome = await controller.sendTurn({conversationId,text:'Fråga',inputSource:'text'})
  expect(outcome).toEqual({ok:false,notice:ATLAS_FAILED_NOTICE})
 })
})
