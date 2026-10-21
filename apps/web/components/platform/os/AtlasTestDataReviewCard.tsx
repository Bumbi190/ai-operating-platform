'use client'
import {useEffect,useRef,useState} from 'react'
import {cleanupOutcome,decodeReviewView,type CleanupReviewView} from '@/lib/atlas/handlarborsen-test-data/stream-effect'
import styles from './AtlasTestDataReviewCard.module.css'
export function AtlasTestDataReviewCard({review,conversationId,onUpdate}:{review:CleanupReviewView;conversationId:string|null;onUpdate:(view:CleanupReviewView)=>void}){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[now,setNow]=useState(Date.now)
 const inFlight=useRef(false),current=useRef(conversationId);current.current=conversationId
 const callback=useRef(onUpdate);callback.current=onUpdate
 const p=review.packageView,expired=Date.parse(p.expiresAt)<=now,foreign=p.conversationId!==conversationId
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(t)},[])
 useEffect(()=>{
  if(p.conversationId!==conversationId)return
  let cancelled=false
  void fetch('/api/atlas/handlarborsen/test-data/'+p.packageId+'/review?conversationId='+p.conversationId,{cache:'no-store'}).then(async r=>{
   const view=decodeReviewView(await r.json())
   if(!cancelled&&r.ok&&view?.reviewRef===review.reviewRef&&view.packageView.packageId===p.packageId)callback.current(view)
  }).catch(()=>{})
  return ()=>{cancelled=true}
 },[p.packageId,p.conversationId,conversationId,review.reviewRef])
 const update=async(decision?:'approve'|'reject')=>{
  if(inFlight.current||foreign)return
  inFlight.current=true;setBusy(true);setNotice('')
  const bound=conversationId
  try{
   const url='/api/atlas/handlarborsen/test-data/'+p.packageId+'/review'
   const r=await fetch(decision?url:url+'?conversationId='+p.conversationId,{method:decision?'POST':'GET',headers:decision?{'content-type':'application/json'}:undefined,body:decision?JSON.stringify({conversationId:p.conversationId,reviewRef:review.reviewRef,decision}):undefined,cache:'no-store'})
   const raw=await r.json(),value=decodeReviewView(raw)
   if(current.current!==bound)return
   if(r.ok&&value&&value.reviewRef===review.reviewRef&&value.packageView.packageId===p.packageId)onUpdate(value)
   else setNotice(r.status===409?'Ny granskning behövs':r.status===401||r.status===403?'Logga in och granska paketet igen':'Utfallet kontrolleras – kontrollera kvittot igen')
  }catch{if(current.current===bound)setNotice('Utfallet kontrolleras – kontrollera kvittot igen')}
  finally{inFlight.current=false;setBusy(false)}
 }
 return <section className={styles.card} aria-label="Granska testdata" data-package={p.packageId}>
  <h3>{p.operation==='restore'?'Återställ verifierad testdata':'Lägg undan verifierad testdata'}</h3>
  <p>{p.organisationIds.length} organisation{p.organisationIds.length===1?'':'er'}. Paketet gäller exakt dessa ID:n och beroenden.</p>
  <details><summary>Visa urval och omfattning</summary><ul>{p.organisationIds.map(id=><li key={id}>{id}</li>)}</ul><dl>{Object.entries(p.counts).map(([kind,count])=><div key={kind}><dt>{kind}</dt><dd>{count}</dd></div>)}</dl><p>Giltigt till {new Date(p.expiresAt).toLocaleTimeString('sv-SE')}. Paket {p.packageId}</p></details>
  <p role="status">{cleanupOutcome(review)}</p>
  {notice&&<p role="alert">{notice}</p>}
  {review.decisionState==='pending'&&<div className={styles.actions}><button disabled={busy||expired||foreign} onClick={()=>void update('approve')}>{p.operation==='restore'?'Godkänn och återställ testdata':'Godkänn och lägg undan testdata'}</button><button disabled={busy||expired||foreign} onClick={()=>void update('reject')}>Avböj</button></div>}
  {review.decisionState==='approved'&&!review.receipt&&!review.rejectionStatus&&<div className={styles.actions}><button disabled={busy||foreign} onClick={()=>void update()}>Kontrollera kvittot</button><button disabled={busy||expired||foreign} onClick={()=>void update('approve')}>Fortsätt godkänd körning</button></div>}
 </section>
}
