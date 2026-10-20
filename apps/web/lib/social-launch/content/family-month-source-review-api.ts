import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {createAdminClient} from '@/lib/supabase/admin'
import {
 FamilySourceStoreError,listFamilyMonthSourceReviews,
 proposeFamilyMonthSource,decideFamilyMonthSource,
} from './family-month-source-store'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import type {FamilyMonthSourceProposal} from './family-month-source-review'

const headers={
 'cache-control':'private, no-store',
 'x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',
}
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers})
const err=(code:'INVALID_INPUT'|'NOT_FOUND'|'REVIEW_REQUIRED'|'CONFLICT'|'UNAVAILABLE',status:number)=>
 json({code},status)
function exact(value:unknown,names:string[]):value is Record<string,unknown>{
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join('|')===names.sort().join('|')
}
async function boundedJson(request:Request):Promise<unknown>{
 if(Number(request.headers.get('content-length'))>65536)
  throw new FamilySourceStoreError('INVALID_INPUT')
 const reader=request.body?.getReader()
 if(!reader)throw new FamilySourceStoreError('INVALID_INPUT')
 const chunks:Uint8Array[]=[]
 let total=0
 try{
  while(true){
   const {value,done}=await reader.read()
   if(done)break
   total+=value.byteLength
   if(total>65536){
    await reader.cancel()
    throw new FamilySourceStoreError('INVALID_INPUT')
   }
   chunks.push(value)
  }
 }finally{reader.releaseLock()}
 const payload=new Uint8Array(total)
 let i=0
 for(const chunk of chunks){payload.set(chunk,i);i+=chunk.byteLength}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload))}
 catch{throw new FamilySourceStoreError('INVALID_INPUT')}
}

/**
 * Owner-only pending source proposals / exact SHA decisions.
 * No source activation or publication code is reachable from this route.
 * OFF until reviewed migration is applied and explicit private flag enabled.
 */
export async function familyMonthSourceReviewApi(request:Request):Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok){
  for(const [k,v] of Object.entries(headers))access.response.headers.set(k,v)
  return access.response
 }
 if(!access.allowedProjectIds.includes(FAMILY_WEEKLY_PROJECT_ID))
  return err('NOT_FOUND',404)
 if(!['GET','POST'].includes(request.method))return err('INVALID_INPUT',405)
 if(request.method==='POST'){
  const denied=assertSameOrigin(request)
  if(denied){
   for(const [k,v] of Object.entries(headers))denied.headers.set(k,v)
   return denied
  }
 }
 if(process.env.FAMILY_MONTH_SOURCE_REVIEW_ENABLED!=='true')
  return err('UNAVAILABLE',503)
 try{
  const db=createAdminClient()
  if(request.method==='GET'){
   const search=new URL(request.url).searchParams
   if([...search.keys()].some(k=>!['month','candidateId'].includes(k))||
      search.getAll('month').length!==1||
      search.getAll('candidateId').length>1)
    throw new FamilySourceStoreError('INVALID_INPUT')
   const month=search.get('month')!
   const candidateId=search.get('candidateId')??undefined
   return json(await listFamilyMonthSourceReviews(db,access,{month,candidateId}))
  }
  const input=await boundedJson(request)
  if(!input||typeof input!=='object'||Array.isArray(input)||
    !['propose','decide'].includes((input as Record<string,unknown>).operation as string))
   throw new FamilySourceStoreError('INVALID_INPUT')
  const operation=(input as {operation:string}).operation
  if(operation==='propose'){
   if(!exact(input,['operation','proposal']))
    throw new FamilySourceStoreError('INVALID_INPUT')
   const proposal=input.proposal as FamilyMonthSourceProposal
   return json(await proposeFamilyMonthSource(db,access,proposal),201)
  }
  if(!exact(input,['operation','month','candidateId','candidateSha256','decision','confirmed']))
   throw new FamilySourceStoreError('INVALID_INPUT')
  return json(await decideFamilyMonthSource(db,access,{
   month:input.month as string,candidateId:input.candidateId as string,
   candidateSha256:input.candidateSha256 as string,
   decision:input.decision as 'approve'|'reject',confirmed:input.confirmed as true,
  }))
 }catch(error){
  if(error instanceof FamilySourceStoreError)return err(error.code,error.status)
  // Owner input errors must never echo supplied text, DB details, or hashes.
  return err('UNAVAILABLE',503)
 }
}
