import { beforeEach,describe,expect,it,vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { ProjectAccessOk } from '@/lib/auth/project-access'

const state=vi.hoisted(()=>({
  admission:null as null|Record<string,any>,count:0,
}))
vi.mock('@/lib/media/asset/admission',()=>({
  admitAssetBytes:async(input:Record<string,unknown>)=>{
    state.count++;state.admission=input
    return {asset:{id:'88888888-8888-4888-8888-888888888888'}}
  },
}))
import { finalizeReferenceTicket,parseFinalizeInput } from './finalize'
import { stagingPath,STAGING_BUCKET } from './tickets'

const ownerId=randomUUID(),projectId=randomUUID(),conversationId=randomUUID(),ticketId=randomUUID()
const owner:ProjectAccessOk={ok:true,userId:ownerId,allowedProjectIds:[projectId]}
const ref={projectId,conversationId,ticketId}
const assetId='88888888-8888-4888-8888-888888888888'
function fixture() {
  const ticket:any={
    id:ticketId,owner_id:ownerId,project_id:projectId,conversation_id:conversationId,
    mime_type:'image/png',object_path:stagingPath(projectId,conversationId,ticketId,'image/png'),
    state:'issued',expires_at:new Date(Date.now()+3600_000).toISOString(),asset_id:null,
  }
  let file:Blob|null=null,projectOwner=ownerId,paused=false,downloaded=0,removed=0,allowed=true
  const from=(name:string)=>{
    const where:Record<string,unknown>={}
    let updating:Record<string,unknown>|null=null
    const builder:any={
      select:()=>builder,
      eq:(k:string,v:unknown)=>{where[k]=v;return builder},
      is:(k:string,v:unknown)=>{where[k]=v;return builder},
      then:(resolve:(v:any)=>any,reject:(v:unknown)=>any)=>{
        if(name==='website_build_reference_tickets'&&updating){Object.assign(ticket,updating)}
        return Promise.resolve({data:null,error:null}).then(resolve,reject)
      },
      maybeSingle:async()=>{
        if(name==='projects')return{data:!paused&&allowed&&where.id===projectId&&where.owner_id===projectOwner&&where.execution_paused===false?{id:projectId}:null,error:null}
        if(name==='conversations')return{data:allowed&&where.id===conversationId&&where.project_id===projectId&&where.user_id===ownerId?{id:conversationId}:null,error:null}
        if(name==='project_lifecycle')return{data:{state:'active'},error:null}
        if(name==='website_build_reference_tickets'){
          if(where.id!==ticketId||where.owner_id!==ownerId||where.project_id!==projectId||where.conversation_id!==conversationId)
            return{data:null,error:null}
          if(updating){
            if(where.state!==undefined&&ticket.state!==where.state)return{data:null,error:null}
            Object.assign(ticket,updating)
            return{data:{id:ticketId},error:null}
          }
          return{data:{...ticket},error:null}
        }
        throw Error(name)
      },
      update:(r:Record<string,unknown>)=>{updating=r;return builder},
    }
    return builder
  }
  return {
    db:{from,storage:{from:(name:string)=>{
      if(name!==STAGING_BUCKET)throw Error('Unexpected storage bucket')
      return{download:async(path:string)=>{
        expect(path).toBe(ticket.object_path)
        downloaded++
        return file?{data:file,error:null}:{data:null,error:{message:'no file'}}
      },remove:async()=>{removed++;return{data:{},error:null}}}
    }}} as never,
    ticket,setFile:(value:Blob)=>{file=value},pause:()=>{paused=true},revoke:()=>{allowed=false},
    get downloaded(){return downloaded},get removed(){return removed},
  }
}
beforeEach(()=>{state.admission=null;state.count=0})
describe('reference upload finalization',()=>{
  it('rejects forged body shape',()=>{
    expect(parseFinalizeInput(ref)).toEqual(ref)
    for(const bad of [{...ref,path:'other'}, {...ref,ownerId}, {...ref,ticketId:'not-uuid'}])
      expect(()=>parseFinalizeInput(bad)).toThrow()
  })
  it('redeems one valid upload into a private canonical Asset and is idempotent when ready',async()=>{
    const f=fixture()
    f.setFile(new Blob([Uint8Array.from(await sharp({create:{width:48,height:32,channels:3,background:'#1278aa'}}).png().toBuffer())]))
    const a=await finalizeReferenceTicket(f.db,owner,ref)
    expect(a).toEqual({status:'ready',ticketId,assetId})
    expect(f.ticket.state).toBe('ready')
    expect(f.ticket.asset_id).toBe(assetId)
    expect(f.downloaded).toBe(1);expect(f.removed).toBe(1)
    expect(state.count).toBe(1)
    expect(state.admission).toMatchObject({
      projectId,kind:'image',visibility:'internal',mimeType:'image/webp',
      width:48,height:32,provenance:{source:'uploaded',simulated:false},
    })
    expect(state.admission?.storage.path).toContain(ticketId)
    expect(await finalizeReferenceTicket(f.db,owner,ref)).toEqual(a)
    expect(state.count).toBe(1)
  })
  it('refuses foreign, paused or archived contexts before reading staged bytes',async()=>{
    let f=fixture()
    await expect(finalizeReferenceTicket(f.db,{...owner,allowedProjectIds:[]},ref))
      .rejects.toMatchObject({code:'NOT_FOUND'})
    f=fixture();f.revoke()
    await expect(finalizeReferenceTicket(f.db,owner,ref)).rejects.toMatchObject({code:'NOT_FOUND'})
    f=fixture();f.pause()
    await expect(finalizeReferenceTicket(f.db,owner,ref)).rejects.toMatchObject({code:'NOT_FOUND'})
    expect(state.count).toBe(0)
  })
  it('releases an unuploaded ticket for retry without creating an Asset',async()=>{
    const f=fixture()
    await expect(finalizeReferenceTicket(f.db,owner,ref)).rejects.toMatchObject({code:'CONFLICT'})
    expect(f.ticket.state).toBe('issued');expect(state.count).toBe(0)
  })
  it('rejects corrupt original bytes without admitting or publishing them',async()=>{
    const f=fixture()
    f.setFile(new Blob([Buffer.from('not really a png')]))
    await expect(finalizeReferenceTicket(f.db,owner,ref)).rejects.toMatchObject({code:'INVALID_BODY'})
    expect(f.ticket.state).toBe('rejected')
    expect(state.count).toBe(0);expect(f.removed).toBe(1)
  })
  it('refuses a concurrent or expired ticket and never touches storage',async()=>{
    let f=fixture();f.ticket.state='processing'
    await expect(finalizeReferenceTicket(f.db,owner,ref)).rejects.toMatchObject({code:'CONFLICT'})
    expect(f.downloaded).toBe(0)
    f=fixture();f.ticket.expires_at='2020-01-01T00:00:00Z'
    await expect(finalizeReferenceTicket(f.db,owner,ref)).rejects.toMatchObject({code:'CONFLICT'})
    expect(f.downloaded).toBe(0)
  })
})
