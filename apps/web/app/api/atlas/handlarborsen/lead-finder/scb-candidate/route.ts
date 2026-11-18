import { resolveProjectAccess } from '@/lib/auth/project-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { loadKnownContactsForOwner } from '@/lib/handlarborsen/lead-finder/known-contacts-server'
import { leadFinderScbCandidateApi, type LiveCandidateWriter, type LiveScbCandidateRow } from '@/lib/handlarborsen/lead-finder/scb-candidate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface LooseTable {
  select(fields:string):{
    eq(column:string,value:string):{
      eq(column:string,value:string):{
        maybeSingle():PromiseLike<{data:{id?:unknown}|null;error:unknown}>
      }
    }
  }
  insert(row:unknown):{
    select(fields:string):{
      single():PromiseLike<{data:{id?:unknown}|null;error:unknown}>
    }
  }
}
const writer=():LiveCandidateWriter=>{
  const table=()=>(createAdminClient() as unknown as {from(t:'hb_lead_candidates'):LooseTable}).from('hb_lead_candidates')
  return {
    async find(projectId,orgnr){
      const {data,error}=await table().select('id').eq('project_id',projectId).eq('orgnr',orgnr).maybeSingle()
      return {id:!error&&data&&typeof data.id==='string'?data.id:null,failed:!!error}
    },
    async insert(row:LiveScbCandidateRow){
      const {data,error}=await table().insert(row).select('id').single()
      return {id:!error&&data&&typeof data.id==='string'?data.id:null,failed:!!error}
    },
  }
}

export async function POST(request:Request){
  return leadFinderScbCandidateApi(request,{
    env:process.env,
    resolveAccess:async()=>{
      const access=await resolveProjectAccess()
      if(!access.ok)return {ok:false,status:access.response.status===401?401:403}
      return {ok:true,userId:access.userId,allowedProjectIds:access.allowedProjectIds}
    },
    loadKnownContacts:()=>loadKnownContactsForOwner(HANDLARBORSEN_PROJECT_ID),
    getWriter:writer,
  })
}
