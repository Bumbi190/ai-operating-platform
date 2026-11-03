'use client'
import {useEffect,useRef,useState} from 'react'
import type {InitialSendPreview} from '@/lib/sales/initial-sending/types'
import type {SalesWorkspace,SalesDraftRevision} from '@/lib/sales/types'
import {getDraftReviewHistory} from '@/lib/sales/draft-history'
import {SalesDraftHistory} from './SalesDraftHistory'
import type {SendJobSummary} from '@/lib/sales/sending/types'
import styles from './SalesWorkspace.module.css'
const labels={queued:'Köat för sändning',claimed:'Förbereder sändning',dispatching:'Sändning pågår',smtp_accepted:'Accepterat av Strato',failed_before_send:'Misslyckat före sändning',delivery_unknown:'Leverans osäker — skicka inte igen',cancelled:'Sändning avbruten'}
export function SalesInitialSend({model,draft,onRefresh}:{model:SalesWorkspace;draft:SalesDraftRevision;onRefresh:()=>Promise<void>}){
 const projectId=model.projectId,revisionId=draft.id,revisionHash=draft.sha256
 const reviewed=getDraftReviewHistory(model,draft)
 const [preview,setPreview]=useState<InitialSendPreview|null>(null),[available,setAvailable]=useState<boolean|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState<string|null>(null)
 const evidenceCurrent=!!preview&&!!reviewed.history&&reviewed.history.id===preview.historyRevisionId&&reviewed.timing?.ruleRevisionId===preview.ruleRevisionId&&reviewed.timing.contactVersion===draft.contactVersion
 const sequence=useRef(0),locked=useRef(false),key=useRef<{identity:string;value:string}|null>(null)
 const identity=(p:InitialSendPreview)=>[projectId,p.revisionId,p.revisionHash,p.historyRevisionId,p.ruleRevisionId,p.policyVersion,p.mailboxGeneration].join(':')
 async function load(signal?:AbortSignal){
  const seq=++sequence.current
  try{
   const r=await fetch('/api/sales/initial-sending?projectId='+encodeURIComponent(projectId)+'&revisionId='+encodeURIComponent(revisionId),{cache:'no-store',signal})
   if(!r.ok)throw Error('Sändstatus kunde inte hämtas. Uppdatera innan du fortsätter.')
   const value:InitialSendPreview|{available:false}=await r.json()
   if(signal?.aborted||seq!==sequence.current)return
   if(!value.available){setAvailable(false);setPreview(null);setAccepted(null);return}
   if(value.revisionId!==revisionId||value.revisionHash!==revisionHash)throw Error('Mejlversionen har ändrats. Granska den senaste texten.')
   setAvailable(true);setPreview(value);setAccepted(old=>old===identity(value)?old:null);setError('')
  }catch(e){if(!signal?.aborted&&seq===sequence.current){setPreview(null);setAccepted(null);setError(e instanceof Error?e.message:'Sändstatus är inte tillgänglig.')}}
 }
 useEffect(()=>{
  const c=new AbortController();setPreview(null);setAvailable(null);setAccepted(null);setError('');key.current=null
  void load(c.signal);const timer=setInterval(()=>void load(c.signal),15000)
  return()=>{c.abort();clearInterval(timer);sequence.current++}
 },[projectId,revisionId,revisionHash])
 async function act(operation:'confirm'|'cancel'){
  if(locked.current||!preview)return
  const current=identity(preview)
  if(operation==='confirm'&&(!evidenceCurrent||!preview.canConfirm||preview.job||!preview.historyRevisionId||!preview.ruleRevisionId||!preview.mailboxGeneration||!preview.policyVersion||(preview.requiresHistoryGapAcceptance&&accepted!==current)))return
  locked.current=true;setBusy(true);setError('')
  try{
   if(key.current?.identity!==current)key.current={identity:current,value:crypto.randomUUID()}
   const input=operation==='confirm'?{revisionId,expectedRevisionHash:revisionHash,expectedMailboxGeneration:preview.mailboxGeneration,expectedHistoryRevisionId:preview.historyRevisionId,expectedRuleRevisionId:preview.ruleRevisionId,expectedPolicyVersion:preview.policyVersion,acceptHistoryGap:preview.requiresHistoryGapAcceptance&&accepted===current,idempotencyKey:key.current!.value}:{sendJobId:preview.job?.id,expectedRevisionHash:revisionHash}
   const r=await fetch('/api/sales/initial-sending',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,projectId,...input})})
   if(!r.ok)throw Error('Beslutet kunde inte bekräftas. Uppdatera status och kontrollera aktuellt underlag före ett nytt försök.')
   const job:SendJobSummary=await r.json()
   if(job.revisionId!==revisionId||job.revisionHash!==revisionHash)throw Error('Sändkvittot hör inte till denna mejlversion.')
   await load()
  }catch(e){setError(e instanceof Error?e.message:'Sändbeslutet kunde inte bekräftas.')}
  finally{locked.current=false;setBusy(false)}
 }
 async function refresh(){try{await onRefresh();await load()}catch{setPreview(null);setAccepted(null);setError('Kontaktkontrollen kunde inte uppdateras. Försök igen innan du fortsätter.')}}
 const job=preview?.job,ack=preview?identity(preview):''
 return <section className={styles.panel} aria-label="Sändning av första mejlet">
  <h4>Sändning av detta första mejl</h4>
  {error&&<p role="alert">{error}</p>}
  {available===false?<p>Sändning av första kontaktmejl är inte aktiverad. Den godkända texten ligger kvar för granskning.</p>:job?<>
   <p role="status">{labels[job.status]}</p>
   {job.status==='smtp_accepted'&&<p>Strato har accepterat mejlet. Mottagning i inkorgen är inte bekräftad.</p>}
   {job.status==='delivery_unknown'&&<p>Mejlet kan redan ha skickats. Ingen automatisk omsändning görs; utfallet behöver stämmas av.</p>}
   {['queued','claimed'].includes(job.status)&&<button disabled={busy} onClick={()=>void act('cancel')}>Avbryt sändningen</button>}
  </>:preview?<>
   <p>Detta är ett separat sändningsbeslut för exakt mottagare, ämne och text som visas ovan. Textgodkännandet skickar aldrig mejl.</p>
   <SalesDraftHistory model={model} draft={draft}/>
   {!evidenceCurrent&&<p role="alert">Den visade kontaktkontrollen matchar inte sändningsbeslutet. Uppdatera och granska det aktuella underlaget innan du fortsätter.</p>}
   {preview.requiresHistoryGapAcceptance&&<label className={styles.check}><input type="checkbox" checked={accepted===ack} disabled={busy||!evidenceCurrent||!preview.canConfirm} onChange={e=>setAccepted(e.target.checked?ack:null)}/>Jag accepterar den redovisade luckan i äldre eller extern kontakthistorik för detta mejl.</label>}
   <button disabled={busy||!evidenceCurrent||!preview.canConfirm||(preview.requiresHistoryGapAcceptance&&accepted!==ack)} onClick={()=>void act('confirm')}>Godkänn och skicka detta mejl</button>
   {!preview.canConfirm&&<p>Sändning är spärrad. Kontrollera textgodkännande, aktuella källor, mottagarspärrar och projektets sändpolicy.</p>}
  </>:!error&&<p>Sändstatus kontrolleras.</p>}
  <button disabled={busy} onClick={()=>void refresh()}>Uppdatera sändstatus</button>
 </section>
}
