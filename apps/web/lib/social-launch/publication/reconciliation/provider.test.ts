
import {it,expect,vi} from 'vitest'
import {facebookCandidate,validCandidateFor,listFacebookCandidates,readFacebookCandidate} from './provider'
const c={channel:'facebook' as const,accountId:'12345',token:'fixture-token',apiBase:'https://graph.facebook.com/v21.0'}
const raw={id:'12345_67890',from:{id:'12345'},message:'Exakt é text',created_time:'2026-10-18T06:17:47+0000',permalink_url:'https://www.facebook.com/12345/posts/67890',attachments:{data:[{type:'photo',target:{id:'888'},media:{image:{src:'https://scontent.fna.fbcdn.net/photo.jpg'}}}]}}
const snapshot:any={publication:{accountId:'12345',requestedAt:'2026-10-18T06:17:47Z'},revision:{draft:{text:raw.message}}}
it('requires exact caption account window and photo without normalizing Unicode',()=>{
 const v=facebookCandidate(c,raw);expect(validCandidateFor(v,snapshot)).toBe(true)
 for(const change of [{text:'Exakt é text'},{text:raw.message+' '},{accountId:'999'},{createdAt:'2026-10-18T06:16:46Z'},{createdAt:'2026-10-18T06:22:48Z'}])expect(validCandidateFor({...v,...change},snapshot)).toBe(false)
})
it('rejects missing photos and untrusted links',()=>{
 for(const changed of [{...raw,attachments:{data:[]}},{...raw,permalink_url:'https://www.facebook.com.evil.test/post'},{...raw,attachments:{data:[{type:'photo',target:{id:'888'},media:{image:{src:'https://evil.test/a.jpg'}}}]}},{...raw,id:'../999'}])expect(()=>facebookCandidate(c,changed)).toThrow()
})

it('only reads fixed Meta paths and never puts the credential in a URL',async()=>{
 const calls:{url:string;init:RequestInit}[]=[]
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{calls.push({url,init});return Response.json(url.includes('/published_posts?')?{data:[raw]}:raw)})
 try{
  const list=await listFacebookCandidates(c,snapshot)
  expect(list).toHaveLength(1);expect((await readFacebookCandidate(c,list[0].providerId)).photoId).toBe('888')
  expect(calls).toHaveLength(2);expect(calls.every(call=>call.init.method==='GET')).toBe(true)
  expect(calls.every(call=>new URL(call.url).origin==='https://graph.facebook.com'&&!call.url.includes('fixture-token'))).toBe(true)
  await expect(readFacebookCandidate(c,'999_67890')).rejects.toBeTruthy();expect(calls).toHaveLength(2)
 }finally{vi.unstubAllGlobals()}
})
