import {handleOwnerDeviceRequest} from '@/lib/local-text/owner-api'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const GET=(request:Request)=>handleOwnerDeviceRequest(request)
export const POST=(request:Request)=>handleOwnerDeviceRequest(request)
