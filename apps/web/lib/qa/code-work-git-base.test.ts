import {describe,it,expect,vi} from 'vitest'
import {observeTrustedOmniraMain} from '@/lib/atlas/code-work/intake/git-base'
const HEAD='11b7433c259829c64857fa609a738ef8163889b1'
const ref=(sha=HEAD)=>({ref:'refs/heads/main',object:{type:'commit',sha}})
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),
 {status,headers:{'content-type':'application/json'}})
const mock=(body:unknown,status=200)=>vi.fn(async()=>response(body,status)) as unknown as typeof fetch
const denied={ok:false,reason:'trusted_git_base_unavailable'}

describe('trusted Omnira main observation is fixed and read-only',()=>{
 it('observes only the registered exact main ref and validates a full commit SHA',async()=>{
  const fetcher=mock(ref())
  expect(await observeTrustedOmniraMain(fetcher)).toEqual({
   ok:true,repositoryId:'github.com/bumbi190/ai-operating-platform',
   baseRef:'refs/heads/main',pinnedBaseSha:HEAD,
  })
  expect(fetcher).toHaveBeenCalledTimes(1)
  const [url,options]=(fetcher as any).mock.calls[0]
  expect(url).toBe('https://api.github.com/repos/Bumbi190/ai-operating-platform/git/ref/heads/main')
  expect(options).toMatchObject({method:'GET',cache:'no-store',redirect:'error'})
  expect(options.headers).not.toHaveProperty('Authorization')
  expect(options.headers).not.toHaveProperty('Cookie')
 })
 it('rejects a branch or ref substitution even when the hash is valid',async()=>{
  for(const payload of [
   {...ref(),ref:'refs/heads/develop'},
   {...ref(),ref:'refs/tags/main'},
   {...ref(),object:{type:'tag',sha:HEAD}},
   {...ref(),object:{type:'commit',sha:'A'.repeat(40)}},
   {...ref(),object:{type:'commit',sha:'x'.repeat(40)}},
   {...ref(),object:{type:'commit',sha:HEAD.slice(0,10)}},
   {ref:'refs/heads/main',object:null},
   null,[],
  ])expect(await observeTrustedOmniraMain(mock(payload))).toEqual(denied)
 })
 it('fails closed on error statuses and malformed payloads',async()=>{
  for(const status of [301,401,403,404,429,500]){
   expect(await observeTrustedOmniraMain(mock({error:'denied'},status))).toEqual(denied)
  }
  const invalid=vi.fn(async()=>new Response('not valid JSON')) as unknown as typeof fetch
  expect(await observeTrustedOmniraMain(invalid)).toEqual(denied)
 })
 it('enforces a maximum response size and never follows a redirect',async()=>{
  const oversized=vi.fn(async()=>new Response(JSON.stringify(ref()),{
   headers:{'content-length':'40000'},
  })) as unknown as typeof fetch
  expect(await observeTrustedOmniraMain(oversized)).toEqual(denied)
  const padded=vi.fn(async()=>new Response(' '.repeat(20_000)+JSON.stringify(ref()))) as unknown as typeof fetch
  expect(await observeTrustedOmniraMain(padded)).toEqual(denied)
 })
 it('never falls back to a guessed SHA after a network exception',async()=>{
  const failing=vi.fn(async()=>{throw Error('unavailable')}) as unknown as typeof fetch
  expect(await observeTrustedOmniraMain(failing)).toEqual(denied)
 })
 it('re-observes the remote ref on each request instead of reusing a stale result',async()=>{
  let index=0
  const hashes=[HEAD,'a'.repeat(40)]
  const fetcher=vi.fn(async()=>response(ref(hashes[index++]))) as unknown as typeof fetch
  const first=await observeTrustedOmniraMain(fetcher)
  const second=await observeTrustedOmniraMain(fetcher)
  expect(first).toMatchObject({ok:true,pinnedBaseSha:HEAD})
  expect(second).toMatchObject({ok:true,pinnedBaseSha:'a'.repeat(40)})
  expect(fetcher).toHaveBeenCalledTimes(2)
 })
})
