
import {it,expect} from 'vitest'
import {executeApprovedPublication} from './executor'
import {MetaManualProvider} from './provider'
import {PublicationError,type PublicationRecord} from './types'
function fixture(channel:'facebook'|'instagram'='facebook',fault?:'committed'|'uncommitted'|'cas'){
 let record:any=null,posts=0,revoked=false,faultOnce=true
 const credential={channel,accountId:'12345',token:'fixture-token',apiBase:'https://graph.facebook.com/v21.0'}
 const revision:any={id:'revision',sha256:'a'.repeat(64),draft:{channel,format:'image',text:'Exakt familjetext',linkUrl:null},media:[{id:'asset',sha256:'b'.repeat(64)}]}
 const journal={
  prepare:async()=>record??(record={id:'10000000-0000-4000-8000-000000000001',projectId:'project',postId:'post',channel,state:'requested',version:1,containerId:null,providerId:null,updatedAt:new Date().toISOString()}),
  step:async(r:PublicationRecord,action:string,extra:any={})=>{
   if(fault==='cas'&&action==='claim_create')return {changed:false,record:{...r,state:'publishing',version:r.version+1} as PublicationRecord}
   if(action==='complete'&&fault&&faultOnce){faultOnce=false;if(fault==='committed')record={...record,...extra,state:'published',version:record.version+1};throw Error('checkpoint response lost')}
   if(record.version!==r.version)return {changed:false,record}
   const state=action==='claim_create'?(channel==='facebook'?'publishing':'creating'):action==='container_ready'?'processing':action==='claim_publish'?'publishing':action==='complete'||action==='confirm_published'?'published':action==='fail'?'failed':action==='uncertain'?'uncertain':record.state
   if(record.state==='published')return {changed:false,record}
   record={...record,...extra,state,version:record.version+1}
   return {changed:true,record}
  }
 }
 const provider=new MetaManualProvider(async(url,init)=>{if(init.method==='POST'){posts++;return Response.json({id:url.endsWith('/media')?'111':'222',post_id:channel==='facebook'?'12345_222':undefined})}return Response.json(url.includes('status_code')?{status_code:'FINISHED'}:{permalink:'https://www.instagram.com/p/fixture/'})})
 const ctx={db:{} as any,snapshot:{projectId:'project',postId:'post',revision},record:null as PublicationRecord|null,credential,journal,authorizeWrite:async()=>{if(revoked)throw new PublicationError('STOPPED')}}
 const deps={provider,verifyImage:async()=>({bytes:new Uint8Array(),width:320,height:400}),now:()=>Date.now(),signal:new AbortController().signal}
 return {ctx,deps,get posts(){return posts},get record(){return record},revoke:()=>{revoked=true}}
}
it('no_send_after_stop_during_image_read',async()=>{
 const f=fixture();f.deps.verifyImage=async()=>{f.revoke();return {bytes:new Uint8Array(),width:320,height:400}}
 await expect(executeApprovedPublication(f.ctx,f.deps)).rejects.toMatchObject({code:'STOPPED'});expect(f.posts).toBe(0)
})
it('no_publish_after_revoked_instagram_container',async()=>{
 const f=fixture('instagram');let posts=0
 f.deps.provider=new MetaManualProvider(async(_url,init)=>{if(init.method==='POST'){posts++;f.revoke();return Response.json({id:'111'})}return Response.json({status_code:'FINISHED'})})
 await expect(executeApprovedPublication(f.ctx,f.deps)).rejects.toMatchObject({code:'STOPPED'})
 expect(posts).toBe(1);expect(f.record.state).toBe('processing')
})
it('unknown_write_never_reclaimed',async()=>{
 const f=fixture();let posts=0
 f.deps.provider=new MetaManualProvider(async()=>{posts++;throw Error('lost provider reply')})
 const first=await executeApprovedPublication(f.ctx,f.deps);expect(first.state).toBe('uncertain')
 const second=await executeApprovedPublication({...f.ctx,record:first},f.deps);expect(second.state).toBe('uncertain');expect(posts).toBe(1)
})
it('a bare Facebook feed receipt stays uncertain and is not sent again',async()=>{
 const f=fixture();let posts=0
 f.ctx.snapshot.revision.draft.format='text'
 f.deps.provider=new MetaManualProvider(async()=>{posts++;return Response.json({id:'222'})})
 const first=await executeApprovedPublication(f.ctx,f.deps)
 expect(first).toMatchObject({state:'uncertain',failureCode:'invalid_response'})
 const second=await executeApprovedPublication({...f.ctx,record:first},f.deps)
 expect(second.state).toBe('uncertain');expect(posts).toBe(1)
})
it('checkpoint_loss_is_uncertain_without_retry',async()=>{
 for(const fault of ['committed','uncommitted'] as const){
  const f=fixture('facebook',fault),r=await executeApprovedPublication(f.ctx,f.deps)
  expect(r.state).toBe(fault==='committed'?'published':'uncertain');expect(f.posts).toBe(1)
  await executeApprovedPublication({...f.ctx,record:r},f.deps);expect(f.posts).toBe(1)
 }
})
it('a lost claim CAS never admits this executor to send',async()=>{
 const f=fixture('facebook','cas'),r=await executeApprovedPublication(f.ctx,f.deps)
 expect(r.state).toBe('publishing');expect(f.posts).toBe(0)
})
it('an expired worker budget makes no request',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort()
 await expect(executeApprovedPublication(f.ctx,{...f.deps,signal:controller.signal})).rejects.toBeTruthy();expect(f.posts).toBe(0)
})
