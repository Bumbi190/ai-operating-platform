import {NextResponse} from 'next/server'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {inspectDailyPilotScript} from '@/lib/media/daily-pilot-readiness-reader'

export const dynamic='force-dynamic'
export const runtime='nodejs'

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'}

/**
 * Owner-only, read-only preparedness audit — NOT a video publishing route.
 * This intentionally reports blockers, not source media URLs or provider keys.
 */
export async function GET(request:Request):Promise<Response>{
  const access=await resolveProjectAccess()
  if(!access.ok){
    access.response.headers.set('cache-control','private, no-store')
    return access.response
  }
  try {
    const params=new URL(request.url).searchParams
    if([...params.keys()].sort().join(',')!=='projectId,scriptId'||
       params.getAll('projectId').length!==1||params.getAll('scriptId').length!==1)
      return NextResponse.json({error:'Bad query'},{status:400,headers})
    const projectId=params.get('projectId')!,scriptId=params.get('scriptId')!
    if(!UUID.test(projectId)||!UUID.test(scriptId))
      return NextResponse.json({error:'Bad query'},{status:400,headers})
    const status=await inspectDailyPilotScript(createAdminClient(),access,projectId,scriptId)
    return NextResponse.json(status,{headers})
  }catch(error){
    if(error instanceof Error&&error.message==='PILOT_NOT_FOUND')
      return NextResponse.json({error:'Not found'},{status:404,headers})
    return NextResponse.json({error:'Audit temporarily unavailable'},{status:503,headers})
  }
}
