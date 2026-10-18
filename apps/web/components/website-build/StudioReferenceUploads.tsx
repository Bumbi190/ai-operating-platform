'use client'
import React from 'react'

import {useEffect,useRef,useState,type ChangeEvent} from 'react'
import {createClient} from '@/lib/supabase/client'
import styles from './StudioReferenceUploads.module.css'

const MAX_FILES=4
const MAX_BYTES=10*1024*1024
const TYPES=new Set(['image/png','image/jpeg','image/webp'])
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
type UploadItem={id:string;slot:number;file:File;url:string;state:'uploading'|'saved'|'error';assetId?:string;message?:string}
type Ticket={ticketId:string;bucket:string;path:string;token:string;mimeType:string}
type Status='loading'|'disabled'|'available'|'unavailable'
type StoredReference={ticketId:string;assetId:string;issuedAt:string}

async function postJson(url:string,body:Record<string,unknown>,signal:AbortSignal) {
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal})
  if(!response.ok)throw Error(response.status===429?'För många uppladdningar. Försök senare.':
    response.status===409?'Biljetten har ändrats eller gått ut. Välj en ny bild.':
    response.status===401||response.status===404?'Din åtkomst till projektet behöver kontrolleras.':
    'Uppladdningen kunde inte slutföras. Ingen bild har skickats till Atlas.')
  return response.json()
}

/**
 * Private reference intake, NOT a multimodal chat send.
 * Scoped to one selected conversation; remount on project/conversation changes.
 */
