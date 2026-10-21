import {redirect,notFound} from 'next/navigation'
import {loadStudioView} from '@/lib/website-build/studio/loader'
import {WebsiteBuildError} from '@/lib/website-build/store'
export const dynamic='force-dynamic'
export default async function LegacyBuildEntry({params}:{params:{slug:string;sessionId:string}}){
 let model
 try{model=await loadStudioView({projectSlug:params.slug,sessionId:params.sessionId})}catch(error){
  if(error instanceof WebsiteBuildError&&error.status===404)notFound()
  return <p role="alert">Byggstudion kunde inte läsas. Försök igen.</p>
 }
 if(!model)redirect('/login')
 if(!model.selected)notFound()
 const query=new URLSearchParams({project:model.selected.slug})
 if(model.conversation)query.set('conversation',model.conversation.id)
 if(model.session)query.set('session',model.session.sessionId)
 redirect('/build?'+query)
}
