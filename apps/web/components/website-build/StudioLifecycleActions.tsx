'use client'
import {useEffect,useRef,useState} from 'react'
import type {StudioProject} from '@/lib/website-build/studio/types'
import type {ProjectLifecycleState} from '@/lib/project/lifecycle/types'
import styles from './AtlasBuilderStudio.module.css'
type Action='archive'|'trash'|'restore'
export function StudioLifecycleActions({project,onChanged}:{project:StudioProject;onChanged:(state:ProjectLifecycleState)=>void}){
 const [confirm,setConfirm]=useState<{action:Action;version:number;name:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const dialog=useRef<HTMLDialogElement>(null),intent=useRef<{payload:string;key:string}|null>(null)
 useEffect(()=>{if(confirm&&!dialog.current?.open)dialog.current?.showModal()},[confirm])
 async function change(action:Action,version:number){
  if(busy)return;setBusy(true);setError('')
  try{
   const payload=JSON.stringify({action,expectedVersion:version})
   if(intent.current?.payload!==payload)intent.current={payload,key:crypto.randomUUID()}
   const r=await fetch('/api/projects/by-id/'+project.id+'/lifecycle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...JSON.parse(payload),idempotencyKey:intent.current.key})}),body=await r.json().catch(()=>null)
   if(!r.ok)throw Error(body?.error??'Projektets status kunde inte ändras. Uppdatera och försök igen.')
   dialog.current?.close();setConfirm(null);onChanged(body.state)
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <div className={styles.lifecycle}>
  {project.lifecycle.stopping&&<p role="status">Avslutar arbete. Projektet är stoppat för nya körningar; inväntar kvittens från pågående arbete.</p>}
  {project.lifecycle.state==='active'&&<button type="button" disabled={busy} onClick={()=>{setError('');setConfirm({action:'archive',version:project.lifecycle.version,name:project.name})}}>Arkivera</button>}
  {project.lifecycle.state!=='trashed'&&<button type="button" disabled={busy} onClick={()=>{setError('');setConfirm({action:'trash',version:project.lifecycle.version,name:project.name})}}>Flytta till papperskorg</button>}
  {project.lifecycle.state!=='active'&&<button type="button" disabled={busy} onClick={()=>void change('restore',project.lifecycle.version)}>Återställ</button>}
  {error&&!confirm&&<p role="alert">{error}</p>}
  {confirm&&<dialog ref={dialog} className={styles.lifecycleDialog} aria-labelledby="lifecycle-title" onCancel={()=>{setConfirm(null);setError('')}}>
   <h2 id="lifecycle-title">{confirm.action==='archive'?'Arkivera':'Flytta till papperskorg'}: {confirm.name}</h2>
   <p>Projektet döljs från aktiva projekt och byggarbetet stoppas. Historik och preview finns kvar. Lokal mapp, livesida och externa resurser bevaras.</p>
   <p>Du kan återställa projektet senare. Det förblir pausat tills du själv återupptar arbetet.</p>
   {error&&<p role="alert">{error}</p>}
   <button type="button" disabled={busy} onClick={()=>{dialog.current?.close();setConfirm(null)}}>Behåll projektet</button>
   <button type="button" disabled={busy} onClick={()=>void change(confirm.action,confirm.version)}>{busy?'Sparar…':confirm.action==='archive'?'Arkivera projektet':'Flytta projektet till papperskorgen'}</button>
  </dialog>}
 </div>
}
