import {NextResponse} from 'next/server'
import {resolveProjectAccess,assertProjectAllowed} from '@/lib/auth/project-access'
import {PREVIEW_PROJECT_ID,ProviderPreviewError} from '@/lib/media/provider-preview'
import {createRuntimeProviderPreview} from '@/lib/media/provider-preview-runtime'
export const dynamic='force-dynamic'
export const runtime='nodejs'
export const maxDuration=60
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'}
async function service(){
 if(process.env.VERCEL_ENV!=='preview')return NextResponse.json({error:'Not found'},{status:404,headers})
 const access=await resolveProjectAccess()
 if(!access.ok){access.response.headers.set('cache-control','private, no-store');return access.response}
 if(!assertProjectAllowed(PREVIEW_PROJECT_ID,access.allowedProjectIds))
  return NextResponse.json({error:'Not found'},{status:404,headers})
 return createRuntimeProviderPreview(access)
}
function failure(e:unknown){
 if(e instanceof ProviderPreviewError)return NextResponse.json({error:e.code},{status:e.status,headers})
 return NextResponse.json({error:'PREVIEW_UNAVAILABLE'},{status:503,headers})
}
export async function GET(){
 try{
  const s=await service()
  if(s instanceof Response)return s
  return NextResponse.json(await s.inspect(),{headers})
 }catch(e){return failure(e)}
}
export async function POST(request:Request){
 try{
  const s=await service()
  if(s instanceof Response)return s
  if(request.headers.get('origin')!==new URL(request.url).origin)
   return NextResponse.json({error:'Bad origin'},{status:403,headers})
  if(!request.headers.get('content-type')?.startsWith('application/json'))
   return NextResponse.json({error:'Bad request'},{status:400,headers})
  const text=await request.text()
  if(text.length>1024)return NextResponse.json({error:'Bad request'},{status:400,headers})
  let body:Record<string,unknown>
  try{body=JSON.parse(text)}catch{return NextResponse.json({error:'Bad request'},{status:400,headers})}
  if(!body||Array.isArray(body)||Object.keys(body).sort().join(',')!=='maximumSek,quoteHash'||
     typeof body.quoteHash!=='string'||!/^([a-f0-9]{64})$/.test(body.quoteHash)||body.maximumSek!==12)
   return NextResponse.json({error:'Bad request'},{status:400,headers})
  return NextResponse.json(await s.generate({quoteHash:body.quoteHash,maximumSek:body.maximumSek}),{headers})
 }catch(e){return failure(e)}
}
