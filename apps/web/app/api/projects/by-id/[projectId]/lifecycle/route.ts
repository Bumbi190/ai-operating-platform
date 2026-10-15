import {lifecycleApi} from '@/lib/project/lifecycle/api'
type Context={params:Promise<{projectId:string}>}
export async function GET(request:Request,context:Context){return lifecycleApi('get',request,(await context.params).projectId)}
export async function POST(request:Request,context:Context){return lifecycleApi('change',request,(await context.params).projectId)}
