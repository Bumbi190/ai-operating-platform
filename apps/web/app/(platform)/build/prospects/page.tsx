import * as React from 'react'
import {notFound,redirect} from 'next/navigation'
import {ProspectBoard} from '@/components/website-build/ProspectBoard'
import {prospectsEnabled} from '@/lib/website-build/prospects/api'
import {loadStudioView} from '@/lib/website-build/studio/loader'
import {WebsiteBuildError} from '@/lib/website-build/store'
import type {StudioView} from '@/lib/website-build/studio/types'

export const dynamic='force-dynamic'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function WebBuilderProspectsPage({
  searchParams,
}:{
  searchParams:Promise<Record<string,string|string[]|undefined>>
}){
  if(!prospectsEnabled())notFound()

  const query=await searchParams
  if(Object.keys(query).some(key=>key!=='projectId'))notFound()
  const requestedId=query.projectId
  if(Array.isArray(requestedId))notFound()
  if(requestedId!==undefined&&(typeof requestedId!=='string'||!uuid.test(requestedId)))notFound()

  let model:StudioView|null
  try{model=await loadStudioView({},'active')}catch(error){
    if(error instanceof WebsiteBuildError&&error.status===404)notFound()
    return <main role="alert">Prospektgranskningen kunde inte läsas. <a href="/build">Öppna byggstudion igen</a>.</main>
  }
  if(!model)redirect('/login')

  // Studio enumerates only session-owned, active projects. Never trust URL IDs.
  const projects=model.projects.map(project=>({id:project.id,name:project.name}))
  if(requestedId!==undefined&&!projects.some(project=>project.id===requestedId))notFound()
  const initialProjectId=requestedId??projects[0]?.id
  if(!initialProjectId)return <main><h1>Inga aktiva projekt</h1><p>Öppna Web Studio för att välja eller skapa ett projekt.</p><a href="/build">Till Web Studio</a></main>

  return <ProspectBoard projects={projects} initialProjectId={initialProjectId}/>
}
