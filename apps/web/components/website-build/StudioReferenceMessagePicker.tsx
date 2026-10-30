'use client'
import React,{useEffect,useRef,useState} from 'react'
import type {TurnResult} from '@/lib/atlas/conversation/controller'
import {parseReferenceSaveSelection,REFERENCE_SAVED_NOTICE} from '@/lib/website-build/assets/reference-save-contract'
import styles from './StudioReferenceUploads.module.css'
export type SaveReferenceMessage={text:string;ticketIds:string[];idempotencyKey:string}
export type SaveReferenceCallback=(input:SaveReferenceMessage)=>Promise<TurnResult>
type Retained=SaveReferenceMessage
function readIntent(key:string):Retained|null{
 try{
  const raw=JSON.parse(sessionStorage.getItem(key)??'null')
  if(!raw||Object.keys(raw).sort().join(',')!=='idempotencyKey,text,ticketIds'||
     typeof raw.text!=='string'||!raw.text.trim()||raw.text.length>10000)return null
  const selection=parseReferenceSaveSelection({ticketIds:raw.ticketIds,idempotencyKey:raw.idempotencyKey})
  return selection?{...selection,text:raw.text}:null
 }catch{return null}
}
/** Explicit persistence UI. Selection never authorizes image analysis. */
export function StudioReferenceMessagePicker({userId,projectId,conversationId,references,readOnly,onSave}:{
 userId:string;projectId:string;conversationId:string;references:{ticketId:string}[];readOnly:boolean;onSave:SaveReferenceCallback
}){
 const storageKey='atlas-reference-save:'+userId+':'+projectId+':'+conversationId
 const [intent,setIntent]=useState(()=>readIntent(storageKey))
 const [selected,setSelected]=useState<string[]>(()=>intent?.ticketIds??[])
 const [text,setText]=useState(()=>intent?.text??'')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const live=useRef(true),saving=useRef(false)
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 // Keep every selected image visible when new uploads rotate the library window.
 const visible=[...references]
 for(const ticketId of selected)if(!visible.some(r=>r.ticketId===ticketId))visible.push({ticketId})
 const locked=readOnly||busy||!!intent
 function toggle(ticketId:string){
  if(locked)return
  setNotice('');setError('')
  setSelected(current=>current.includes(ticketId)?current.filter(id=>id!==ticketId):current.length<4?[...current,ticketId]:current)
 }
 async function save(){
  if(readOnly||saving.current||!selected.length||!text.trim())return
  let current=intent
  if(!current){
   current={text:text.trim(),ticketIds:[...selected],idempotencyKey:crypto.randomUUID()}
   try{
    const encoded=JSON.stringify(current);sessionStorage.setItem(storageKey,encoded)
    if(sessionStorage.getItem(storageKey)!==encoded)throw Error()
   }catch{setError('Sparförsöket kunde inte förberedas. Din kommentar finns kvar; försök igen.');return}
   setIntent(current)
  }
  saving.current=true;setBusy(true);setError('');setNotice('')
  try{
   const result=await onSave({...current,ticketIds:[...current.ticketIds]})
   if(result.ok&&result.referenceReceipt){
    try{sessionStorage.removeItem(storageKey)}catch{}
    if(!live.current)return
    setIntent(null);setSelected([]);setText('');setNotice(REFERENCE_SAVED_NOTICE)
   }else if(live.current)setError(result.notice??'Sparandet kunde inte bekräftas. Försök igen med samma meddelande.')
  }catch{if(live.current)setError('Anslutningen bröts. Försök spara samma meddelande igen.')}
  finally{saving.current=false;if(live.current)setBusy(false)}
 }
 return <div className={styles.picker}>
  <fieldset disabled={locked} className={styles.choices}>
   <legend>Välj bilder till meddelandet</legend>
   <ul className={styles.gallery}>{visible.map((item,i)=><li key={item.ticketId}>
    <label className={styles.choice}>
     <input type="checkbox" aria-label={'Välj referens '+(i+1)} checked={selected.includes(item.ticketId)}
      disabled={locked||selected.length>=4&&!selected.includes(item.ticketId)} onChange={()=>toggle(item.ticketId)}/>
     {/* Private image route revalidates this conversation and ticket. */}
     {/* eslint-disable-next-line @next/next/no-img-element */}
     <img src={'/api/website-build/references/image?'+new URLSearchParams({projectId,conversationId,ticketId:item.ticketId})}
      alt={'Designreferens '+(i+1)} loading="lazy"/>
     <span>Referens {i+1}{selected.includes(item.ticketId)&&<small>Vald som bild {selected.indexOf(item.ticketId)+1}</small>}</span>
    </label>
   </li>)}</ul>
  </fieldset>
  <p aria-live="polite" className={styles.info}>{selected.length} av 4 bilder valda</p>
  <label className={styles.comment}>Kommentar till referenserna
   <textarea value={text} maxLength={10000} rows={3} disabled={locked}
    placeholder="Till exempel: Jag gillar färgerna i bild två." onChange={e=>{setText(e.target.value);setNotice('')}}/>
  </label>
  {intent&&!busy&&<p className={styles.note}>Ett sparförsök väntar på bekräftelse. Försök igen med samma bilder och kommentar.</p>}
  <button type="button" className={styles.add} onClick={()=>void save()} disabled={readOnly||busy||!selected.length||!text.trim()}>
   {busy?'Sparar…':intent?'Försök spara igen':'Spara referenser i chatten'}
  </button>
  <p className={styles.note}>Bilderna kopplas till meddelandet. Atlas analyserar dem inte ännu.</p>
  {error&&<p role="alert">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
 </div>
}
