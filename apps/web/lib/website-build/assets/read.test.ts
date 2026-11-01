import {describe,expect,it,vi} from 'vitest'
import {createHash,randomUUID} from 'node:crypto'
import sharp from 'sharp'
import type {ProjectAccessOk} from '@/lib/auth/project-access'

vi.mock('./tickets',()=>({assertReferenceWorkspace:async(_db:unknown,p:ProjectAccessOk,projectId:string,conversationId:string)=>{
  if(!p.allowedProjectIds.includes(projectId)||conversationId!==allowedConversation)
    throw Object.assign(new Error('Not found'),{code:'NOT_FOUND',status:404})
}}))
import {listStoredReferences,parseReferenceQuery,readStoredReference} from './read'
const ownerId=randomUUID(),projectId=randomUUID(),allowedConversation=randomUUID(),ticketId=randomUUID(),assetId=randomUUID()
const principal:ProjectAccessOk={ok:true,userId:ownerId,allowedProjectIds:[projectId]}
const ref={projectId,conversationId:allowedConversation,ticketId}

async function setup(){
  const bytes=Uint8Array.from(await sharp({create:{width:12,height:14,channels:3,background:'#336699'}}).webp().toBuffer())
  const expectedPath=`website/references/${projectId}/${allowedConversation}/${ticketId}.webp`
  const asset:any={
    id:assetId,project_id:projectId,visibility:'internal',status:'active',kind:'image',mime_type:'image/webp',
    byte_size:bytes.length,checksum_sha256:createHash('sha256').update(bytes).digest('hex'),
    storage_bucket:'media-assets-private',storage_path:expectedPath,
  }
  const provenance:any={
    asset_id:assetId,source:'uploaded',provider_metadata:{purpose:'atlas-website-reference',ticketId},
  }
  const ticket:any={
    id:ticketId,owner_id:ownerId,project_id:projectId,conversation_id:allowedConversation,
    state:'ready',asset_id:assetId,issued_at:new Date().toISOString(),
  }
  let downloadCount=0, onDownload=()=>{}, selectedTables:string[]=[]
  const db:any={
    from:(table:string)=>{
      selectedTables.push(table)
      const filters:Record<string,unknown>={}
      const query:any={
        select:()=>query,
        eq:(k:string,v:unknown)=>{filters[k]=v;return query},
        order:()=>query,
        limit:()=>query,
        maybeSingle:async()=>{
          if(table==='website_build_reference_tickets')
            return{data:filters.owner_id===ownerId&&filters.project_id===projectId&&filters.conversation_id===allowedConversation&&filters.state==='ready'&&filters.id===ticketId?ticket:null,error:null}
          if(table==='assets')return{data:filters.project_id===projectId&&filters.id===assetId?asset:null,error:null}
          if(table==='asset_provenance')return{data:filters.asset_id===assetId?provenance:null,error:null}
          throw Error('unexpected '+table)
        },
        then:(resolve:(v:unknown)=>unknown,reject:(v:unknown)=>unknown)=>{
          const result=table==='website_build_reference_tickets'
            && filters.owner_id===ownerId&&filters.project_id===projectId&&filters.conversation_id===allowedConversation&&filters.state==='ready'
              ? {data:[ticket],error:null}:{data:[],error:null}
          return Promise.resolve(result).then(resolve,reject)
        },
      }
      return query
    },
    storage:{from:(bucket:string)=>{
      if(bucket!=='media-assets-private')throw Error('Unsafe bucket')
      return {download:async(path:string)=>{
        downloadCount++
        onDownload()
        if(path!==expectedPath)throw Error('Wrong path')
        return{data:new Blob([Uint8Array.from(bytes)]),error:null}
      }}
    }},
  }
  return {db,asset,provenance,ticket,bytes,whenDownloaded:(callback:()=>void)=>{onDownload=callback},
    get downloadCount(){return downloadCount},selectedTables}
}
describe('scoped private website reference reads',()=>{
  it('refuses unknown query args, duplicates and foreign project identifiers',()=>{
    expect(parseReferenceQuery(new URLSearchParams({projectId,conversationId:allowedConversation}),false))
      .toEqual({projectId,conversationId:allowedConversation})
    for(const q of ['?projectId='+projectId+'&conversationId='+allowedConversation+'&ownerId=oops',
      '?projectId='+projectId+'&projectId='+projectId+'&conversationId='+allowedConversation,
      '?projectId=x&conversationId='+allowedConversation]){
      expect(()=>parseReferenceQuery(new URLSearchParams(q),false)).toThrow()
    }
  })
  it('returns opaque IDs only for this exact owner/project/conversation',async()=>{
    const f=await setup()
    const entries=await listStoredReferences(f.db,principal,{projectId,conversationId:allowedConversation})
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ticketId,assetId})
    expect(JSON.stringify(entries)).not.toContain('media-assets-private')
    await expect(listStoredReferences(f.db,{...principal,allowedProjectIds:[]},
      {projectId,conversationId:allowedConversation})).rejects.toMatchObject({code:'NOT_FOUND'})
    await expect(listStoredReferences(f.db,principal,
      {projectId,conversationId:randomUUID()})).rejects.toMatchObject({code:'NOT_FOUND'})
  })
  it('delivers a verified WebP from the private bucket only',async()=>{
    const f=await setup()
    const result=await readStoredReference(f.db,principal,ref)
    expect(result).toEqual(f.bytes)
    expect(f.downloadCount).toBe(1)
    expect(f.selectedTables).toContain('asset_provenance')
  })
  it('refuses foreign or corrupt ticket/asset/provenance before any byte read',async()=>{
    const cases=[
      (f:Awaited<ReturnType<typeof setup>>)=>{f.ticket.owner_id=randomUUID()},
      (f:Awaited<ReturnType<typeof setup>>)=>{f.ticket.state='processing'},
      (f:Awaited<ReturnType<typeof setup>>)=>{f.asset.storage_bucket='media-assets'},
      (f:Awaited<ReturnType<typeof setup>>)=>{f.asset.storage_path='../unsafe.webp'},
      (f:Awaited<ReturnType<typeof setup>>)=>{f.asset.visibility='public'},
      (f:Awaited<ReturnType<typeof setup>>)=>{f.asset.status='archived'},
      (f:Awaited<ReturnType<typeof setup>>)=>{f.provenance.provider_metadata.ticketId=randomUUID()},
      (f:Awaited<ReturnType<typeof setup>>)=>{f.provenance.source='generated'},
    ]
    for(const makeInvalid of cases){
      const f=await setup();makeInvalid(f)
      await expect(readStoredReference(f.db,principal,ref)).rejects.toMatchObject({code:'NOT_FOUND'})
      expect(f.downloadCount).toBe(0)
    }
  })
  it('refuses delivery if project access is revoked during private file download',async()=>{
    const f=await setup()
    const actor={...principal,allowedProjectIds:[projectId]}
    f.whenDownloaded(()=>{actor.allowedProjectIds=[]})
    await expect(readStoredReference(f.db,actor,ref)).rejects.toMatchObject({code:'NOT_FOUND'})
    expect(f.downloadCount).toBe(1)
  })
  it('detects content corruption after storage download and refuses delivery',async()=>{
    const f=await setup()
    f.asset.checksum_sha256='a'.repeat(64)
    await expect(readStoredReference(f.db,principal,ref)).rejects.toMatchObject({code:'BUILD_UNAVAILABLE'})
    expect(f.downloadCount).toBe(1)
  })
})
