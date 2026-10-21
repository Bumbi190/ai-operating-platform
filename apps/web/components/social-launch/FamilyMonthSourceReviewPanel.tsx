'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import {FAMILY_SOCIAL_PROJECT_ID} from '@/lib/social-launch/scheduling/policy'
import styles from './FamilyMonthSourceReviewPanel.module.css'

type Card={
 candidateId:string
 month:string
 candidateSha256:string
 createdAt:string
 card:{heading:string;summary:string;evidenceCount:number;dates:string[];concerns:string[];decisionPrompt:string}
 decision:{kind:'approve'|'reject';decidedAt:string;candidateSha256:string}|null
 canActivate:false
 canPublish:false
}
type Proposal={
 projectId:string
 month:string
 planRevisionId:string
 title:string
 publicSummary:string
 campaignPurpose:string
 proof:Array<{kind:string;referenceId:string;sha256:string;description:string;privateSubscriberAsset:false}>
 proposedCopy:Array<{date:string;variant:string;title:string;text:string}>
}
type Selection={candidate:Card;proposal:Proposal;latest:boolean;canActivate:false;canPublish:false}
const reHash=/^[a-f0-9]{64}$/
const reId=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
function nextMonthStockholm(now:Date){
 const ymd=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm',
  year:'numeric',month:'2-digit'}).formatToParts(now)
 const parts=Object.fromEntries(ymd.map(x=>[x.type,x.value]))
 const y=Number(parts.year),m=Number(parts.month)
 return m===12?String(y+1)+'-01':String(y)+'-'+String(m+1).padStart(2,'0')
}
function okCard(row:Card,month:string){
 return !!row&&reId.test(row.candidateId)&&reHash.test(row.candidateSha256)&&
  row.month===month&&row.canActivate===false&&row.canPublish===false&&
  (row.decision===null||['approve','reject'].includes(row.decision.kind))
}
function okSelection(value:Selection,expected:Card){
 return !!value&&value.latest===true&&value.canActivate===false&&
  value.canPublish===false&&okCard(value.candidate,expected.month)&&
  value.candidate.candidateId===expected.candidateId&&
  value.candidate.candidateSha256===expected.candidateSha256&&
  value.candidate.decision===null&&value.proposal?.month===expected.month&&
  value.proposal.projectId===FAMILY_SOCIAL_PROJECT_ID&&
  Array.isArray(value.proposal.proof)&&value.proposal.proof.length>=1&&
  value.proposal.proof.length<=3&&
  value.proposal.proof.every(p=>p.privateSubscriberAsset===false&&reHash.test(p.sha256)&&reId.test(p.referenceId))&&
  Array.isArray(value.proposal.proposedCopy)
}
const copy={
 heading:'M\u00e5nadsk\u00e4llor',
 waiting:'V\u00e4ntar p\u00e5 ditt beslut',
 review:'Granska underlag',
 hide:'St\u00e4ng granskning',
 approve:'Godk\u00e4nn k\u00e4llan',
 reject:'Avvisa',
 confirm:'Jag har granskat samtliga originalk\u00e4llor, texter och r\u00e4ttigheter f\u00f6r exakt denna version',
 reload:'L\u00e4s senaste',
 loading:'L\u00e4ser underlag',
 failure:'Kunde inte l\u00e4sa underlaget. F\u00f6rs\u00f6k igen.',
 changed:'Underlaget har \u00e4ndrats. H\u00e4mta aktuell version innan du fattar beslut.',
 noPublish:'Beslutet aktiverar inte k\u00e4llan och publicerar inget.',
 source:'Offentliga k\u00e4llor att kontrollera',
 text:'F\u00f6reslagna texter',
}
export function FamilyMonthSourceReviewPanel({
 projectId,month:explicitMonth,
}:{projectId:string;month?:string}){
 const [month]=useState(()=>explicitMonth??nextMonthStockholm(new Date()))
 const [rows,setRows]=useState<Card[]>([])
 const [selection,setSelection]=useState<Selection|null>(null)
 const [agreed,setAgreed]=useState(false)
 const [visibleMedia,setVisibleMedia]=useState<Record<string,boolean>>({})
 const [busy,setBusy]=useState(false)
 const [hidden,setHidden]=useState(false)
 const [error,setError]=useState('')
 const [result,setResult]=useState('')
 const seq=useRef(0),controller=useRef<AbortController|null>(null)
 const validProject=projectId===FAMILY_SOCIAL_PROJECT_ID
 const latest=rows[0]??null
 const pending=latest&&latest.decision===null?latest:null
 const endpoint='/api/family-month-source-review'
 const mediaReady=!!selection&&selection.proposal.proof.length>0&&
  selection.proposal.proof.every(p=>visibleMedia[p.referenceId+'|'+p.sha256]===true)
 function reviewedMediaUrl(p:Proposal['proof'][number]){
  return '/api/social-content/media?'+new URLSearchParams({
   projectId:FAMILY_SOCIAL_PROJECT_ID,assetId:p.referenceId,sha256:p.sha256,
  })
 }
 const load=useCallback(async()=>{
  const id=++seq.current
  controller.current?.abort()
  const abort=new AbortController();controller.current=abort
  setBusy(true);setError('');setSelection(null);setAgreed(false);setVisibleMedia({})
  try{
   const r=await fetch(endpoint+'?'+new URLSearchParams({month}),{cache:'no-store',signal:abort.signal})
   if(id!==seq.current||abort.signal.aborted)return
   if(r.status===503){setHidden(true);return}
   if(!r.ok)throw Error('SOURCE_LOAD_FAILED')
   const value=await r.json()
   if(value?.kind!=='family-month-source-owner-review-list-v1'||
    value?.month!==month||value?.canActivate!==false||
    value?.canPublish!==false||!Array.isArray(value.records)||
    value.records.length>30||!value.records.every((v:Card)=>okCard(v,month)))
    throw Error('SOURCE_SCOPE_MISMATCH')
   setRows(value.records);setHidden(false)
  }catch{
   if(id===seq.current&&!abort.signal.aborted)setError(copy.failure)
  }finally{if(id===seq.current&&!abort.signal.aborted)setBusy(false)}
 },[month])
 useEffect(()=>{if(validProject)void load();return()=>{seq.current++;controller.current?.abort()}},[validProject,load])
 async function showFull(){
  if(!pending||busy)return
  setBusy(true);setError('');setVisibleMedia({})
  const id=++seq.current;controller.current?.abort()
  const abort=new AbortController();controller.current=abort
  try{
   const q=new URLSearchParams({month,candidateId:pending.candidateId})
   const r=await fetch(endpoint+'?'+q,{cache:'no-store',signal:abort.signal})
   if(!r.ok)throw Error('SOURCE_REVIEW_NOT_FOUND')
   const value=await r.json() as Selection & {kind:string}
   if(id!==seq.current||abort.signal.aborted)return
   if(value.kind!=='family-month-source-owner-review-v1'||!okSelection(value,pending))
    throw Error('SOURCE_REVIEW_CHANGED')
   setSelection(value);setAgreed(false)
  }catch{
   if(id===seq.current&&!abort.signal.aborted){setSelection(null);setError(copy.changed)}
  }finally{if(id===seq.current&&!abort.signal.aborted)setBusy(false)}
 }
 async function decide(decision:'approve'|'reject'){
  if(busy||!agreed||(decision==='approve'&&!mediaReady)||!selection||!pending||!okSelection(selection,pending))return
  setBusy(true);setError('');setResult('')
  const id=++seq.current
  controller.current?.abort()
  const abort=new AbortController();controller.current=abort
  try{
   const r=await fetch(endpoint,{method:'POST',
    headers:{'content-type':'application/json'},cache:'no-store',signal:abort.signal,
    body:JSON.stringify({operation:'decide',month,candidateId:pending.candidateId,
     candidateSha256:pending.candidateSha256,decision,confirmed:true})})
   if(id!==seq.current||abort.signal.aborted)return
   if(!r.ok)throw Error('SOURCE_DECISION_NOT_ACCEPTED')
   const value=await r.json()
   if(value?.stored!==true||value?.candidateId!==pending.candidateId||
    value?.candidateSha256!==pending.candidateSha256||
    value?.activationAllowed!==false||value?.canPublish!==false||
    value?.decision!==decision)throw Error('SOURCE_DECISION_MISMATCH')
   setSelection(null);setAgreed(false)
   // Read back truth from server: never infer completion from button press.
   const read=await fetch(endpoint+'?'+new URLSearchParams({month}),{
    cache:'no-store',signal:abort.signal,
   })
   if(!read.ok)throw Error('SOURCE_DECISION_READBACK_FAILED')
   const fresh=await read.json()
   if(fresh?.kind!=='family-month-source-owner-review-list-v1'||
    fresh?.month!==month||fresh?.canActivate!==false||fresh?.canPublish!==false||
    !Array.isArray(fresh.records)||fresh.records.length>30||
    !fresh.records.every((c:Card)=>okCard(c,month))||
    !fresh.records.some((c:Card)=>c.candidateId===pending.candidateId&&
      c.candidateSha256===pending.candidateSha256&&
      c.decision?.kind===decision&&
      c.decision.candidateSha256===pending.candidateSha256))
    throw Error('SOURCE_DECISION_READBACK_INVALID')
   if(id!==seq.current||abort.signal.aborted)return
   setRows(fresh.records)
   setResult(copy.noPublish)
  }catch{
   if(id===seq.current&&!abort.signal.aborted){
    setError(copy.changed);setAgreed(false);setSelection(null)
   }
  }finally{if(id===seq.current&&!abort.signal.aborted)setBusy(false)}
 }
 if(!validProject||hidden)return null
 return <section className={styles.panel} aria-label={copy.heading} aria-busy={busy}>
  <div className={styles.top}>
   <div><strong>{copy.heading}</strong><small>{month}</small></div>
   <button type="button" disabled={busy} onClick={()=>void load()}>{copy.reload}</button>
  </div>
  {busy&&<p role="status">{copy.loading}</p>}
  {error&&<p role="alert">{error}</p>}
  {result&&<p role="status">{result}</p>}
  {pending&&<div className={styles.card}>
   <strong>{pending.card.heading}</strong>
   <p>{pending.card.summary}</p>
   <small>{copy.waiting}{' \u00b7 '}{pending.card.evidenceCount} underlag{' \u00b7 '}{pending.card.dates.length} datum</small>
   <button type="button" disabled={busy} onClick={()=>selection?
    (setSelection(null),setAgreed(false)):void showFull()}>
    {selection?copy.hide:copy.review}
   </button>
  </div>}
  {selection&&pending&&<div className={styles.details}>
   <p>{selection.candidate.card.decisionPrompt}</p>
   <h4>{copy.source}</h4>
   <ul>{selection.proposal.proof.map((p,i)=><li key={p.referenceId+'-'+i}>
    <strong>{p.description}</strong><span>{p.referenceId}</span>
    <code>{p.sha256}</code>
    <img key={selection.candidate.candidateId+'-'+p.sha256}
     src={reviewedMediaUrl(p)} alt={'Verifiera originalbild: '+p.description}
     loading="eager" referrerPolicy="no-referrer"
     className={styles.reviewImage}
     onLoad={()=>setVisibleMedia(previous=>({...previous,[p.referenceId+'|'+p.sha256]:true}))}
     onError={()=>setVisibleMedia(previous=>({...previous,[p.referenceId+'|'+p.sha256]:false}))}/>
   </li>)}</ul>
   <h4>{copy.text}</h4>
   <ol>{selection.proposal.proposedCopy.map(p=><li key={p.date}>
    <strong>{p.date} ? {p.title}</strong>
    <p>{p.text}</p></li>)}</ol>
   <details><summary>Exakt granskningsversion</summary><code>{pending.candidateSha256}</code>
    <ul>{pending.card.concerns.map((c,i)=><li key={i}>{c}</li>)}</ul>
   </details>
   {!mediaReady&&<p role="status">Originalbilderna m?ste kunna visas innan k?llan kan godk?nnas. Du kan avvisa underlaget utan att godk?nna det.</p>}
   <label className={styles.confirm}><input type="checkbox" checked={agreed}
    onChange={e=>setAgreed(e.target.checked)}/>{copy.confirm}</label>
   <div className={styles.actions}>
    <button type="button" disabled={!agreed||busy||!mediaReady} onClick={()=>void decide('approve')}>{copy.approve}</button>
    <button type="button" disabled={!agreed||busy} onClick={()=>void decide('reject')}>{copy.reject}</button>
   </div><small>{copy.noPublish}</small>
  </div>}
 </section>
}
