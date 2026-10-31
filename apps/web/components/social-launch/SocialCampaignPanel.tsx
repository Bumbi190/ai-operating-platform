'use client'
import React,{useCallback,useEffect,useState} from 'react'
import Link from 'next/link'
import type {CampaignView,CampaignItemState} from '@/lib/social-launch/campaign/types'
import styles from './SocialCampaignPanel.module.css'
const states:Record<CampaignItemState,string>={queued:'Väntar på bild',generating:'Bilden skapas',asset_admitted:'Bilden sparad, utkast förbereds',review_ready:'Text och bild klara för granskning',blocked:'Arbetet stoppat',uncertain:'Utfallet behöver kontrolleras',cancelled:'Avbrutet'}
export function SocialCampaignPanel({initial,projectName}:{initial:CampaignView;projectName:string}){
 const [view,setView]=useState(initial),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const active=view.items.some(i=>['queued','generating','asset_admitted'].includes(i.state))&&view.status!=='cancelled'
 const refresh=useCallback(async(signal?:AbortSignal,cancel=false)=>{
  const query=new URLSearchParams({projectId:initial.projectId,campaignId:initial.id})
  const response=await fetch('/api/social-campaign'+(cancel?'':'?'+query),{method:cancel?'POST':'GET',cache:'no-store',signal,...(cancel?{headers:{'content-type':'application/json'},body:JSON.stringify({projectId:initial.projectId,campaignId:initial.id})}:{})})
  if(!response.ok)throw Error('Statusen kunde inte läsas. Försök igen.')
  const next=await response.json() as CampaignView
  if(next.id!==initial.id||next.projectId!==initial.projectId)throw Error('Projektet kunde inte verifieras.')
  setView(next);setError('')
 },[initial.id,initial.projectId])
 useEffect(()=>{
  if(!active)return
  const controller=new AbortController()
  const timer=setInterval(()=>{void refresh(controller.signal).catch(()=>{if(!controller.signal.aborted)setError('Statusen kunde inte uppdateras. Senast lästa läge visas.')})},5000)
  return()=>{clearInterval(timer);controller.abort()}
 },[active,refresh])
 async function cancel(){setBusy(true);try{await refresh(undefined,true)}catch(e){setError(e instanceof Error?e.message:'Arbetet kunde inte avbrytas.')}finally{setBusy(false)}}
 return <main className={styles.page}>
  <Link href={view.contentUrl}>← Sociala medier</Link>
  <header><p className={styles.eyebrow}>{projectName} · LinkedIn</p><h1>Inlägg för granskning</h1><p>Följ arbetet med text och bild. Önskade tider visas i Stockholmstid. Granska varje sparat utkast innan separat publicering.</p></header>
  <div className={styles.actions}><button onClick={()=>void refresh().catch(()=>setError('Statusen kunde inte uppdateras.'))} disabled={busy}>Uppdatera status</button>{active&&<button onClick={()=>void cancel()} disabled={busy}>Avbryt återstående arbete</button>}</div>
  {error&&<p role="alert">{error}</p>}
  {view.status==='cancelled'&&<p role="status">Återstående arbete är avbrutet. Redan skapade bilder och utkast finns kvar.</p>}
  <div className={styles.grid}>{view.items.map(item=><article key={item.id} className={styles.card}>
   <p className={styles.time}>{item.draft.localMinute.replace('T',' ')} · Stockholm</p>
   <h2>{item.draft.title}</h2><p role="status" className={styles.status}>{states[item.state]}</p>
   <p className={styles.copy}>{item.draft.text}</p>
   {item.state==='review_ready'&&item.revisionId?<Link href={view.contentUrl.replace('#content','')+'?post='+item.postId+'#content'}>Granska sparad text och bild →</Link>:item.state==='uncertain'?<p>En bild kan redan ha skapats. Ingen ny beställning görs automatiskt.</p>:item.state==='blocked'?<p>Kontrollera projektets aktuella plan, underlag och aktivering innan nytt arbete.</p>:null}
  </article>)}</div>
 </main>
}
