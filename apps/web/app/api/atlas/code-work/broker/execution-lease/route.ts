import {handleExecutionLeaseRequest} from '@/lib/atlas/code-broker/execution-lease/handler'
export const runtime='nodejs'
export async function POST(request:Request){return handleExecutionLeaseRequest(request)}
