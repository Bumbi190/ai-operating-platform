import {redirect,notFound} from 'next/navigation'
import {WebsiteBuildError} from '@/lib/website-build/store'
import type {StudioView} from '@/lib/website-build/studio/types'
import {loadStudioView} from '@/lib/website-build/studio/loader'
import {studioSelection} from '@/lib/website-build/studio/api'
import {studioPageQuery} from '@/lib/website-build/studio/page-query'
import {AtlasBuilderStudio} from '@/components/website-build/AtlasBuilderStudio'
import {prospectsEnabled} from '@/lib/website-build/prospects/api'
export const dynamic='force-dynamic'
export default async function BuilderStudioPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=studioPageQuery(await searchParams)
 let model:StudioView|null
 try{const {selection,include}=studioSelection(query);model=await loadStudioView(selection,include)}catch(error){if(error instanceof WebsiteBuildError&&error.status===404)notFound();return <p role="alert">Byggstudion kunde inte läsas. <a href="/build">Öppna studion igen</a>.</p>}
 if(!model)redirect('/login')
 return <>{prospectsEnabled()&&<nav aria-label="Prospektgranskning" className="px-6 py-3 text-sm"><a href={'/build/prospects'+(model.selected?'?projectId='+model.selected.id:'')}>Öppna WebBuilder-prospekt →</a></nav>}<AtlasBuilderStudio key={[model.operatorId,model.selected?.id,model.conversation?.id].join(':')} model={model}/></>
}
