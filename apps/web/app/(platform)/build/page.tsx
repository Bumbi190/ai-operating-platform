import {redirect,notFound} from 'next/navigation'
import {WebsiteBuildError} from '@/lib/website-build/store'
import type {StudioView} from '@/lib/website-build/studio/types'
import {loadStudioView} from '@/lib/website-build/studio/loader'
import {studioSelection} from '@/lib/website-build/studio/api'
import {AtlasBuilderStudio} from '@/components/website-build/AtlasBuilderStudio'
export const dynamic='force-dynamic'
export default async function BuilderStudioPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const input=await searchParams,query=new URLSearchParams()
 for(const [key,value]of Object.entries(input))if(Array.isArray(value)){for(const item of value)query.append(key,item)}else if(value!==undefined)query.set(key,value)
 let model:StudioView|null
 try{const {selection,include}=studioSelection(query);model=await loadStudioView(selection,include)}catch(error){if(error instanceof WebsiteBuildError&&error.status===404)notFound();return <p role="alert">Byggstudion kunde inte läsas. <a href="/build">Öppna studion igen</a>.</p>}
 if(!model)redirect('/login')
 return <AtlasBuilderStudio key={[model.operatorId,model.selected?.id,model.conversation?.id].join(':')} model={model}/>
}
