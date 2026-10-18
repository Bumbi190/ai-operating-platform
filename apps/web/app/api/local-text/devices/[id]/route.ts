import {handleOwnerDeviceRequest} from '@/lib/local-text/owner-api'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const GET=(request:Request,{params}:{params:{id:string}})=>handleOwnerDeviceRequest(request,params.id)
export const PATCH=(request:Request,{params}:{params:{id:string}})=>handleOwnerDeviceRequest(request,params.id)
