'use client'
import {useRef,useState,type FormEvent} from 'react'
import type {EmailCopyRevision} from '@/lib/sales/email-copy'
import {offerLabel} from '@/lib/sales/offers'
import styles from './SalesWorkspace.module.css'

export function SalesEmailTemplates({projectId,revisions,onSaved}:{projectId:string;revisions:EmailCopyRevision[]|undefined;onSaved:()=>Promise<void>}){
 const [local,setLocal]=useState<EmailCopyRevision[]>([]),[edit,setEdit]=useState<{base:EmailCopyRevision;subject:string;body:string}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const retry=useRef<{fingerprint:string;key:string}|null>(null),saving=useRef(false)
 const rows=[...local,...(revisions??[])].filter((r,i,a)=>a.findIndex(x=>x.id===r.id)===i)
 const current=Object.values(Object.fromEntries([...rows].sort((a,b)=>a.version-b.version).map(r=>[r.templateKey,r]))).sort((a,b)=>a.templateKey.localeCompare(b.templateKey))
 function start(r:EmailCopyRevision){setEdit({base:r,subject:r.subject,body:r.body});retry.current=null;setMessage('')}
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!edit||saving.current)return
  saving.current=true;setBusy(true);setMessage('')
  const fingerprint=JSON.stringify([projectId,edit.base.id,edit.subject,edit.body])
  if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,key:crypto.randomUUID()}
  try{
   const response=await fetch('/api/sales',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'save_email_copy',projectId,templateKey:edit.base.templateKey,expectedPreviousId:edit.base.id,idempotencyKey:retry.current.key,subject:edit.subject,body:edit.body})})
   if(!response.ok){if(response.status===409)throw Error('Mallen har ändrats. Din text är kvar. Uppdatera underlaget och ta vara på dina ändringar innan du öppnar den senaste versionen.');throw Error('Texten kunde inte sparas. Din redigering är kvar; försök igen.')}
   const saved:EmailCopyRevision=await response.json()
   setLocal(old=>[saved,...old]);setEdit(null);retry.current=null
   setMessage('Ny mallversion sparad som utkast. Den behöver granskas med mottagare och tidpunkt före ett framtida utskick.')
   try{await onSaved()}catch{setMessage('Ny mallversion sparad. Övrigt underlag kunde inte uppdateras; uppdatera sidan när anslutningen fungerar.')}
  }catch(error){setMessage(error instanceof Error&&(error.message.startsWith('Mallen har ändrats.')||error.message.startsWith('Texten kunde inte sparas.'))?error.message:'Svaret kunde inte läsas. Din redigering är kvar; försök igen.')}
  finally{saving.current=false;setBusy(false)}
 }
 return <details className={styles.disclosure} id="email-templates">
  <summary><h2>Mejlmallar</h2><span>{revisions===undefined?'Underlag saknas':current.length+' textförslag'}</span></summary>
  <div className={styles.disclosureBody}>
   <p>Förbered och ändra texten här. Mottagare och tidpunkt granskas separat senare. Mallarna skickar inga mejl.</p>
   {message&&<p role="status" className={styles.message}>{message}</p>}
   {revisions===undefined?<p role="alert">Mejlmallarna kunde inte läsas.</p>:!current.length&&<p className={styles.empty}>Inga mejlmallar har sparats.</p>}
   <button type="button" disabled={busy} onClick={()=>{setBusy(true);void onSaved().then(()=>setMessage('Underlaget är uppdaterat. Din eventuella redigering är kvar.')).catch(()=>setMessage('Underlaget kunde inte uppdateras. Din redigering är kvar.')).finally(()=>setBusy(false))}}>Uppdatera mallunderlaget</button>
   {current.map(r=><article key={r.templateKey} className={styles.panel}>
    <div className={styles.sectionHead}><h3>{r.kind==='initial'?'Första inbjudan':'Möjlig framtida påminnelse'}</h3><span>Utkast · version {r.version}</span></div>
    <dl className={styles.metadata}><dt>Från</dt><dd>{r.senderName} &lt;{r.senderEmail}&gt;</dd><dt>Till</dt><dd>Ingen mottagare vald</dd><dt>Tidpunkt</dt><dd>Ingen tidpunkt vald</dd><dt>Erbjudande</dt><dd>{offerLabel({offerKind:r.offerKind,freeMonths:r.pilotMonths})}</dd></dl>
    <h4>{r.subject}</h4><div className={styles.body}>{r.body}</div><p className={styles.notice}>{r.usage}</p>
    <details><summary>Visa erbjudande och tidigare versioner</summary><p>{r.offerText}</p><small>Erbjudandeversion {r.offerRevisionId}</small>
     {rows.filter(x=>x.templateKey===r.templateKey).sort((a,b)=>b.version-a.version).map(v=><details key={v.id}><summary>Version {v.version} · {new Date(v.createdAt).toLocaleString('sv-SE')}</summary><h4>{v.subject}</h4><div className={styles.body}>{v.body}</div><small>Textutkast · inget sändningsbeslut</small></details>)}
    </details>
    <button type="button" disabled={busy||edit!==null} onClick={()=>start(r)}>Redigera mall</button>
   </article>)}
   {edit&&<section className={styles.panel}><h3>Redigera mejlmall</h3><p>Den sparade versionen behålls. Den nya texten sparas som ett nytt utkast.</p>
    <form className={styles.form} onSubmit={save}>
     <label>Ämne<input name="subject" required maxLength={90} value={edit.subject} disabled={busy} onChange={e=>setEdit({...edit,subject:e.target.value})}/></label>
     <label>Mejltext<textarea name="body" required maxLength={2000} rows={14} value={edit.body} disabled={busy} onChange={e=>setEdit({...edit,body:e.target.value})}/></label>
     <div className={styles.actions}><button type="submit" disabled={busy||!edit.subject.trim()||!edit.body.trim()||(edit.subject===edit.base.subject&&edit.body===edit.base.body)}>Spara ny mallversion</button><button type="button" disabled={busy} onClick={()=>setEdit(null)}>Avbryt redigering</button></div>
    </form>
   </section>}
  </div>
 </details>
}
