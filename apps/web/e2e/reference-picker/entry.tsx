import React,{useState,useSyncExternalStore} from 'react'
import {createRoot} from 'react-dom/client'
import {StudioReferenceUploads} from '../../components/website-build/StudioReferenceUploads'
import {StudioReferenceMessagePicker} from '../../components/website-build/StudioReferenceMessagePicker'
import {AtlasConversationController} from '../../lib/atlas/conversation/controller'
const controller=new AtlasConversationController()
const P='10000000-0000-4000-8000-000000000001',C='50000000-0000-4000-8000-000000000001'
controller.activateConversation({id:C,projectId:P,studio:true,saved:[],state:'ok'})
function App(){
 const [other,setOther]=useState(false),[readOnly,setReadOnly]=useState(false),[rotated,setRotated]=useState(false)
 const windowFixture=new URLSearchParams(location.search).has('selection-window')
 const refs=['70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002']
 const snapshot=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot)
 const projectId=other?'10000000-0000-4000-8000-000000000002':P
 const conversationId=other?'50000000-0000-4000-8000-000000000002':C
 return <><style>{'body{margin:0;padding:24px;background:#0b151d;color:#edf2f7;font:16px/1.5 system-ui;--text-muted:#b4c0cc;--accent:#75ddd0}*{box-sizing:border-box}button,input,textarea{font:inherit}button{min-height:44px}main{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:24px;max-width:1120px;margin:auto}header{max-width:1120px;margin:0 auto 24px}aside{padding:16px;border:1px solid #334653;border-radius:12px}aside p{overflow-wrap:anywhere}@media(max-width:680px){body{padding:12px}main{grid-template-columns:1fr}}'}</style>
 <header><p>Lokal UI-fixtur – inga riktiga konton</p><h1>Referenser till webbdesignen</h1>
 <button onClick={()=>{const next=!other;setOther(next);controller.activateConversation({id:next?'50000000-0000-4000-8000-000000000002':C,projectId:next?'10000000-0000-4000-8000-000000000002':P,studio:true,saved:[],state:'ok'})}}>Byt projekt</button>{' '}
 <button onClick={()=>setReadOnly(v=>!v)}>Växla skrivskydd</button>{' '}
 <button onClick={()=>controller.clearOnSignout()}>Simulera utloggning</button>{' '}
 <button onClick={()=>controller.activateConversation({id:conversationId,projectId,studio:true,saved:[],state:'ok'})}>Återaktivera konversation</button>
 {windowFixture&&<button onClick={()=>setRotated(true)}>Uppdatera bildbibliotek</button>}</header>
 <main>{windowFixture?<StudioReferenceMessagePicker userId="10000000-0000-4000-8000-000000000003" projectId={projectId} conversationId={conversationId} readOnly={readOnly}
 references={(rotated?refs.slice(1):refs).map(ticketId=>({ticketId}))} onSave={input=>controller.saveReferenceTurn({conversationId,...input})}/>:<StudioReferenceUploads key={conversationId} projectId={projectId} conversationId={conversationId} readOnly={readOnly} activeConversation={snapshot}
 onSaveReference={input=>controller.saveReferenceTurn({conversationId,...input})}/>}
 <aside role="region" aria-label="Testchatt"><h2>Chatten</h2>{snapshot.entries.map((entry,i)=><p key={i}>{'text' in entry?entry.text:''}</p>)}</aside></main></>
}
createRoot(document.getElementById('root')!).render(<App/>)
