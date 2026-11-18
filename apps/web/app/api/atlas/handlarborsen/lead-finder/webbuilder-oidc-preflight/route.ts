import {handleHarveyOidcPreflight} from '@/lib/handlarborsen/lead-finder/webbuilder-oidc-preflight'
export const dynamic='force-dynamic'
export const runtime='nodejs'
export const maxDuration=30
export async function POST(request:Request){
 return handleHarveyOidcPreflight(request)
}
