import {studioApi} from '@/lib/website-build/studio/api'
export const dynamic='force-dynamic'
export const GET=(request:Request)=>studioApi('costs',request)
export const POST=(request:Request)=>studioApi('stop',request)
