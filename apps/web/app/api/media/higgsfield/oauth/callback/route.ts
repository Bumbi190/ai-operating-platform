import {NextResponse} from 'next/server'
import {authorize,callbackUri,refusal} from '@/lib/media/higgsfield/http'
import {createHiggsfieldOAuthService} from '@/lib/media/higgsfield/oauth'
export const dynamic='force-dynamic'
export const maxDuration=30
export async function GET(request:Request) {
 const access=await authorize();if(!access.ok)return access.response
 try {
  const q=new URL(request.url).searchParams
  if(['state','code','error','iss'].some(k=>q.getAll(k).length>1))return refusal(new Error())
  const r=await createHiggsfieldOAuthService(undefined,undefined,async id=>access.allows(id)).finish({state:q.get('state')??'',actorId:access.actorId,code:q.get('code')??undefined,error:q.get('error')??undefined,issuer:q.get('iss')??undefined})
  const target=new URL('/settings',callbackUri());target.searchParams.set('higgsfield',r.code)
  if(r.projectId)target.searchParams.set('project_id',r.projectId)
  const response=NextResponse.redirect(target,303)
  response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer')
  return response
 }catch(e){return refusal(e)}
}
