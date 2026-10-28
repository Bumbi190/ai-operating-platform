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
const statuses=['not_configured','active','revoked','expired','unavailable'] as const
function verifiedOwnerView(value:unknown):value is View{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Partial<View>
 if(v.reviewNotices!==undefined&&(
  !Array.isArray(v.reviewNotices)||v.reviewNotices.length>5||
  v.reviewNotices.some(n=>!n||typeof n.preparationId!=='string'||
   !/^[a-f0-9-]{36}$/i.test(n.preparationId)||
   typeof n.weekStart!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(n.weekStart)||
   (n.draftCount!==2&&n.draftCount!==4)||
   typeof n.workspaceUrl!=='string')
 ))return false
 return typeof v.available==='boolean'&&typeof v.enabled==='boolean'&&
  typeof v.runtimeEnabled==='boolean'&&v.canSchedule===false&&
  v.canPublish===false&&statuses.some(s=>s===v.status)&&
  (!v.enabled||(v.status==='active'&&v.available===true&&
   typeof v.validUntil==='string'&&Number.isFinite(Date.parse(v.validUntil))))&&
  (v.status!=='active'||v.enabled===true)
}
async function loadSavedOwnerView(signal?:AbortSignal):Promise<View>{
 const response=await fetch('/api/social-weekly-automation',{
  signal,cache:'no-store',credentials:'same-origin',
 })
 if(!response.ok)throw Error('ENROLLMENT_READ_UNAVAILABLE')
 const value:unknown=await response.json()
 if(!verifiedOwnerView(value))throw Error('ENROLLMENT_INVALID_RECEIPT')
 return value
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
 const [initialLoading,setInitialLoading]=useState(true)
 const [needsReconcile,setNeedsReconcile]=useState(false)
 const [approved,setApproved]=useState(false)
 const [error,setError]=useState('')
 const mounted=useRef(true)
 useEffect(()=>{
  mounted.current=true
  if(projectId!==FAMILY_WEEKLY_PROJECT_ID)return()=>{mounted.current=false}
  setView(null);setError('');setNeedsReconcile(false)
  setInitialLoading(true)
  const controller=new AbortController()
  void (async()=>{
   try{
    const value=await loadSavedOwnerView(controller.signal)
    if(mounted.current&&!controller.signal.aborted){
     setView(value);setError('');setNeedsReconcile(false)
    }
   }catch{
    if(mounted.current&&!controller.signal.aborted){
     setNeedsReconcile(true)
     setError('Kunde inte kontrollera Atlas veckoförberedelse. Läs sparad status igen.')
    }
   }finally{
    if(mounted.current&&!controller.signal.aborted)setInitialLoading(false)
   }
  })()
  return ()=>{mounted.current=false;controller.abort()}
 },[projectId])
 async function reconcile(){
  if(busy||projectId!==FAMILY_WEEKLY_PROJECT_ID)return
  setBusy(true)
  try{
   const latest=await loadSavedOwnerView()
   if(mounted.current){
    setView(latest);setNeedsReconcile(false);setError('');setApproved(false)
   }
  }catch{
   if(mounted.current){
    setNeedsReconcile(true)
    setError('Den sparade statusen kunde inte läsas. Försök kontrollera igen innan du ändrar något.')
   }
  }finally{if(mounted.current)setBusy(false)}
 }
 async function decide(operation:'enable'|'revoke'){
  // A scheduling-panel outage must NOT prevent a separately authorised revoke.
  if(busy||needsReconcile||projectId!==FAMILY_WEEKLY_PROJECT_ID||!view?.available||
    (operation==='enable'&&(disabled||!approved)))return
  setBusy(true);setError('')
  try{
   const body=operation==='enable'
    ? {projectId,operation,confirmed:true}
    : {projectId,operation}
   const response=await fetch('/api/social-weekly-automation',{
    method:'POST',headers:{'content-type':'application/json'},
    credentials:'same-origin',body:JSON.stringify(body),cache:'no-store',
   })
   const next:unknown=await response.json()
   if(!response.ok||!verifiedOwnerView(next)){
    throw Error('ENROLLMENT_CHANGE_RECEIPT_UNAVAILABLE')
   }
   if(mounted.current){setView(next);setApproved(false)}
  }catch{
   // A POST can commit before its HTTP receipt is lost. Never assert that no
   // write happened and NEVER retry an enable/revoke automatically.
   if(mounted.current){
    setNeedsReconcile(true);setApproved(false)
    setError('Ändringen kan redan ha sparats. Kontrollera sparad status innan du försöker igen.')
   }
  }finally{if(mounted.current)setBusy(false)}
 }
 if(projectId!==FAMILY_WEEKLY_PROJECT_ID)return null
 return <section className={styles.root} aria-label="Atlas automatiska veckoutkast">
  <h4>Atlas förbereder veckans inlägg</h4>
  <p>Från januari kan Atlas föreslå vanliga Facebook- och Instagram-inlägg på söndagar.
   Varje version ska granskas av dig. <strong>Inget schemaläggs eller publiceras av den här inställningen.</strong></p>
  {error&&<p role="alert">{error}</p>}
  {initialLoading&&<p role="status">Läser behörighet för veckoutkast…</p>}
  {needsReconcile&&<button type="button" onClick={()=>void reconcile()} disabled={busy}>
   Kontrollera sparad status
  </button>}
  {view&&!needsReconcile&&<div role="status">
   <p><strong>{label[view.status]}</strong></p>
   {!view.available&&<p>Funktionen är under säkerhetsgranskning och kan inte aktiveras ännu.</p>}
   {view.available&&view.reviewNoticesAvailable===false&&<p>Granskningsaviseringarna kunde inte läsas just nu.</p>}
   {view.available&&view.reviewNotices?.length? <div className={styles.notices}>
    <h5>Utkast som väntar på granskning</h5>
    <ul>{view.reviewNotices.map(n=><li key={n.preparationId}>
     Veckan {n.weekStart}: {n.draftCount} utkast. <a href="/projects/familje-stunden/social#content">Granska utkasten</a>
    </li>)}</ul>
   </div>:null}
   {view.available&&view.enabled&&<>
    <p>Gäller till {view.validUntil?new Intl.DateTimeFormat('sv-SE',{
      timeZone:'Europe/Stockholm',dateStyle:'medium',
    }).format(new Date(view.validUntil)):'okänt datum'}.</p>
    {!view.runtimeEnabled&&<p>Automatiska körningar är ännu inte påslagna av systemet.</p>}
    <button type="button" onClick={()=>void decide('revoke')} disabled={busy}>
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
