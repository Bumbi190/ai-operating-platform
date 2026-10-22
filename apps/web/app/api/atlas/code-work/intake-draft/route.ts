/** Authenticated planning-only draft route. Never creates or approves code work. */
import {handleCodeWorkIntakeDraft} from '@/lib/atlas/code-work/intake/preview-http'

export const dynamic='force-dynamic'

export async function POST(request:Request){
 return handleCodeWorkIntakeDraft(request)
}
