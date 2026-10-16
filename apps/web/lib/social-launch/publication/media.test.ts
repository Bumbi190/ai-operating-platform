import {beforeAll,it,expect} from 'vitest'
import {initializePublicationDb} from './test-db'
import {publicationFixture,JPEG} from './fixtures.test-utils'
import {verifyPublicationImage} from './media'
let db:ReturnType<typeof initializePublicationDb>
beforeAll(()=>{db=initializePublicationDb()})
function storage(f:Awaited<ReturnType<typeof publicationFixture>>,url='https://fixture.supabase.co/storage/v1/object/sign/media-assets-private/'+f.assetId+'?token=temporary'){
 ;(db as any).storage={from:(bucket:string)=>({createSignedUrl:async(path:string,ttl:number)=>{expect(bucket).toBe('media-assets-private');expect(path).toBe(f.assetId);expect(ttl).toBe(60);return {data:{signedUrl:url},error:null}}})}
}
it('checks the exact owned asset, bounded downloaded bytes, checksum and actual frame size',async()=>{
 const f=await publicationFixture(db,'instagram',true);storage(f)
 const result=await verifyPublicationImage(db,f.projectId,f.post.revision.media[0],{storageOrigin:'https://fixture.supabase.co',fetcher:async(_url,init)=>{expect(init?.redirect).toBe('error');expect(init?.signal).toBeInstanceOf(AbortSignal);return new Response(JPEG)}})
 expect(result.width).toBe(320);expect(result.height).toBe(400);expect(Buffer.from(result.bytes)).toEqual(JPEG);expect(JSON.stringify({...result,bytes:undefined})).not.toContain('token')
})
it('never signs or fetches an asset from a different project or a changed hash',async()=>{
 const f=await publicationFixture(db,'instagram',true);let called=0;(db as any).storage={from:()=>{called++;throw Error('unexpected')}}
 await expect(verifyPublicationImage(db,f.projectId,{...f.post.revision.media[0],sha256:'0'.repeat(64)},{storageOrigin:'https://fixture.supabase.co',fetcher:async()=>{throw Error('unexpected')}})).rejects.toMatchObject({code:'REVIEW_REQUIRED'});expect(called).toBe(0)
})
it('refuses wrong signing origins and corrupt/truncated downloads without reflecting secrets',async()=>{
 const f=await publicationFixture(db,'instagram',true);storage(f,'https://evil.invalid/private?token=secret');let calls=0
 await expect(verifyPublicationImage(db,f.projectId,f.post.revision.media[0],{storageOrigin:'https://fixture.supabase.co',fetcher:async()=>{calls++;return new Response(JPEG)}})).rejects.toMatchObject({code:'UNAVAILABLE'});expect(calls).toBe(0)
 storage(f);await expect(verifyPublicationImage(db,f.projectId,f.post.revision.media[0],{storageOrigin:'https://fixture.supabase.co',fetcher:async()=>new Response(Buffer.alloc(JPEG.length,1))})).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
})
it('cancels an oversized stream instead of buffering unbounded storage content',async()=>{
 const f=await publicationFixture(db,'instagram',true);storage(f);let canceled=false
 const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(8*1024*1024+1))},cancel(){canceled=true}})
 await expect(verifyPublicationImage(db,f.projectId,f.post.revision.media[0],{storageOrigin:'https://fixture.supabase.co',fetcher:async()=>new Response(stream)})).rejects.toMatchObject({code:'UNAVAILABLE'});expect(canceled).toBe(true)
})

it('rejects checksum-matching JPEG envelopes that cannot actually decode',async()=>{
 const sos=JPEG.indexOf(Buffer.from([255,218])),entropy=sos+2+JPEG.readUInt16BE(sos+2)
 const emptyScan=Buffer.concat([JPEG.subarray(0,entropy),Buffer.from([0,255,217])])
 const f=await publicationFixture(db,'instagram',true,emptyScan);storage(f)
 await expect(verifyPublicationImage(db,f.projectId,f.post.revision.media[0],{storageOrigin:'https://fixture.supabase.co',fetcher:async()=>new Response(emptyScan)})).rejects.toMatchObject({code:'UNSUPPORTED'})
})
