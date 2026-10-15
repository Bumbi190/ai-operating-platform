import {studioApi} from '@/lib/website-build/studio/api'
export const dynamic='force-dynamic'
export async function GET(request:Request){return studioApi('get',request)}
export async function POST(request:Request){return studioApi('ensure',request)}
