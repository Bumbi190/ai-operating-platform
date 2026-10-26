import {it,expect,vi,afterEach} from 'vitest';
import {instagramCandidate,listInstagramCandidates,readInstagramCandidate} from './instagram-provider';
const c={channel:'instagram' as const,accountId:'12345',token:'fixture-secret',apiBase:'https://graph.instagram.com/v21.0'};
const raw={id:'67890',owner:{id:'12345'},caption:'Nova och Pling under stjärnorna',media_type:'IMAGE',timestamp:'2026-10-23T18:31:47+0000',permalink:'https://www.instagram.com/p/Example_123/',media_url:'https://scontent-arn2-1.cdninstagram.com/photo.jpg?rotating=1'};
const snapshot:any={publication:{accountId:'12345',requestedAt:'2026-10-23T18:31:47Z'},revision:{draft:{text:raw.caption}}};
afterEach(()=>vi.unstubAllGlobals());
it('parses one owned Instagram image into the existing proof contract',()=>{
 expect(instagramCandidate(c,raw)).toMatchObject({providerId:'67890',accountId:'12345',photoId:'67890',text:raw.caption,createdAt:'2026-10-23T18:31:47.000Z'});
});
it('rejects foreign owner, missing ownership, video, carousel and hostile URLs',()=>{
 for(const change of [{owner:{id:'999'}},{owner:undefined},{media_type:'VIDEO'},{media_type:'CAROUSEL_ALBUM'},{permalink:'https://instagram.com.evil.test/p/foo/'},{media_url:'https://scontent.cdninstagram.com.evil.test/a.jpg'},{id:'../other'},{caption:null}])expect(()=>instagramCandidate(c,{...raw,...change})).toThrow();
});
it('lists and re-reads only GET endpoints with header credentials and no pagination URL following',async()=>{
 const calls:any[]=[];vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{calls.push({url,init});return Response.json(url.includes('/12345/media?')?{data:[raw]}:raw)});
 expect(await listInstagramCandidates(c,snapshot)).toHaveLength(1);expect((await readInstagramCandidate(c,'67890')).providerId).toBe('67890');
 expect(calls).toHaveLength(2);expect(calls.every(x=>x.init.method==='GET'&&!x.url.includes(c.token)&&x.init.headers.Authorization==='Bearer '+c.token&&x.init.redirect==='error')).toBe(true);
});
it('filters caption/time mismatches without normalizing proof identity',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({data:[raw,{...raw,id:'67891',caption:raw.caption+' '},{...raw,id:'67892',timestamp:'2026-10-23T18:36:48Z'}]}));
 expect((await listInstagramCandidates(c,snapshot)).map(x=>x.providerId)).toEqual(['67890']);
});
it('refuses a credential host or media ID before network access',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 for(const bad of [{...c,apiBase:'https://graph.instagram.com.evil.test/v21.0'},{...c,channel:'facebook' as any},{...c,token:'bad\ncredential'}])await expect(listInstagramCandidates(bad,snapshot)).rejects.toBeTruthy();
 await expect(readInstagramCandidate(c,'../123')).rejects.toBeTruthy();expect(fetcher).not.toHaveBeenCalled();
});
it('bounds provider response size and refuses failed responses',async()=>{
 vi.stubGlobal('fetch',async()=>new Response('x'.repeat(65537)));await expect(listInstagramCandidates(c,snapshot)).rejects.toBeTruthy();
 vi.stubGlobal('fetch',async()=>Response.json({error:{message:'private provider message'}},{status:403}));await expect(listInstagramCandidates(c,snapshot)).rejects.toMatchObject({code:'provider_unavailable'});
});

it('refuses an incomplete paginated result rather than claiming uniqueness',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({data:[raw],paging:{next:'https://evil.test/token'}}));
 await expect(listInstagramCandidates(c,snapshot)).rejects.toMatchObject({code:'invalid_response'});
});

it('honors inclusive time boundaries and refuses unsafe image URLs',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({data:[{...raw,id:'1',timestamp:'2026-10-23T18:30:47Z'},{...raw,id:'2',timestamp:'2026-10-23T18:30:46Z'},{...raw,id:'3',timestamp:'2026-10-23T18:36:47Z'}]}));
 expect((await listInstagramCandidates(c,snapshot)).map(x=>x.providerId)).toEqual(['1','3']);
 for(const media_url of ['https://user:pass@scontent.cdninstagram.com/a.jpg','https://scontent.cdninstagram.com/a.jpg#fragment','https://scontent.cdninstagram.com:444/a.jpg'])expect(()=>instagramCandidate(c,{...raw,media_url})).toThrow();
});
it('fails safely on an aborted provider request',async()=>{
 vi.stubGlobal('fetch',async()=>{throw new DOMException('aborted','AbortError')});
 await expect(listInstagramCandidates(c,snapshot)).rejects.toMatchObject({code:'provider_unavailable'});
});
