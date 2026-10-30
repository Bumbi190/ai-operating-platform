import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {buildErrorResponse,readWebsiteBuildBody} from '@/lib/website-build/api'
import {WebsiteBuildError} from '@/lib/website-build/store'
import {parseAnalysisAction,parseAnalysisSource,isUuid} from '@/lib/website-build/reference-analysis/contract'
import {executeAnalysisAction,listAnalysisSources,readAnalysisJob} from '@/lib/website-build/reference-analysis/service'
export const dynamic='force-dynamic'
export const runtime='nodejs'
export const maxDuration=60
const headers={'cache-control':'private, no-store'}
export async function POST(request:Request){
 const owner=await resolveProjectAccess()
 if(!owner.ok){owner.response.headers.set('cache-control',headers['cache-control']);return owner.response}
 const denied=assertSameOrigin(request)
 if(denied){denied.headers.set('cache-control',headers['cache-control']);return denied}
 try{
  let input
  try{input=parseAnalysisAction(await readWebsiteBuildBody(request))}catch{throw new WebsiteBuildError('INVALID_BODY',400)}
  return Response.json(await executeAnalysisAction(createAdminClient(),owner,input,request.signal),{headers})
 }catch(error){return buildErrorResponse(error)}
}
export async function GET(request:Request){
 const owner=await resolveProjectAccess()
 if(!owner.ok){owner.response.headers.set('cache-control',headers['cache-control']);return owner.response}
 try{
  const q=new URL(request.url).searchParams,keys=[...q.keys()].sort().join(',')
  if((keys!=='conversationId,projectId'&&keys!=='conversationId,messageId,projectId')||
   [...q.keys()].some(k=>q.getAll(k).length!==1)||!isUuid(q.get('projectId'))||!isUuid(q.get('conversationId')))throw new WebsiteBuildError('INVALID_BODY',400)
  const scope={projectId:q.get('projectId')!,conversationId:q.get('conversationId')!}
  const db=createAdminClient()
  if(!q.has('messageId'))return Response.json(await listAnalysisSources(db,owner,scope),{headers})
  let source
  try{source=parseAnalysisSource({...scope,messageId:q.get('messageId')})}catch{throw new WebsiteBuildError('INVALID_BODY',400)}
  return Response.json(await readAnalysisJob(db,owner,source),{headers})
 }catch(error){return buildErrorResponse(error)}
}
