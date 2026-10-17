import { beforeEach,describe,expect,it,vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { ProjectAccessOk } from '@/lib/auth/project-access'
import {
  issueReferenceTicket, parseTicketInput, stagingPath, STAGING_BUCKET,
} from './tickets'

const principalId = randomUUID(), projectId=randomUUID(), conversationId=randomUUID()
const draftId=randomUUID()
const owner:ProjectAccessOk={ok:true,userId:principalId,allowedProjectIds:[projectId]}
const input={projectId,conversationId,draftId,slot:0,mimeType:'image/jpeg' as const}

function fixture() {
  const rows:Array<Record<string,any>>=[]
  let projectPaused=false, projectOwner=principalId, conversationOwner=principalId
  let lifecycle='active', signed=0
  const from=(name:string)=>{
    const filters:Record<string,unknown>={}
    const builder:any={
      select:()=>builder,
      eq:(field:string,value:unknown)=>{filters[field]=value;return builder},
      maybeSingle:async()=>{
        let record:any=null
        if(name==='projects' && !projectPaused && projectOwner===filters.owner_id && filters.id===projectId && filters.execution_paused===false)record={id:projectId}
        if(name==='conversations' && conversationOwner===filters.user_id && filters.id===conversationId && filters.project_id===projectId)record={id:conversationId}
        if(name==='project_lifecycle' && filters.project_id===projectId && filters.owner_id===principalId)record={state:lifecycle}
        if(name==='website_build_reference_tickets')record=rows.find(r=>r.owner_id===filters.owner_id&&r.conversation_id===filters.conversation_id&&r.draft_id===filters.draft_id&&r.slot===filters.slot)??null
        return {data:record,error:null}
      },
      insert:(record:Record<string,unknown>)=>({
        select:()=>({single:async()=>{
          if(rows.some(r=>r.owner_id===record.owner_id && r.conversation_id===record.conversation_id && r.draft_id===record.draft_id && r.slot===record.slot))
            return {data:null,error:{code:'23505'}}
          const row={...record,state:'issued'}
          rows.push(row)
          return {data:row,error:null}
        }})
      }),
    }
    return builder
  }
  const db={from,storage:{from:(name:string)=>{
    if(name!==STAGING_BUCKET)throw Error('Wrong upload bucket')
    return {createSignedUploadUrl:async (_path:string)=>{signed++;return{data:{token:'mock-signed-upload'},error:null}}}
  }}}
  return {
    db:db as never,rows,
    get signed(){return signed},
    pause:()=>{projectPaused=true},
    revokeProject:()=>{projectOwner=randomUUID()},
    revokeConversation:()=>{conversationOwner=randomUUID()},
    archive:()=>{lifecycle='archived'},
  }
}
describe('private website reference tickets',()=>{
  it('refuses client-supplied owner, path, invalid draft ids, MIME and slots',()=>{
    const good=parseTicketInput(input)
    expect(good).toEqual(input)
    for(const bad of [
      {...input,ownerId:principalId},{...input,path:'overwrite'},
      {...input,projectId:'..'},{...input,draftId:'other'},
      {...input,slot:4},{...input,slot:-1},{...input,slot:1.5},
      {...input,mimeType:'image/svg+xml'},
    ])expect(()=>parseTicketInput(bad)).toThrow()
  })
  it('mints only a private upload token for a server-generated path, and replays the same ticket',async()=>{
    const f=fixture()
    const a=await issueReferenceTicket(f.db,owner,input)
    const b=await issueReferenceTicket(f.db,owner,input)
    expect(a).toEqual(b)
    expect(a.path).toBe(stagingPath(projectId,conversationId,a.ticketId,'image/jpeg'))
    expect(a.bucket).toBe(STAGING_BUCKET)
    expect(a.token).toBe('mock-signed-upload')
    expect(a).not.toHaveProperty('serviceRoleKey')
    expect(f.rows).toHaveLength(1)
    expect(f.signed).toBe(2)
  })
  it('cannot cross project boundaries, revoked conversations, archive or pause',async()=>{
    let f=fixture()
    await expect(issueReferenceTicket(f.db,{...owner,allowedProjectIds:[]},input))
      .rejects.toMatchObject({code:'NOT_FOUND'})
    expect(f.rows).toHaveLength(0);expect(f.signed).toBe(0)
    f=fixture();f.revokeProject()
    await expect(issueReferenceTicket(f.db,owner,input)).rejects.toMatchObject({code:'NOT_FOUND'})
    f=fixture();f.revokeConversation()
    await expect(issueReferenceTicket(f.db,owner,input)).rejects.toMatchObject({code:'NOT_FOUND'})
    f=fixture();f.archive()
    await expect(issueReferenceTicket(f.db,owner,input)).rejects.toMatchObject({code:'NOT_FOUND'})
    f=fixture();f.pause()
    await expect(issueReferenceTicket(f.db,owner,input)).rejects.toMatchObject({code:'NOT_FOUND'})
  })
  it('enforces four stable slots per draft and refuses key reuse for a different MIME',async()=>{
    const f=fixture()
    for(let slot=0;slot<4;slot++)await issueReferenceTicket(f.db,owner,{...input,slot})
    expect(f.rows).toHaveLength(4)
    await expect(issueReferenceTicket(f.db,owner,{...input,mimeType:'image/png'}))
      .rejects.toMatchObject({code:'CONFLICT'})
    expect(f.rows).toHaveLength(4)
  })
  it('refuses to reissue an expired or completed upload token',async()=>{
    const f=fixture()
    await issueReferenceTicket(f.db,owner,input)
    f.rows[0].expires_at=new Date(2000,0,1).toISOString()
    await expect(issueReferenceTicket(f.db,owner,input)).rejects.toMatchObject({code:'CONFLICT'})
    f.rows[0].expires_at=new Date(Date.now()+60_000).toISOString()
    f.rows[0].state='ready'
    await expect(issueReferenceTicket(f.db,owner,input)).rejects.toMatchObject({code:'CONFLICT'})
  })
})
