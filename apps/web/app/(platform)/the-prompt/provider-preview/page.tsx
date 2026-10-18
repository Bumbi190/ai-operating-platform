import {notFound} from 'next/navigation'
import {resolveProjectAccess,assertProjectAllowed} from '@/lib/auth/project-access'
import {PREVIEW_PROJECT_ID} from '@/lib/media/provider-preview'
import {ProviderPreviewPanel} from './preview-panel'
export const dynamic='force-dynamic'
export default async function Page(){
 if(process.env.VERCEL_ENV!=='preview')notFound()
 const access=await resolveProjectAccess()
 if(!access.ok||!assertProjectAllowed(PREVIEW_PROJECT_ID,access.allowedProjectIds))notFound()
 return <ProviderPreviewPanel/>
}
