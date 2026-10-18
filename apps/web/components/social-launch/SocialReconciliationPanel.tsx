'use client'
import {useEffect,useRef,useState} from 'react'
import type {PublicationRecord} from '@/lib/social-launch/publication/types'
import type {SocialContentRevision} from '@/lib/social-launch/content/types'
import type {ReconciliationCandidate} from '@/lib/social-launch/publication/reconciliation/types'
import styles from './SocialPublicationPanel.module.css'
type Props={projectId:string;postId:string;receipt:PublicationRecord;disabled:boolean;onComplete:()=>void}
type Inspection={candidates:ReconciliationCandidate[];receipt:PublicationRecord;revision:SocialContentRevision}
export function SocialReconciliationPanel({projectId,postId,receipt,disabled,onComplete}:Props){
 const [view,setView]=useState<Inspection|null>(null),[selected,setSelected]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState<Record<string,boolean>>({})
 const active=useRef(true),flight=useRef(false),controller=useRef<AbortController|null>(null)
 useEffect(()=>{active.current=true;return()=>{active.current=false;controller.current?.abort()}},[])
 const candidate=view?.candidates.find(c=>c.id===selected),asset=view?.revision.media[0]
 async function act(operation:'inspect'|'complete'){
  if(disabled||flight.current||operation==='complete'&&(!candidate||!confirmed||!loaded.original||!loaded[selected]))return
  flight.current=true;setBusy(true);setError('');const c=new AbortController();controller.current=c
  try{
   const r=await fetch('/api/social-publication-reconciliation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,projectId,postId,publicationId:receipt.id,...(operation==='complete'?{candidateId:selected,expectedVersion:view!.receipt.version,imageConfirmed:true}:{})}),signal:c.signal})
   const value=await r.json();if(!active.current||c.signal.aborted)return
   if(!r.ok)throw Error(value.code==='CONFLICT'?'Granskningen är inaktuell eller inlägget har ändrats. Läs kandidaterna och jämför bilderna igen.':'Inlägget kunde inte verifieras. Kontrollera anslutningen och försök läsa igen.')
   if(operation==='inspect'){setView(value);setSelected('');setLoaded({});setConfirmed(false)}
   else{setView(null);setConfirmed(false);onComplete()}
  }catch(e){if(active.current&&!c.signal.aborted){setError(e instanceof Error?e.message:'Verifieringen kunde inte slutföras.');setConfirmed(false)}}
  finally{flight.current=false;if(active.current)setBusy(false)}
 }
 return <section aria-label="Verifiera befintligt Facebook-inlägg" className={styles.receipt}>
  <h4>Koppla ett redan publicerat inlägg</h4><p>Jämför med den bild och text som godkändes för försöket. Detta skickar inget nytt inlägg.</p>
  <button disabled={disabled||busy} onClick={()=>void act('inspect')}>Läs befintliga Facebook-inlägg</button>
  {error&&<p role="status">{error}</p>}
  {view&&<><p>Godkänd text: {view.revision.draft.text}</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16}}>{asset&&<figure><img alt="Ursprungligen godkänd bild" style={{maxWidth:300,width:'100%'}} src={'/api/social-content/media?'+new URLSearchParams({projectId,assetId:asset.id,sha256:asset.sha256})} onLoad={()=>setLoaded(v=>({...v,original:true}))} onError={()=>setLoaded(v=>({...v,original:false}))}/><figcaption>Ursprungligen godkänd bild</figcaption></figure>}
   <div>{!view.candidates.length&&<p>Inget exakt matchande fotoinlägg hittades. Kvittot är fortfarande osäkert.</p>}
   {view.candidates.map(item=><article key={item.id}><label><input type="radio" name={'reconciliation-'+receipt.id} value={item.id} checked={selected===item.id} disabled={busy} onChange={()=>{setSelected(item.id);setConfirmed(false)}}/>Konto {item.accountId} · {new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',dateStyle:'short',timeStyle:'medium'}).format(new Date(item.createdAt))}</label>
    <p>{item.text}</p><img alt="Bild i befintligt Facebook-inlägg" style={{maxWidth:300,width:'100%'}} src={item.imageUrl} referrerPolicy="no-referrer" onLoad={()=>setLoaded(v=>({...v,[item.id]:true}))} onError={()=>setLoaded(v=>({...v,[item.id]:false}))}/><p><a href={item.permalink} target="_blank" rel="noreferrer">Öppna befintligt inlägg</a></p>
   </article>)}</div></div>
   {candidate&&<><label><input type="checkbox" checked={confirmed} disabled={busy||!loaded.original||!loaded[selected]} onChange={e=>setConfirmed(e.target.checked)}/>Jag har jämfört bilderna och bekräftar att detta är det godkända inlägget.</label><button disabled={disabled||busy||!confirmed||!loaded.original||!loaded[selected]} onClick={()=>void act('complete')}>Koppla verifierat inlägg till kvittot</button></>}
  </>}
 </section>
}
