'use client'
import {useState,type FormEvent} from 'react'
import type {SalesContact} from '@/lib/sales/types'
import type {TimingReport,HistoryData,HistorySource,HistoryEvent} from '@/lib/sales/timing/types'
import {parseHistoryRevision,parseTimingRules} from '@/lib/sales/timing/validate'
import {formatTimingInstant,timingBlockerLabel} from '@/lib/sales/timing/view-model'
import styles from './SalesWorkspace.module.css'
const emptyHistory=():HistoryData=>({schemaVersion:1,contactVersions:[],history:'unknown',olderHistoryAttestation:null,sources:[],events:[],correctionOf:null,reviewNote:''})
const instant=(v:string|null|undefined)=>v?formatTimingInstant(v):'Okänt'
export function SalesContactTiming({projectId,contacts,initialTiming,onSaved}:{projectId:string;contacts:SalesContact[];initialTiming:TimingReport|undefined;onSaved:()=>Promise<void>}){
 const [report,setReport]=useState(initialTiming),[selected,setSelected]=useState(contacts[0]?.id??''),[editing,setEditing]=useState(false),[rulesOpen,setRulesOpen]=useState(false),[data,setData]=useState<HistoryData>(emptyHistory),[base,setBase]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[conflict,setConflict]=useState(false)
 const [days,setDays]=useState(String((initialTiming?.rules?.minWaitSeconds??1209600)/86400)),[maxReminders,setMaxReminders]=useState(String(initialTiming?.rules?.maxReminders??1)),[age,setAge]=useState(String((initialTiming?.rules?.maxSourceAgeSeconds??900)/60)),[ruleBase,setRuleBase]=useState<string|null>(initialTiming?.rules?.id??null)
 const c=contacts.find(x=>x.id===selected),t=report?.contacts.find(x=>x.contactId===selected)
 const history=report?.historyRevisions?.find(x=>x.id===t?.historyRevisionId)
 async function refresh(){setBusy(true);setError('');try{const r=await fetch('/api/sales/timing?projectId='+projectId,{cache:'no-store'});if(!r.ok)throw Error('Kontrollen kunde inte läsas. Historiken är okänd.');setReport(await r.json())}catch(e){setReport(undefined);setError(String(e instanceof Error?e.message:e))}finally{setBusy(false)}}
 function beginHistory(){if(!c)return;setData(history?structuredClone(history.data):emptyHistory());setBase(history?.id??null);setConflict(false);setError('');setMessage('');setEditing(true)}
 function beginRules(){setDays(String((report?.rules?.minWaitSeconds??1209600)/86400));setMaxReminders(String(report?.rules?.maxReminders??1));setAge(String((report?.rules?.maxSourceAgeSeconds??900)/60));setRuleBase(report?.rules?.id??null);setConflict(false);setError('');setRulesOpen(true)}
 async function save(value:unknown){setBusy(true);setError('');setMessage('');try{const r=await fetch('/api/sales/timing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});if(!r.ok){if(r.status===409){setConflict(true);throw Error('Underlaget har ändrats. Dina inmatningar är kvar. Hämta aktuell status och avbryt redigeringen innan du granskar den nya versionen.')}throw Error('Granskningen kunde inte sparas. Kontrollera tidsfönster, källor och obligatoriska fält.')}const result=await r.json();setReport(result.timing);setEditing(false);setRulesOpen(false);await onSaved();setMessage('Ny granskad version sparad. Kundutskick är inte aktiverade.')}catch(e){setError(e instanceof Error?e.message:'Kunde inte spara.')}finally{setBusy(false)}}
 function submitHistory(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!c||!report)return;try{const value=parseHistoryRevision({projectId,idempotencyKey:crypto.randomUUID(),expectedPreviousId:base,contactId:c.id,expectedContactVersion:c.version,data:{...data,contactVersions:contacts.filter(x=>x.email.trim().toLowerCase()===c.email.trim().toLowerCase()).map(x=>({id:x.id,version:x.version}))},confirmed:true});void save({operation:'save_history',...value})}catch{setError('Kontrollera alla källreferenser, fullständiga tider med Z/offset och klassificerade händelser. Äldre historik måste intygas för ”ingen tidigare kontakt”.')}}
 function submitRules(e:FormEvent<HTMLFormElement>){e.preventDefault();try{const value=parseTimingRules({projectId,idempotencyKey:crypto.randomUUID(),expectedPreviousId:ruleBase,minWaitSeconds:Number(days)*86400,maxReminders:Number(maxReminders),maxSourceAgeSeconds:Number(age)*60,confirmed:true});void save({operation:'save_rules',...value})}catch{setError('Reglerna får bara skärpas: minst 14 hela dygn, högst en påminnelse och högst 15 minuters källålder.')}}
 function source(i:number,key:keyof HistorySource,value:string){setData(d=>({...d,sources:d.sources.map((s,n)=>n===i?{...s,[key]:value}:s)}))}
 function event(i:number,patch:Partial<HistoryEvent>){setData(d=>({...d,events:d.events.map((s,n)=>n===i?{...s,...patch}:s)}))}
 return <details id="contact-timing" className={styles.disclosure}><summary><h2>Kontaktlogg och väntetider</h2><span>Granska vid behov</span></summary><div className={styles.disclosureBody}>
 <p>Kundutskick är inte aktiverade. En tidsgräns är ett underlag för granskning. Varje framtida mejl behöver granskas före utskick.</p>
 <p>Manuella mejl utanför Omnira måste tas med vid avstämningen. Sparade källreferenser bevisar inte leverans eller samtycke.</p>
 {error&&<p role="alert" className={styles.notice}>{error}</p>}{message&&<p role="status">{message}</p>}
 <button type="button" disabled={busy} onClick={()=>void refresh()}>Hämta aktuell status</button>
 {!report?<p>Kontrollen är inte tillgänglig. Historik och påminnelseantal är okända.</p>:<>
 <small>Kontrollerat {instant(report.evaluatedAt)}</small>
 <label className={styles.form}>Kontakt att granska<select value={selected} disabled={editing||busy} onChange={e=>{setSelected(e.target.value);setError('');setMessage('')}}>{contacts.map(x=><option key={x.id} value={x.id}>{x.companyName} {x.branchName} · {x.email}</option>)}</select></label>
 {c&&t&&<section className={styles.panel}>
 <h3>{c.companyName} {c.branchName}</h3><p>{t.recipient} · Kontaktversion {t.contactVersion}</p>
 <ul>{t.blockers.length?t.blockers.map(b=><li key={b}>{timingBlockerLabel(b)}</li>):<li>Underlaget tillåter förberedelse för granskning.</li>}</ul>
 <dl className={styles.metadata}><dt>Senast observerade utgående</dt><dd>{instant(t.latestObservedOutboundAt)}</dd><dt>Registrerade påminnelser</dt><dd>{t.reminderCount===null?'Okänt':t.reminderCount}</dd><dt>Tidigaste tidsgräns enligt underlaget</dt><dd>{t.intervalFloorAt?instant(t.intervalFloorAt):'Kan inte bestämmas'}</dd><dt>Källorna kontrollerade till</dt><dd>{instant(t.sourceThrough)}</dd><dt>Historikversion</dt><dd>{history?.version??'Saknas'}</dd><dt>Regelversion</dt><dd>{report.rules?.version??'Saknas'}</dd></dl>
 {history?.data.sources.map(s=><p key={s.sourceKey}>{s.channel} · {s.state} · {instant(s.since)} – {instant(s.through)}<br/>{s.reference}</p>)}
 <button type="button" disabled={busy||editing||rulesOpen} onClick={beginHistory}>Granska historik</button>
 {editing&&<form className={styles.form} onSubmit={submitHistory}>
 <label>Mottagare<input readOnly value={c.email}/></label>
 <label>Historikbedömning<select value={data.history} onChange={e=>setData({...data,history:e.target.value as HistoryData['history']})}><option value="unknown">Okänd historik</option><option value="owner_confirmed_none">Ingen tidigare kontakt, ägarbekräftat</option><option value="contacted">Tidigare kontakt</option></select></label>
 <label>Intyg om äldre historik<textarea maxLength={500} value={data.olderHistoryAttestation??''} onChange={e=>setData({...data,olderHistoryAttestation:e.target.value||null})}/></label>
 <label>Granskningsnotering<textarea required maxLength={500} value={data.reviewNote} onChange={e=>setData({...data,reviewNote:e.target.value})}/></label>
 <h4>Källor och faktiskt kontrollerade tidsfönster</h4>
 {data.sources.map((s,i)=><fieldset key={i}><legend>Källa {i+1}</legend>
 <label>Källnyckel<input required value={s.sourceKey} onChange={e=>source(i,'sourceKey',e.target.value)}/></label>
 <label>Kanal<select value={s.channel} onChange={e=>source(i,'channel',e.target.value)}>{['strato_sent','strato_inbox','resend','operator'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>Källstatus<select value={s.state} onChange={e=>source(i,'state',e.target.value)}><option value="gap">Lucka</option><option value="failed">Kontrollen misslyckades</option><option value="complete">Hela angivna fönstret kontrollerat</option></select></label>
 {([['identityRef','Konto eller källidentitet'],['scopeRef','Kontrollerat urval'],['since','Från, RFC3339 med Z/offset'],['through','Till, RFC3339 med Z/offset'],['observedAt','Avstämt, RFC3339 med Z/offset'],['reference','Referens till underlag']] as const).map(([k,label])=><label key={k}>{label}<input required maxLength={500} value={s[k]} onChange={e=>source(i,k,e.target.value)}/></label>)}
 <button type="button" onClick={()=>setData({...data,sources:data.sources.filter((_,n)=>n!==i)})}>Ta bort källa {i+1}</button></fieldset>)}
 <button type="button" disabled={data.sources.length>=8} onClick={()=>setData({...data,sources:[...data.sources,{sourceKey:'',channel:'strato_sent',identityRef:'',scopeRef:'',since:'',through:'',observedAt:'',state:'gap',reference:''}]})}>Lägg till källa</button>
 <h4>Mejlhändelser</h4>
 {data.events.map((v,i)=><fieldset key={v.id}><legend>Händelse {i+1}</legend><small>{v.id}</small>
 <label>Tidpunkt med Z/offset<input required value={v.occurredAt} onChange={e=>event(i,{occurredAt:e.target.value})}/></label>
 <label>Riktning<select value={v.direction} onChange={e=>event(i,{direction:e.target.value as HistoryEvent['direction']})}><option value="outbound">Utgående</option><option value="inbound">Inkommande</option></select></label>
 <label>Utfall<select value={v.outcome} onChange={e=>event(i,{outcome:e.target.value as HistoryEvent['outcome']})}>{['accepted','delivery_unknown','failed_before_send','received','bounced','unsubscribed'].map(k=><option key={k}>{k}</option>)}</select></label>
 <label>Typ<select value={v.kind} onChange={e=>event(i,{kind:e.target.value as HistoryEvent['kind']})}>{['unclassified','initial','reminder','requested_reply'].map(k=><option key={k}>{k}</option>)}</select></label>
 <label>Källnycklar, separera med komma<input required value={v.sourceRefs.join(',')} onChange={e=>event(i,{sourceRefs:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}/></label>
 {v.providerRefs.map((p,n)=><div key={n}><label>Leverantörens källnyckel<input required value={p.sourceKey} onChange={e=>event(i,{providerRefs:v.providerRefs.map((x,j)=>j===n?{...x,sourceKey:e.target.value}:x)})}/></label><label>Leverantörens mejl-ID<input required value={p.id} onChange={e=>event(i,{providerRefs:v.providerRefs.map((x,j)=>j===n?{...x,id:e.target.value}:x)})}/></label></div>)}
 <button type="button" disabled={v.providerRefs.length>=8} onClick={()=>event(i,{providerRefs:[...v.providerRefs,{sourceKey:'',id:''}]})}>Lägg till leverantörsreferens</button>
 {(['invitationId','inReplyToEventId','reviewedDuplicateOf'] as const).map((k)=><label key={k}>{k==='invitationId'?'Inbjudans-ID':k==='inReplyToEventId'?'Svar på händelse-ID':'Granskad dubblett av händelse-ID'}<input value={v[k]??''} onChange={e=>event(i,{[k]:e.target.value||null})}/></label>)}
 <button type="button" onClick={()=>setData({...data,events:data.events.filter((_,n)=>n!==i)})}>Ta bort händelse {i+1}</button></fieldset>)}
 <button type="button" disabled={data.events.length>=100} onClick={()=>setData({...data,events:[...data.events,{id:crypto.randomUUID(),sourceRefs:[],providerRefs:[{sourceKey:'',id:''}],occurredAt:'',direction:'outbound',outcome:'delivery_unknown',kind:'unclassified',invitationId:null,inReplyToEventId:null,reviewedDuplicateOf:null}]})}>Lägg till mejlhändelse</button>
 {base&&<label className={styles.check}><input type="checkbox" checked={data.correctionOf===base} onChange={e=>setData({...data,correctionOf:e.target.checked?base:null})}/>Detta är en uttrycklig rättelse av föregående historikversion.</label>}
 <label className={styles.check}><input type="checkbox" required/>Jag har granskat historik, källor och faktiskt kontrollerade tidsfönster.</label>
 <button disabled={busy||conflict}>Spara historikversion</button><button type="button" disabled={busy} onClick={()=>{setEditing(false);setConflict(false);setError('')}}>Avbryt historikgranskning</button>
 </form>}
 </section>}
 <section className={styles.panel}><h3>Regler för förberedelse</h3><p>Grundförslag: 14 × 24 timmar från senaste utgående mejl, högst en obesvarad påminnelse inklusive tidigare skickade och källor avstämda högst 15 minuter tidigare.</p><p>{report.rules?'En ägargranskad regelversion finns.':'Ingen ägargranskad regelversion är sparad.'}</p>
 <button type="button" disabled={busy||editing||rulesOpen} onClick={beginRules}>Granska regler</button>
 {rulesOpen&&<form className={styles.form} onSubmit={submitRules}>
 <label>Minsta väntetid i hela dygn<input type="number" min={14} max={24855} step={1} required value={days} onChange={e=>setDays(e.target.value)}/></label>
 <label>Högsta antal obesvarade påminnelser<input type="number" min={0} max={1} step={1} required value={maxReminders} onChange={e=>setMaxReminders(e.target.value)}/></label>
 <label>Högsta källålder i minuter<input type="number" min={1/60} max={15} step={1/60} required value={age} onChange={e=>setAge(e.target.value)}/></label>
 <label className={styles.check}><input type="checkbox" required/>Jag bekräftar dessa regler för förberedelse</label>
 <button disabled={busy||conflict}>Spara regelversion</button><button type="button" disabled={busy} onClick={()=>{setRulesOpen(false);setConflict(false);setError('')}}>Avbryt regelgranskning</button>
 </form>}</section>
 </>}
 </div></details>
}
