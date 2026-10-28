'use client'

import {useEffect,useRef,useState} from 'react'
import {FAMILY_WEEKLY_PROJECT_ID} from '@/lib/social-launch/weekly/auto-preparation'
import styles from './SocialWeeklyAutomationControls.module.css'

type View={
 available:boolean;runtimeEnabled:boolean;enabled:boolean
 status:'not_configured'|'active'|'revoked'|'expired'|'unavailable'
 validUntil?:string|null;canSchedule:false;canPublish:false
 reviewNoticesAvailable?:boolean
 reviewNotices?:Array<{preparationId:string;weekStart:string;draftCount:2|4;workspaceUrl:string}>
}
const label:Record<View['status'],string>={
 not_configured:'Inte aktiverad',active:'Du har godkänt veckoutkast',
 revoked:'Ditt tidigare godkännande är återkallat',
 expired:'Godkännandet har gått ut',unavailable:'Kunde inte kontrollera inställningen',
}

export function SocialWeeklyAutomationControls({projectId,disabled}:{
 projectId:string;disabled:boolean
}){
 const [view,setView]=useState<View|null>(null)
 const [busy,setBusy]=useState(false)
 const [approved,setApproved]=useState(false)
 const [error,setError]=useState('')
 const mounted=useRef(true)
 useEffect(()=>{
  mounted.current=true
  const controller=new AbortController()
  void (async()=>{
   try{
    const response=await fetch('/api/social-weekly-automation',{
     signal:controller.signal,cache:'no-store',
    })
    const value=await response.json()
    if(!response.ok)throw Error('ENROLLMENT_READ_UNAVAILABLE')
    if(mounted.current)setView(value as View)
   }catch{
    if(mounted.current&&!controller.signal.aborted)setError('Kunde inte kontrollera Atlas veckoförberedelse.')
   }
  })()
  return ()=>{mounted.current=false;controller.abort()}
 },[])
 async function decide(operation:'enable'|'revoke'){
  if(busy||disabled||projectId!==FAMILY_WEEKLY_PROJECT_ID||!view?.available||
    (operation==='enable'&&!approved))return
  setBusy(true);setError('')
  try{
   const body=operation==='enable'
    ? {projectId,operation,confirmed:true}
    : {projectId,operation}
   const response=await fetch('/api/social-weekly-automation',{
    method:'POST',headers:{'content-type':'application/json'},
    credentials:'same-origin',body:JSON.stringify(body),cache:'no-store',
   })
   const next=await response.json()
   if(!response.ok)throw Error('ENROLLMENT_CHANGE_UNAVAILABLE')
   if(mounted.current){setView(next as View);setApproved(false)}
  }catch{
   if(mounted.current)setError('Ändringen kunde inte sparas. Inga inställningar ändrades här.')
  }finally{if(mounted.current)setBusy(false)}
 }
 if(projectId!==FAMILY_WEEKLY_PROJECT_ID)return null
 return <section className={styles.root} aria-label="Atlas automatiska veckoutkast">
  <h4>Atlas förbereder veckans inlägg</h4>
  <p>Från januari kan Atlas föreslå vanliga Facebook- och Instagram-inlägg på söndagar.
   Varje version ska granskas av dig. <strong>Inget schemaläggs eller publiceras av den här inställningen.</strong></p>
  {error&&<p role="alert">{error}</p>}
  {!view&&<p role="status">Läser behörighet för veckoutkast…</p>}
  {view&&<div role="status">
   <p><strong>{label[view.status]}</strong></p>
   {!view.available&&<p>Funktionen är under säkerhetsgranskning och kan inte aktiveras ännu.</p>}
   {view.available&&view.reviewNoticesAvailable===false&&<p>Granskningsaviseringarna kunde inte läsas just nu.</p>}
   {view.reviewNotices?.length? <div className={styles.notices}>
    <h5>Utkast som väntar på granskning</h5>
    <ul>{view.reviewNotices.map(n=><li key={n.preparationId}>
     Veckan {n.weekStart}: {n.draftCount} utkast. <a href={n.workspaceUrl}>Granska utkasten</a>
    </li>)}</ul>
   </div>:null}
   {view.available&&view.enabled&&<>
    <p>Gäller till {view.validUntil?new Intl.DateTimeFormat('sv-SE',{
      timeZone:'Europe/Stockholm',dateStyle:'medium',
    }).format(new Date(view.validUntil)):'okänt datum'}.</p>
    {!view.runtimeEnabled&&<p>Automatiska körningar är ännu inte påslagna av systemet.</p>}
    <button type="button" onClick={()=>void decide('revoke')} disabled={busy||disabled}>
     Återkalla godkännande
    </button>
   </>}
   {view.available&&!view.enabled&&<>
    <label className={styles.check}>
     <input type="checkbox" checked={approved} disabled={busy||disabled}
      onChange={event=>setApproved(event.target.checked)}/>
     Jag godkänner att Atlas får förbereda högst ett omgångsförslag med textutkast per vecka
     inom Familje-Stundens vanliga AI-kostnadsspärrar. Godkännandet är tidsbegränsat och
     kan återkallas. Jag måste själv granska och godkänna varje vecka före publicering.
    </label>
    <button type="button" onClick={()=>void decide('enable')}
      disabled={busy||disabled||!approved}>Godkänn automatiska veckoutkast</button>
   </>}
  </div>}
 </section>
}
