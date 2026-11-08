'use client'
import {useEffect,useRef,useState} from 'react'
import type {PlanView} from '@/lib/website-build/planning/types'
export function StudioCinematicImport({projectId,conversationId,plan,onSaved}:{projectId:string;conversationId:string;plan:PlanView|null;onSaved:()=>void}){
 const [sha,setSha]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const intent=useRef<{revision:string|null;sha:string;key:string}|null>(null)
 useEffect(()=>{let active=true;void fetch('/api/website-build/studio/cinematic-plan',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(v=>{if(active)setSha(v.binding.sha256)}).catch(()=>{if(active)setError('Visningspaketet kunde inte läsas. Öppna inställningarna igen.')});return()=>{active=false}},[])
 async function save(){
  if(busy||!sha)return
  setBusy(true);setError('')
  const revision=plan?.currentRevision.revisionId??null
  if(!intent.current||intent.current.revision!==revision||intent.current.sha!==sha)intent.current={revision,sha,key:crypto.randomUUID()}
  try{
   const r=await fetch('/api/website-build/studio/cinematic-plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId,conversationId,planId:plan?.ref.planId,expectedRevisionId:revision,expectedPackageSha:sha,idempotencyKey:intent.current.key})}),v=await r.json().catch(()=>null)
   if(!r.ok)throw Error(r.status===409?'Planen eller paketet har ändrats. Uppdatera projektet innan du försöker igen.':v?.error??'Planen kunde inte sparas.')
   onSaved()
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section aria-label="Granskad konceptvisning"><h3>Demo Motors-visningen</h3><p>Spara den granskade bilhallen med sju bilar, film och 3D som en ny planversion. Därefter granskar och godkänner du paketet i Studio.</p><button type="button" disabled={busy||!sha} onClick={()=>void save()}>{busy?'Sparar plan…':'Använd den granskade visningen'}</button>{error&&<p role="alert">{error}</p>}</section>
}