export function StudioReferenceUploads({projectId,conversationId,readOnly}:{
  projectId:string;conversationId:string;readOnly:boolean
}){
  const [status,setStatus]=useState<Status>('loading')
  const [draftId,setDraftId]=useState(()=>crypto.randomUUID())
  const [items,setItems]=useState<UploadItem[]>([])
  const [stored,setStored]=useState<StoredReference[]>([])
  const [error,setError]=useState('')
  const filesRef=useRef<HTMLInputElement>(null),itemsRef=useRef<UploadItem[]>([])
  const controller=useRef<AbortController|null>(null)
  const live=useRef(true)
  const uploading=useRef(false)

  useEffect(()=>{
    live.current=true
    const abort=new AbortController()
    setStatus('loading')
    const params=new URLSearchParams({projectId,conversationId})
    void fetch('/api/website-build/references/tickets?'+params,{signal:abort.signal,cache:'no-store'})
      .then(async response=>{if(!response.ok)throw Error();return response.json()})
      .then(async result=>{
        if(abort.signal.aborted)return
        if(result.available!==true){setStatus('disabled');return}
        setStatus('available')
        const response=await fetch('/api/website-build/references/library?'+params,{signal:abort.signal,cache:'no-store'})
        if(!response.ok)throw Error()
        const library=await response.json()
        if(!abort.signal.aborted&&library.available===true&&Array.isArray(library.items)){
          setStored(library.items.filter((item:StoredReference)=>
            UUID.test(item.ticketId)&&UUID.test(item.assetId)).slice(0,40))
        }
      })
      .catch(()=>{if(!abort.signal.aborted)setStatus('unavailable')})
    return()=>{
      abort.abort();controller.current?.abort();live.current=false
      for(const item of itemsRef.current)URL.revokeObjectURL(item.url)
    }
  },[projectId,conversationId])

  function clearSelection(){
    if(uploading.current)return
    for(const item of itemsRef.current)URL.revokeObjectURL(item.url)
    itemsRef.current=[]
    setItems([])
    setDraftId(crypto.randomUUID())
    setError('')
  }
  function update(slot:number,changes:Partial<UploadItem>) {
    if(!live.current)return
    setItems(current=>{
      const next=current.map(item=>item.slot===slot?{...item,...changes}:item)
      itemsRef.current=next
      return next
    })
  }
  async function choose(event:ChangeEvent<HTMLInputElement>){
    const selected=Array.from(event.target.files??[])
    event.target.value=''
    if(!selected.length || uploading.current || status!=='available'||readOnly)return
    if(selected.length+itemsRef.current.length>MAX_FILES){
      setError('Högst fyra referensbilder kan väljas åt gången.')
      return
    }
    if(selected.some(file=>!TYPES.has(file.type)||file.size===0||file.size>MAX_BYTES)){
      setError('Använd PNG, JPEG eller WebP, högst 10 MB per bild.')
      return
    }
    setError('')
    uploading.current=true
    const abort=new AbortController()
    controller.current=abort
    try{
      for(const file of selected){
        if(abort.signal.aborted)break
        const slot=itemsRef.current.length
        const local:UploadItem={id:crypto.randomUUID(),file,slot,url:URL.createObjectURL(file),state:'uploading'}
        const created=[...itemsRef.current,local]
        itemsRef.current=created
        if(live.current)setItems(created)
        try{
          const ticket:Ticket=await postJson('/api/website-build/references/tickets',
            {projectId,conversationId,draftId,slot,mimeType:file.type},abort.signal)
          if(ticket.bucket!=='atlas-reference-staging' || !UUID.test(ticket.ticketId) ||
             !ticket.path?.startsWith('incoming/'+projectId+'/'+conversationId+'/'+ticket.ticketId+'.') ||
             typeof ticket.token!=='string'||!ticket.token||ticket.mimeType!==file.type)
            throw Error('Ogiltigt uppladdningskvitto.')
          // Supabase client carries only the public publishable key, never service_role.
          const {error:uploadError}=await createClient().storage.from(ticket.bucket)
            .uploadToSignedUrl(ticket.path,ticket.token,file,{contentType:file.type,upsert:false})
          if(uploadError)throw Error('Bilden kunde inte överföras till privat lagring.')
          const result=await postJson('/api/website-build/references/finish',
            {projectId,conversationId,ticketId:ticket.ticketId},abort.signal)
          if(result.status!=='ready'||!UUID.test(result.assetId))throw Error('Bilden kunde inte verifieras.')
          update(slot,{state:'saved',assetId:result.assetId})
          setStored(current=>current.some(item=>item.ticketId===ticket.ticketId)?current:
            [{ticketId:ticket.ticketId,assetId:result.assetId,issuedAt:new Date().toISOString()},...current].slice(0,40))
        }catch(e){
          if(!abort.signal.aborted)update(slot,{state:'error',message:e instanceof Error?e.message:'Okänt uppladdningsfel.'})
          if(abort.signal.aborted)break
        }
      }
    }finally{
      uploading.current=false
      if(controller.current===abort)controller.current=null
    }
  }
  const available=status==='available'&&!readOnly
  return <section className={styles.references} aria-label="Bildreferenser">
    <h3>Bildreferenser</h3>
    <p className={styles.info}>Välj upp till fyra bilder som underlag för din webbdesign. Bilderna sparas privat i projektet.</p>
    {status==='loading'&&<p role="status">Kontrollerar bildfunktionen…</p>}
    {status==='disabled'&&<p>Bildreferenser är förberedda men ännu inte aktiverade för projektet.</p>}
    {status==='unavailable'&&<p role="alert">Det gick inte att kontrollera bilduppladdning. Prova att öppna projektet igen.</p>}
    {readOnly&&<p>Projektet är pausat eller skrivskyddat. Nya bilder kan inte sparas.</p>}
    <input ref={filesRef} className={styles.hidden} type="file"
      accept="image/png,image/jpeg,image/webp" multiple
      aria-label="Välj referensbilder"
      disabled={!available||uploading.current||items.length>=MAX_FILES}
      onChange={e=>void choose(e)}/>
    <button type="button" className={styles.add} onClick={()=>filesRef.current?.click()}
      disabled={!available||uploading.current||items.length>=MAX_FILES}>
      Lägg till bild {items.length?('('+items.length+'/'+MAX_FILES+')'):''}
    </button>
    {!!items.length&&<button type="button" className={styles.reset} onClick={clearSelection}
      disabled={uploading.current}>Rensa urval {items.some(item=>item.state==='saved')?'(sparade bilder finns kvar)':''}</button>}
    {error&&<p role="alert">{error}</p>}
    {!!items.length&&<ul className={styles.gallery}>
      {items.map(item=><li key={item.id} className={styles.item}>
        {/* The preview comes only from the user's own local selection. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={'Förhandsvisning av '+item.file.name}/>
        <div><strong title={item.file.name}>{item.file.name}</strong>
          <span role="status">{item.state==='saved'?'Sparad privat':item.state==='uploading'?'Laddar upp…':'Uppladdning misslyckades'}</span>
          {item.message&&<span role="alert">{item.message}</span>}
        </div>
      </li>)}
    </ul>}
    {!!stored.length&&<div className={styles.saved}><h4>Sparade bilder i denna konversation</h4>
      <ul className={styles.gallery}>{stored.map(item=><li key={item.ticketId} className={styles.item}>
        {/* Binary delivered only after authenticated project, ticket, asset and hash validation. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={'/api/website-build/references/image?'+new URLSearchParams({projectId,conversationId,ticketId:item.ticketId})}
          alt="Tidigare sparad designreferens" loading="lazy"/>
        <div><strong>Privat bildreferens</strong><span>Sparad i projektet</span></div>
      </li>)}</ul></div>}
    {items.some(item=>item.state==='saved')&&
      <p className={styles.note}>Bilderna är sparade, men skickas inte till Atlas AI ännu. Den kopplingen kräver ett separat verifierat steg.</p>}
  </section>
}
