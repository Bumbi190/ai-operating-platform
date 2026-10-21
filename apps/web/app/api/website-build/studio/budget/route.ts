import {studioApi} from '@/lib/website-build/studio/api'
export async function POST(request:Request){return studioApi('budget',request)}
