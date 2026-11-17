import {handleCloudBudgetRequest} from '@/lib/local-text/budget-api'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return handleCloudBudgetRequest(request,(await params).id)}
