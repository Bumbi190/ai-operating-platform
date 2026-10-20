'use client'

import React,{useRef,useState,type FormEvent} from 'react'
import styles from './CodeWorkReviewCard.module.css'

type Draft={objective:string;kind:string;writePaths:string[]}
type DraftReply=
 | {status:'not_code_work_intent';executionEnabled:false}
 | {status:'needs_details';missing:string[];example:string;executionEnabled:false}
 | {status:'binding_required';reason:string;executionEnabled:false;approvalAvailable:false;
    draft:Draft;nextStep:string}
 | {status:'project_binding_required';projectBindingVerified:false;executionEnabled:false;approvalAvailable:false;
    draft:Draft;nextStep:string;verifiedGit:{repositoryId:string;baseRef:string;pinnedBaseSha:string};
    proposed:{risk:'low'|'medium'|'high';authorProfile:string;reviewerProfile:string;
     authorCapSek:number;reviewerCapSek:number;totalCapSek:number;requiresOwnerChoice:boolean;
     requiresIndependentReview:true;previewFingerprint:string}}
type View={kind:'idle'|'working'|'error'|'result';message?:string;reply?:DraftReply}
const SAMPLE='Atlas, planera kodjobb: Rätta etiketterna | typ: ui_fix | filer: apps/web/lib/ui/display-preferences.ts'

/** Operator-only read-only intake. This never calls the authorization/proposal POST route. */
export function CodeWorkIntakeDraft(){
 const [text,setText]=useState('')
 const [view,setView]=useState<View>({kind:'idle'})
 const generation=useRef(0)
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  const current=++generation.current
  setView({kind:'working'})
  try{
   const response=await fetch('/api/atlas/code-work/intake-draft',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({instruction:text.trim(),inputSource:'text'}),
   })
   const result=await response.json().catch(()=>null)
   if(current!==generation.current)return
   if(!response.ok||!result||result.executionEnabled!==false){
    setView({kind:'error',message:response.status===401||response.status===404
     ?'Endast behörig plattformsoperatör kan granska kodjobbsutkast.'
     :'Instruktionen kunde inte granskas.'})
    return
   }
   if(!['needs_details','binding_required','project_binding_required','not_code_work_intent'].includes(result.status)){
    setView({kind:'error',message:'Okänt svar från servern.'});return
   }
   setView({kind:'result',reply:result as DraftReply})
  }catch{
   if(current===generation.current)setView({kind:'error',message:'Kunde inte nå förhandsgranskningen.'})
  }
 }
 const response=view.reply
 return (
  <section className={styles.proposal} aria-labelledby="code-work-intake-heading">
   <div>
    <h3 id="code-work-intake-heading" className={styles.groupTitle}>Koduppdrag från text – utkast</h3>
    <p className={styles.copy}>Skriv en tydlig instruktion. Atlas läser den registrerade GitHub-basen och föreslår risk, modell och kostnad. Projektbindning och körbehörighet saknas fortfarande.</p>
   </div>
   <form className={styles.draftForm} onSubmit={submit}>
    <label htmlFor="code-work-intake-text">Instruktion</label>
    <textarea id="code-work-intake-text" required maxLength={4096} rows={3}
     value={text} placeholder={SAMPLE} onChange={e=>{generation.current++;setText(e.target.value);setView({kind:'idle'})}} />
    <button className={styles.secondary} type="submit" disabled={view.kind==='working'||!text.trim()}>
     {view.kind==='working'?'Tolkar instruktionen…':'Granska instruktion (ingen körning)'}
    </button>
   </form>
   <div role="status" aria-live="polite" className={styles.draftResult}>
    {view.kind==='error'?<p data-tone="error">{view.message}</p>:null}
    {response?.status==='not_code_work_intent'?<p>Inget uttryckligt kodjobbsuppdrag upptäcktes. Använd formatet i exempeltexten.</p>:null}
    {response?.status==='needs_details'?<div>
      <p>Utkastet saknar: {response.missing.join(', ')}.</p>
      <p>Exempel: <code>{response.example}</code></p>
     </div>:null}
    {response?.status==='binding_required'?<div>
      <p><strong>Strukturerat utkast – inte ett godkänt jobb.</strong></p>
      <p>Uppdrag: {response.draft.objective}</p>
      <p>Typ: {response.draft.kind}</p>
      <ul>{response.draft.writePaths.map(path=><li key={path}><code>{path}</code></li>)}</ul>
      <p>{response.nextStep}</p>
      <p>Ingen körning, ingen beställning och ingen kostnad har skapats.</p>
     </div>:null}
    {response?.status==='project_binding_required'?<div>
      <p><strong>GitHub-bas verifierad – projektbindning saknas.</strong></p>
      <p>Uppdrag: {response.draft.objective}</p>
      <p>Typ: {response.draft.kind}</p>
      <ul>{response.draft.writePaths.map(path=><li key={path}><code>{path}</code></li>)}</ul>
      <p>Repository: <code>{response.verifiedGit.repositoryId}</code></p>
      <p>Git-bas: <code>{response.verifiedGit.baseRef}</code> / <code>{response.verifiedGit.pinnedBaseSha}</code></p>
      <p>Risk: <strong>{response.proposed.risk}</strong></p>
      <p>Preliminär kodmodell: {response.proposed.authorProfile}</p>
      <p>Separat granskare: {response.proposed.reviewerProfile}</p>
      <p>Föreslagna API-tak: kod {response.proposed.authorCapSek} kr,
       granskning {response.proposed.reviewerCapSek} kr,
       totalt {response.proposed.totalCapSek} kr.</p>
      <p>Fingeravtryck: <code>{response.proposed.previewFingerprint}</code></p>
      <p>{response.nextStep}</p>
      <p>Inget godkännande kan ges här. Inga anrop till kodmodeller har gjorts och inga kostnader har uppstått.</p>
     </div>:null}
   </div>
  </section>
 )
}
