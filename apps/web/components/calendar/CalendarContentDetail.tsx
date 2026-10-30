'use client';
import {useEffect,useState} from 'react';
import type {CalendarSourceRef} from '@/lib/calendar/types';
import type {CalendarDetail} from '@/lib/calendar/detail';
import {ReviewContentPreview} from '../review-content/ReviewContentPreview';
import styles from './Calendar.module.css';
const names={facebook:'Facebook',instagram:'Instagram',youtube:'YouTube'};
export function CalendarContentDetail({source,userId}:{source:CalendarSourceRef;userId:string}){
 const key=userId+':'+JSON.stringify(source),[attempt,setAttempt]=useState(0),[result,setResult]=useState<{key:string;detail?:CalendarDetail;error?:string}|null>(null);
 useEffect(()=>{
  let active=true;const controller=new AbortController();setResult(null);
  void fetch('/api/calendar/detail?source='+encodeURIComponent(JSON.stringify(source)),{cache:'no-store',signal:controller.signal}).then(async response=>{
   const value=await response.json();if(!response.ok||value.ok!==true||!value.detail?.content||JSON.stringify(value.detail.source)!==JSON.stringify(source))throw Error(value.code==='CONFLICT'?'CONFLICT':'UNAVAILABLE');
   if(active)setResult({key,detail:value.detail});
  }).catch(error=>{if(active&&!controller.signal.aborted)setResult({key,error:error.message==='CONFLICT'?'Underlaget har ändrats. Läs om veckan och öppna posten igen.':'Innehållet kunde inte läsas. Försök igen.'});});
  return()=>{active=false;controller.abort();};
 },[key,attempt]); // Source and account identity are encoded in key; retries keep that identity.
 if(!result||result.key!==key)return <p role="status">Läser innehållet…</p>;
 if(result.error)return <div role="alert"><p>{result.error}</p><button type="button" className={styles.secondaryButton} onClick={()=>setAttempt(n=>n+1)}>Försök igen</button></div>;
 const detail=result.detail!;
 return <section aria-label="Granskningsinnehåll" className={styles.contentDetail}>
  <ReviewContentPreview content={detail.content}/>
  {detail.channelStates&&<ul className={styles.detailChannels}>{detail.channelStates.map(c=><li key={c.channel}><span className={styles.statusDot} data-tone={c.tone} aria-hidden="true"/><span><strong>{names[c.channel]}</strong> · {c.label}{c.bindingWarning&&c.bindingWarning!==c.label&&<small>{c.bindingWarning}</small>}</span></li>)}</ul>}
 </section>;
}
