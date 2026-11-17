import { describe, expect, it, vi } from 'vitest'
import { CATALOG_READ_ROLE, getCatalogReadCredentials } from '@/lib/ai/model-control/catalog-oidc'

const valid={configuredRoleArn:CATALOG_READ_ROLE,oidcToken:'fake-vercel.jwt'}
describe('Dedicated read-only AWS catalog role; never existing paid model role',()=>{
  it('requires exact new read-only ARN, no fallback to Nova Invoke role',async()=>{
    const fetcher=vi.fn()
    await expect(getCatalogReadCredentials({...valid,configuredRoleArn:
      'arn:aws:iam::793854110735:role/Omnira-Bedrock-Test',fetcher}))
      .rejects.toThrow('CATALOG_READ_ROLE_NOT_CONFIGURED')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requires server-provided OIDC JWT, never static AWS creds',async()=>{
    const fetcher=vi.fn()
    await expect(getCatalogReadCredentials({...valid,oidcToken:null,fetcher}))
      .rejects.toThrow('CATALOG_PREVIEW_OIDC_TOKEN_MISSING')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('STS request uses only new fixed role and returns short-lived credentials',async()=>{
    const fetcher=vi.fn(async(url:string,opts:{body:string;method:string})=>{
      expect(url).toBe('https://sts.us-east-1.amazonaws.com/')
      expect(opts.method).toBe('POST')
      const form=new URLSearchParams(opts.body)
      expect(form.get('Action')).toBe('AssumeRoleWithWebIdentity')
      expect(form.get('RoleArn')).toBe(CATALOG_READ_ROLE)
      expect(form.get('WebIdentityToken')).toBe('fake-vercel.jwt')
      expect(form.get('DurationSeconds')).toBe('900')
      return new Response('<AssumedRoleUser><Arn>fake</Arn></AssumedRoleUser>'
        +'<Credentials><AccessKeyId>FAKE_ACCESS</AccessKeyId>'
        +'<SecretAccessKey>FAKE_SECRET</SecretAccessKey>'
        +'<SessionToken>FAKE_SESSION</SessionToken></Credentials>',{status:200})
    })
    const r=await getCatalogReadCredentials({...valid,fetcher:fetcher as never})
    expect(r).toEqual({accessKeyId:'FAKE_ACCESS',secretAccessKey:'FAKE_SECRET',sessionToken:'FAKE_SESSION'})
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('AWS STS denial does not expose raw credential or AWS XML errors',async()=>{
    const fetcher=vi.fn(async()=>new Response('<Error>PRIVATE_ACCOUNT_SECRET</Error>',{status:403}))
    await expect(getCatalogReadCredentials({...valid,fetcher:fetcher as never}))
      .rejects.toThrow('CATALOG_STS_DENIED')
  })
})
