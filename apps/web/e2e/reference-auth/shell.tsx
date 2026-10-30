'use client'
// Synthetic dashboard shell; all reference behavior comes from production modules.
import React,{useEffect,useState,useSyncExternalStore} from 'react'
import {useRouter} from 'next/navigation'
import {createClient} from '@/lib/supabase/client'
import {StudioReferenceUploads} from '@/components/website-build/StudioReferenceUploads'
import {AtlasConversationController} from '@/lib/atlas/conversation/controller'
import type {SavedMessage} from '@/lib/os/chat-shared'
export default function Shell({projectId,conversationId,email,saved,owned}:{projectId:string;conversationId:string;email:string;saved:SavedMessage[];owned:boolean}){
 const [controller]=useState(()=>{const c=new AtlasConversationController();c.activateConversation({id:conversationId,projectId,studio:owned,saved,state:'ok'});return c})
 const snapshot=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot)
 const [status,setStatus]=useState(''),router=useRouter()
 useEffect(()=>{const {data}=createClient().auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')controller.clearOnSignout()});return()=>data.subscription.unsubscribe()},[controller])
 return <main style={{maxWidth:1000,margin:'auto',padding:24,fontFamily:'system-ui'}}>
 <h1>Isolerat Studio browserprov</h1><p data-testid="verified-user">{email}</p>
 <button onClick={async()=>{controller.clearOnSignout();await createClient().auth.signOut();router.replace('/login');router.refresh()}}>Logga ut</button>
 <button onClick={async()=>{const r=await createClient().auth.refreshSession();setStatus(r.error?'Fel':'Förnyad')}}>Förnya session</button>
 <p role="status" aria-label="Session">{status}</p>
 <StudioReferenceUploads projectId={projectId} conversationId={conversationId} readOnly={false} activeConversation={snapshot}
 onSaveReference={input=>controller.saveReferenceTurn({conversationId,...input})}/>
 <aside role="region" aria-label="Testchatt">{snapshot.entries.map((entry,i)=><p key={i}>{'text' in entry?entry.text:''}</p>)}</aside>
 </main>
}
