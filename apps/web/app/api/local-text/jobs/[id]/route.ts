import {NextResponse} from 'next/server'
import {createClient} from '@/lib/supabase/server'
import {createAdminClient} from '@/lib/supabase/admin'
import {getAllowedProjectIds} from '@/lib/atlas/isolation'
import {isUuid} from '@omnira/local-text-contract'
import {readReceipt,readLocalTextCost} from '@/lib/local-text/store'
import {projectLocalTextReceipt} from '@/lib/local-text/receipt'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store'}})
export async function GET(request:Request,{params}:{params:{id:string}}){
 const url=new URL(request.url),conversationId=url.searchParams.get('conversationId'),projectId=url.searchParams.get('projectId')
 if(!isUuid(params.id)||!isUuid(conversationId)||!isUuid(projectId))return json({error:'INVALID_REQUEST'},400)
 try{
  const session=await createClient(),{data:{user},error}=await session.auth.getUser()
  if(error||!user)return json({error:'UNAUTHENTICATED'},401)
  const db=createAdminClient(),allowed=await getAllowedProjectIds(db,user.id)
  if(!allowed.includes(projectId))return json({error:'NOT_FOUND'},404)
  const receipt=await readReceipt(db,user.id,params.id)
  if(!receipt||receipt.conversationId!==conversationId||receipt.projectId!==projectId)return json({error:'NOT_FOUND'},404)
  const cost=await readLocalTextCost(db,user.id,params.id)
  return json({...projectLocalTextReceipt(receipt),cost})
 }catch{return json({error:'LOCAL_TEXT_UNAVAILABLE'},503)}
}
