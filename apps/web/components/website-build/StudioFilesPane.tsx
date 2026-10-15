'use client'
import {useEffect,useState} from 'react'
import type {BuildSessionView,WebsiteArtifact} from '@/lib/website-build/types'
export function StudioFilesPane({session,revisionId}:{session:BuildSessionView|null;revisionId:string|null}){
 const id=revisionId??session?.activePreviewRevisionId??null,[state,setState]=useState<{id:string;files:string[];error:boolean}|null>(null)
 useEffect(()=>{if(!session||!id)return;const abort=new AbortController();let current=true;setState(null);void fetch('/api/website-builds/'+session.sessionId+'/revisions/'+id+'?projectId='+session.projectId,{signal:abort.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const a:WebsiteArtifact=await r.json();if(current)setState({id,files:a.files.map(f=>f.path),error:false})}).catch(()=>{if(current)setState({id,files:[],error:true})});return()=>{current=false;abort.abort()}},[session?.sessionId,session?.projectId,id])
 if(!session||!id)return <section><h2>Projektets filer</h2><p>Sidfilerna visas när Atlas har sparat den första versionen. Planer och bilder samlas i samma projekt.</p><p>Lokala filer väntar på en verifierad datoranslutning.</p></section>
 return <section><h2>Sparade sidfiler</h2>{state?.id===id?state.error?<p role="alert">Filerna kunde inte läsas. Öppna fliken igen för att försöka på nytt.</p>:<ul>{state.files.map(path=><li key={path}><code>{path}</code></li>)}</ul>:<p role="status">Läser projektets filer…</p>}<a href={'/api/website-builds/'+session.sessionId+'/revisions/'+id+'/export?projectId='+session.projectId}>Hämta projektpaketet</a><p>Lokala filer väntar på en verifierad datoranslutning.</p></section>
}
