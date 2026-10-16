import {it,expect} from 'vitest'
import {MetaManualProvider} from './provider'
const facebook={channel:'facebook' as const,accountId:'12345',token:'fixture-token',apiBase:'https://graph.facebook.com/v21.0'}
const instagram={...facebook,channel:'instagram' as const,apiBase:'https://graph.instagram.com/v21.0'}
const media='https://app.omniraos.se/api/social-publication-media?publicationId=10000000-0000-4000-8000-000000000001&key='+'a'.repeat(43)
it('posts exact Facebook text/link only to its fixed page with credential in header',async()=>{
 const calls:any[]=[];const provider=new MetaManualProvider(async(url,init)=>{calls.push({url,init});return Response.json({id:'12345_67890'})})
 expect(await provider.facebook(facebook,{text:'En lugn familjehelg',linkUrl:'https://example.test/helg',imageUrl:null})).toMatchObject({providerId:'12345_67890'})
 expect(calls).toHaveLength(1);expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/12345/feed');expect(calls[0].init.headers.Authorization).toBe('Bearer fixture-token')
 const body=new URLSearchParams(calls[0].init.body);expect(body.get('message')).toBe('En lugn familjehelg');expect(body.get('link')).toBe('https://example.test/helg');expect(body.has('access_token')).toBe(false);expect(calls[0].url).not.toContain('fixture-token');expect(calls[0].init.redirect).toBe('error');expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
})
it('uses reviewed image URL and exact caption without adding a brand footer',async()=>{
 const calls:any[]=[];const provider=new MetaManualProvider(async(url,init)=>{calls.push({url,init});return Response.json({id:'67890',post_id:'12345_67890'})})
 await provider.facebook(facebook,{text:'Exakt text',linkUrl:null,imageUrl:media});expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/12345/photos');const body=new URLSearchParams(calls[0].init.body);expect(body.get('url')).toBe(media);expect(body.get('message')).toBe('Exakt text');expect(body.get('published')).toBe('true')
})
it('creates and publishes an Instagram image through separate explicit calls',async()=>{
 const calls:any[]=[];const responses=[{id:'111'},{status_code:'FINISHED'},{id:'222'},{permalink:'https://www.instagram.com/p/fixture/'}]
 const provider=new MetaManualProvider(async(url,init)=>{calls.push({url,init});return Response.json(responses.shift())})
 expect(await provider.createImage(instagram,media,'Exakt bildtext')).toBe('111');expect(await provider.status(instagram,'111')).toBe('FINISHED');expect(await provider.publish(instagram,'111')).toBe('222');expect(await provider.permalink(instagram,'222')).toBe('https://www.instagram.com/p/fixture/')
 expect(calls.map(c=>c.url)).toEqual(['https://graph.instagram.com/v21.0/12345/media','https://graph.instagram.com/v21.0/111?fields=status_code','https://graph.instagram.com/v21.0/12345/media_publish','https://graph.instagram.com/v21.0/222?fields=permalink'])
 expect(new URLSearchParams(calls[0].init.body).get('image_url')).toBe(media);expect(new URLSearchParams(calls[0].init.body).get('caption')).toBe('Exakt bildtext');expect(new URLSearchParams(calls[2].init.body).get('creation_id')).toBe('111')
})
it('refuses host/path injection without making any request',async()=>{
 let count=0;const provider=new MetaManualProvider(async()=>{count++;return Response.json({id:'1'})})
 await expect(provider.facebook({...facebook,apiBase:'https://evil.invalid/v21.0'},{text:'x',linkUrl:null,imageUrl:null})).rejects.toMatchObject({code:'invalid_response'})
 await expect(provider.createImage({...instagram,accountId:'../other'},media,'x')).rejects.toMatchObject({code:'invalid_response'})
 expect(count).toBe(0)
})
it('never retries a POST and hides raw rejection/network/error bodies',async()=>{
 for(const scenario of ['denied','network','invalid','large']){
  let calls=0;const provider=new MetaManualProvider(async()=>{calls++;if(scenario==='network')throw Error('secret-token https://private.invalid');if(scenario==='denied')return Response.json({error:{code:190,message:'secret-token'}},{status:401});if(scenario==='invalid')return new Response('secret-token');return new Response('x'.repeat(66000))})
  let error:any;try{await provider.facebook(facebook,{text:'x',linkUrl:null,imageUrl:null})}catch(e){error=e}
  expect(calls).toBe(1);expect(error.code).toBe(scenario==='denied'?'provider_denied':scenario==='network'?'provider_unavailable':'invalid_response');expect(error.outcome).toBe(scenario==='denied'?'rejected':'unknown');expect(error.message).not.toContain('secret-token')
 }
})
it('missing permalink never discards a successful provider id or returns an unsafe URL',async()=>{
 for(const value of [{permalink:'javascript:alert(1)'},{permalink:'https://evil.invalid/post'},{}]){
  const provider=new MetaManualProvider(async()=>Response.json(value));expect(await provider.permalink(instagram,'222')).toBeNull()
 }
})
