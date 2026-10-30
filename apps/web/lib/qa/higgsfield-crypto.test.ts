import { beforeEach, describe,it,expect,vi } from 'vitest'
import { sealProviderPayload,openProviderPayload } from '../media/higgsfield/crypto'
const context={projectId:'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',recordKind:'connection' as const,recordId:'1'}
beforeEach(()=>vi.stubEnv('MEDIA_PROVIDER_OAUTH_ENCRYPTION_KEY',Buffer.alloc(32,7).toString('base64')))
describe('provider encrypted credentials',()=>{
 it('roundtrips and uses fresh nonces',()=>{
  const a=sealProviderPayload(context,{access_token:'secret'}),b=sealProviderPayload(context,{access_token:'secret'})
  expect(openProviderPayload(context,a)).toEqual({access_token:'secret'})
  expect(a.iv).not.toBe(b.iv);expect(JSON.stringify(a)).not.toContain('secret')
 })
 it.each(['projectId','recordKind','recordId'])('binds %s as authenticated context',key=>{
  const a=sealProviderPayload(context,{access_token:'secret'})
  expect(()=>openProviderPayload({...context,[key]:'other'} as typeof context,a)).toThrow('invalid_response')
 })
 it('refuses tampering, truncated payloads and unknown versions',()=>{
  const a=sealProviderPayload(context,{refresh_token:'secret'})
  for(const changed of [{...a,ciphertext:'AAAA'},{...a,tag:'AAAA'},{...a,v:2},{...a,iv:'AAAA'}])
   expect(()=>openProviderPayload(context,changed)).toThrow('invalid_response')
 })
 it.each(['','bad',Buffer.alloc(31).toString('base64')])('requires valid configured key',key=>{
  vi.stubEnv('MEDIA_PROVIDER_OAUTH_ENCRYPTION_KEY',key)
  expect(()=>sealProviderPayload(context,{})).toThrow('not_configured')
 })
})
