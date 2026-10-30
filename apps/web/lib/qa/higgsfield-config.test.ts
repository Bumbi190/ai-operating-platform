import { describe, it, expect } from 'vitest'
import { assertHiggsfieldUrl, resolveHiggsfieldConfig, createHiggsfieldFetch } from '../media/higgsfield/config'

const enabled = { HIGGSFIELD_MCP_ENABLED: 'true', HIGGSFIELD_OAUTH_REDIRECT_URI: 'https://omnira.example/api/media/higgsfield/oauth/callback', MEDIA_PROVIDER_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') }
describe('Higgsfield protocol boundary', () => {
  it('requires an explicit enable and valid encryption configuration', () => {
    expect(resolveHiggsfieldConfig({}).ok).toBe(false)
    expect(resolveHiggsfieldConfig({...enabled,HIGGSFIELD_MCP_ENABLED:'yes'}).ok).toBe(false)
    expect(resolveHiggsfieldConfig({...enabled,MEDIA_PROVIDER_OAUTH_ENCRYPTION_KEY:''}).ok).toBe(false)
    expect(resolveHiggsfieldConfig(enabled).ok).toBe(true)
  })
  it.each(['https://evil.example/cb','http://omnira.example/api/media/higgsfield/oauth/callback','https://omnira.example/api/media/higgsfield/oauth/callback?next=evil','https://user:pw@omnira.example/api/media/higgsfield/oauth/callback'])('rejects unsafe callback %s', value => {
    expect(resolveHiggsfieldConfig({...enabled,HIGGSFIELD_OAUTH_REDIRECT_URI:value}).ok).toBe(false)
  })
  it('pins resource discovery and issuer independently', () => {
    expect(assertHiggsfieldUrl('https://mcp.higgsfield.ai/mcp','resource').hostname).toBe('mcp.higgsfield.ai')
    expect(assertHiggsfieldUrl('https://clerk.higgsfield.ai/oauth/token','issuer').hostname).toBe('clerk.higgsfield.ai')
    expect(() => assertHiggsfieldUrl('https://mcp.higgsfield.ai/oauth2/token','issuer')).toThrow()
  })
  it.each(['https://clerk.higgsfield.ai.evil.example/oauth/token','https://user:pw@clerk.higgsfield.ai/oauth/token','https://clerk.higgsfield.ai:444/oauth/token','http://clerk.higgsfield.ai/oauth/token','https://clerk.higgsfield.ai/oauth/token#secret'])('rejects untrusted endpoint %s', value => {
    expect(() => assertHiggsfieldUrl(value,'issuer')).toThrow()
  })
  it('does not send credentials to discovery even on trusted origin', async () => {
    const seen:Request[]=[]
    const f=createHiggsfieldFetch(async (r) => { seen.push(new Request(r));return new Response('{}',{headers:{'content-type':'application/json'}}) },1000)
    await expect(f('https://clerk.higgsfield.ai/.well-known/oauth-authorization-server',{headers:{Authorization:'Bearer secret'}})).rejects.toThrow()
    expect(seen).toHaveLength(0)
  })
  it('rejects an HTTP redirect rather than following it', async () => {
    const f=createHiggsfieldFetch(async () => new Response(null,{status:302,headers:{location:'https://evil.example'}}),1000)
    await expect(f('https://clerk.higgsfield.ai/oauth/token')).rejects.toThrow()
  })
  it('bounds response bytes and forwards Request bodies correctly',async()=>{
    let body=''
    const f=createHiggsfieldFetch(async input=>{body=await new Request(input).text();return new Response('{}')},1000)
    await f(new Request('https://clerk.higgsfield.ai/oauth/token',{method:'POST',body:'grant_type=refresh_token'}))
    expect(body).toBe('grant_type=refresh_token')
    const large=createHiggsfieldFetch(async()=>new Response('x'.repeat(1048577)),1000)
    await expect(large('https://clerk.higgsfield.ai/oauth/token')).rejects.toThrow()
  })
})
