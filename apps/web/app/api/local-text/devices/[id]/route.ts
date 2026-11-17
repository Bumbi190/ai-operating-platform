import {handleOwnerDeviceRequest} from '@/lib/local-text/owner-api'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const GET=async (request:Request,{params}:{params:Promise<{id:string}>})=>handleOwnerDeviceRequest(request,(await params).id)
export const PATCH=async (request:Request,{params}:{params:Promise<{id:string}>})=>handleOwnerDeviceRequest(request,(await params).id)
