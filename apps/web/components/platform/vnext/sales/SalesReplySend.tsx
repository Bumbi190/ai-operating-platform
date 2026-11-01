'use client'
import {useEffect,useRef,useState} from 'react'
import type {SendJobSummary} from '@/lib/sales/sending/types'
import styles from './SalesWorkspace.module.css'
type Preview={revisionId:string;revisionHash:string;mailboxGeneration:number;canConfirm:boolean;blockedReason:string|null;job:SendJobSummary|null}
const labels={queued:'Köat för sändning',claimed:'Förbereder sändning',dispatching:'Sändning pågår',smtp_accepted:'Accepterat av Strato',failed_before_send:'Misslyckat före sändning',delivery_unknown:'Leverans osäker — skicka inte igen',cancelled:'Sändning avbruten'}
export function SalesReplySend({projectId,revisionId,revisionHash,sourceCurrent}:{projectId:string;revisionId:string;revisionHash:string;sourceCurrent:boolean}){
 const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const locked=useRef(false),requestKey=useRef<string|null>(null)
 async function load(signal?:AbortSignal){
  const r=await fetch('/api/sales/sending?projectId='+projectId+'&revisionId='+revisionId,{cache:'no-store',signal})
  if(!r.ok)throw Error('Sändstatus kunde inte hämtas. Uppdatera innan du fortsätter.')
  const value:Preview=await r.json()
  if(value.revisionId!==revisionId||value.revisionHash!==revisionHash)throw Error('Mejlversionen har ändrats. Granska den senaste texten.')
  if(!signal?.aborted)setPreview(value)
 }
 useEffect(()=>{
  const c=new AbortController();setPreview(null);setError('');requestKey.current=null
  const update=()=>void load(c.signal).catch(e=>{if(!c.signal.aborted){setPreview(null);setError(e.message)}})
  update();const timer=setInterval(update,15000)
  return()=>{c.abort();clearInterval(timer)}
 },[projectId,revisionId,revisionHash])
 async function act(operation:'confirm'|'cancel'){
  if(locked.current||!preview)return
  locked.current=true;setBusy(true);setError('')
  try{
   if(operation==='confirm'&&(!sourceCurrent||!preview.canConfirm||preview.job))return
   requestKey.current??=crypto.randomUUID()
   const input=operation==='confirm'?{revisionId,expectedRevisionHash:revisionHash,expectedMailboxGeneration:preview.mailboxGeneration,idempotencyKey:requestKey.current}:{sendJobId:preview.job?.id,expectedRevisionHash:revisionHash}
   const r=await fetch('/api/sales/sending',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,projectId,...input})})
   if(!r.ok)throw Error('Sändningen kunde inte bekräftas. Uppdatera statusen och kontrollera det aktuella underlaget.')
   const job:SendJobSummary=await r.json()
   setPreview({...preview,canConfirm:false,job});await load()
  }catch(e){setError(e instanceof Error?e.message:'Sändstatus kunde inte bekräftas.')}
  finally{locked.current=false;setBusy(false)}
 }
 const job=preview?.job
 return <div className={styles.panel} aria-label="Sändning av godkänt svar">
  <h4>Sändning av detta testmejl</h4>
  {error&&<p role="status">{error}</p>}
  {job?<><p role="status">{labels[job.status]}</p>{job.status==='smtp_accepted'&&<p>Strato har accepterat mejlet. Mottagning i inkorgen är inte bekräftad.</p>}{job.status==='delivery_unknown'&&<p>Mejlet kan ha accepterats. Kontrollera kvittot och mottagarens inkorg innan någon ny sändning övervägs.</p>}{['queued','claimed'].includes(job.status)&&<button disabled={busy} onClick={()=>void act('cancel')}>Avbryt sändningen</button>}</>:preview?<><p>Textgodkännandet skickar inget mejl. Knappen nedan ger ett separat tillstånd att skicka exakt den visade versionen till den visade testadressen.</p><button disabled={busy||!sourceCurrent||!preview.canConfirm} onClick={()=>void act('confirm')}>Godkänn och skicka detta testmejl</button>{(!preview.canConfirm||!sourceCurrent)&&<p>Testsändning är inte tillgänglig. Kontrollera aktuell mejlversion, anslutning och projektets sändningsinställning.</p>}</>:<p>Sändstatus kontrolleras.</p>}
  <button disabled={busy} onClick={()=>void load().catch(e=>{setPreview(null);setError(e.message)})}>Uppdatera sändstatus</button>
 </div>
}
