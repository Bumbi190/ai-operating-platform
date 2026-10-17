import {handleOwnerAdmissionRequest} from '@/lib/local-text/admission-api'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function POST(request:Request,{params}:{params:{id:string}}){return handleOwnerAdmissionRequest(request,params.id)}
