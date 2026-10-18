'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {SocialContentPost} from '@/lib/social-launch/content/types'
import {stockholmLocal} from '@/lib/social-launch/content/validate'
import type {ScheduleBatchView,ScheduleManifest,ScheduleItem,MonthlyRule} from '@/lib/social-launch/scheduling/types'
import type {ScheduleWorkspaceView} from '@/lib/social-launch/scheduling/store'
import type {monthlyPlanningSlots} from '@/lib/social-launch/scheduling/planning'
import type {ScheduleReadiness} from '@/lib/social-launch/scheduling/readiness'
import styles from './SocialSchedulePanel.module.css'
type View=ScheduleWorkspaceView&{canManage:boolean;dispatchEnabled:boolean;monthlySlots:ReturnType<typeof monthlyPlanningSlots>}
type Props={projectId:string;posts:SocialContentPost[];disabled:boolean}
const labels:Record<string,string>={queued:'Väntar på publiceringstid',claimed:'Körning pågår',waiting:'Väntar på nästa kontroll',published:'Publicerat',failed:'Försöket avslutades',uncertain:'Osäkert utfall – kontrollera kontot',blocked:'Stoppat – behöver granskas',cancelled:'Återkallat',missed:'Missad publiceringstid'}
const rule=(enabled:boolean):MonthlyRule=>({dayOfMonth:1,localTime:'20:30',timeZone:'Europe/Stockholm',channels:['facebook','instagram'],enabled})
function channel(value:string){return value==='instagram'?'Instagram':'Facebook'}
function date(value:string){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
function month(value:string){return new Intl.DateTimeFormat('sv-SE',{timeZone:'UTC',year:'numeric',month:'long'}).format(new Date(value+'-01T12:00:00Z'))}
function link(value:string|null|undefined){try{const u=new URL(value??'');return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['www.facebook.com','www.instagram.com'].includes(u.hostname)?u.href:null}catch{return null}}
function readinessLabel(code:string){
 const [key,value]=code.split(':')
 const labels:Record<string,string>={runner_unverified:'Schemakörningen behöver verifieras.',dispatch_disabled:'Automatiken är avstängd.',no_approved_batch:'Nästa publiceringsomgång behöver granskas och godkännas.',review_required:'Innehållet har ändrats och behöver granskas igen.',receipt_recovery_required:'Ett tidigare publiceringsutfall behöver bekräftas.',binding_changed:'Kontot har ändrats sedan godkännandet.',binding_unverified:'Kontot kunde inte verifieras just nu.',monthly_content_missing:'Månadens smygtitt behöver förberedas och godkännas.',release_evidence_missing:'Månadens kundåtkomst behöver bekräftas inom ett dygn före publiceringen.',queue_stopped:'Publiceringen är pausad.',queue_expired:'En publiceringstid har passerat.',queue_review_required:'Nästa inlägg behöver granskas igen.',queue_release_required:'Nästa smygtitt väntar på bekräftad kundåtkomst.'}
 return (labels[key]??'Schemat behöver kontrolleras igen.')+(value?' ('+(['facebook','instagram'].includes(value)?channel(value):value)+')':'')
}
function buildManifest(projectId:string,posts:SocialContentPost[]):ScheduleManifest{
 const occasions=new Map<string,string>(),seen=new Set<string>()
 const items=[...posts].sort((a,b)=>(a.revision.draft.scheduledAt??'').localeCompare(b.revision.draft.scheduledAt??'')||a.revision.draft.channel.localeCompare(b.revision.draft.channel)).map(post=>{
  const r=post.revision,t=r.draft.scheduledAt,b=r.binding,a=r.media[0]
  if(!t||!post.decision||post.decision.decision!=='approve'||!b||r.media.length!==1||a.mimeType!=='image/jpeg'||!['facebook','instagram'].includes(r.draft.channel))throw Error('Varje inlägg behöver en granskad tid, ett konto och en JPEG-bild.')
  const key=t+':'+r.draft.channel;if(seen.has(key))throw Error('Välj högst ett inlägg per kanal och tillfälle.');seen.add(key)
  if(!occasions.has(t))occasions.set(t,crypto.randomUUID())
  return {postId:post.id,revisionId:r.id,sha256:r.sha256,decisionId:post.decision.id,planRevisionId:r.planRevisionId,bindingId:b.id,accountId:b.accountId,channel:r.draft.channel as 'facebook'|'instagram',asset:{id:a.id,sha256:a.sha256},localMinute:stockholmLocal(t),scheduledAt:t,expiresAt:new Date(Date.parse(t)+600000).toISOString(),occasionId:occasions.get(t)!,kind:'ordinary' as const,releaseCondition:null}
 })
 if(items.length<1||items.length>6)throw Error('Välj mellan ett och sex inlägg.')
 return {projectId,items}
}
function Workspace({projectId,posts,disabled}:Props){
 const [model,setModel]=useState<View|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[needsRefresh,setNeedsRefresh]=useState(false)
 const [selected,setSelected]=useState<string[]>([]),[confirmed,setConfirmed]=useState<Record<string,boolean>>({}),[loaded,setLoaded]=useState<Record<string,boolean>>({}),[generation,setGeneration]=useState(0)
 const [readiness,setReadiness]=useState<ScheduleReadiness|null>(null)
 const [releaseUrls,setReleaseUrls]=useState<Record<string,string>>({}),[releaseChecks,setReleaseChecks]=useState<Record<string,boolean>>({})
 const live=useRef(true),flight=useRef(false),controllers=useRef(new Set<AbortController>()),sequence=useRef(0),pending=useRef<{key:string;body:Record<string,unknown>}|null>(null)
 const sourceSignature=posts.map(p=>p.id+':'+p.revision.id+':'+p.revision.sha256+':'+(p.decision?.id??'')).join('|')
 useEffect(()=>{setConfirmed({});setSelected([]);setReadiness(null);pending.current=null},[sourceSignature,disabled])
 const accept=useCallback(async(signal:AbortSignal,n:number)=>{
  const r=await fetch('/api/social-schedules?'+new URLSearchParams({projectId}),{cache:'no-store',signal}),v=await r.json()
  if(!r.ok||v.projectId!==projectId)throw Error('Schemat kunde inte läsas. Försök läsa igen.')
  if(!live.current||signal.aborted||n!==sequence.current)return
  setReadiness(null);setModel(v);setNeedsRefresh(false);setLoaded({});setConfirmed({});setGeneration(g=>g+1)
 },[projectId])
 const load=useCallback(async()=>{
  if(flight.current)return
  const c=new AbortController(),n=++sequence.current;controllers.current.add(c);setLoading(true);setError('')
  try{await accept(c.signal,n)}catch(e){if(live.current&&!c.signal.aborted)setError((e as Error).message)}
  finally{controllers.current.delete(c);if(live.current&&n===sequence.current)setLoading(false)}
 },[accept])
 useEffect(()=>{live.current=true;void load();const active=controllers.current;return()=>{live.current=false;sequence.current++;active.forEach(c=>c.abort())}},[load])
 async function act(operation:string,input:Record<string,unknown>,intentKey?:string){
  if(flight.current||loading||!model?.canManage||needsRefresh||!['revoke','readiness'].includes(operation)&&disabled)return
  const key=intentKey??JSON.stringify({operation,...input})
  if(pending.current?.key!==key)pending.current={key,body:{operation,...input,...(['propose','approve'].includes(operation)?{idempotencyKey:crypto.randomUUID()}:{})}}
  const body=pending.current.body,c=new AbortController(),n=++sequence.current
  flight.current=true;controllers.current.add(c);setBusy(true);setError('')
  try{
   const r=await fetch('/api/social-schedules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:c.signal}),value=await r.json()
   if(!live.current||c.signal.aborted||n!==sequence.current)return
   if(!r.ok)throw Error(r.status===409?'Innehållet, tiden eller kontot har ändrats. Läs schemat och granska den senaste versionen igen.':'Ändringen kunde inte bekräftas. Läs sparat schema innan du fortsätter.')
   if(operation==='readiness'){pending.current=null;setReadiness(value);return}
   pending.current=null;setSelected([]);setReleaseChecks({});await accept(c.signal,n)
  }catch(e){if(live.current&&!c.signal.aborted&&n===sequence.current){setNeedsRefresh(true);setConfirmed({});setError((e as Error).message)}}
  finally{controllers.current.delete(c);if(n===sequence.current){flight.current=false;if(live.current)setBusy(false)}}
 }
 function prepare(){
  try{
   const chosen=posts.filter(p=>selected.includes(p.id)),key='propose:'+chosen.map(p=>p.id+':'+p.revision.sha256).sort().join(',')
   const manifest=pending.current?.key===key?pending.current.body.manifest as ScheduleManifest:buildManifest(projectId,chosen)
   void act('propose',{projectId,manifest,expectedRevisionId:null},key)
  }catch(e){setError((e as Error).message)}
 }
 const blocked=busy||loading||disabled||needsRefresh||!model?.canManage
 const reserved=(post:SocialContentPost)=>model?.batches.some(b=>b.jobs.some(j=>j.postId===post.id&&(j.publicationId!==null||b.manifest.items.some(i=>i.postId===post.id&&i.revisionId===post.revision.id))))
 const eligible=posts.filter(p=>p.status==='approved'&&p.decision?.decision==='approve'&&p.revision.draft.scheduledAt&&Date.parse(p.revision.draft.scheduledAt)>Date.now()&&p.revision.media.length===1&&p.revision.media[0].mimeType==='image/jpeg'&&!reserved(p))
 function imageKey(batch:ScheduleBatchView,item:ScheduleItem){return [batch.revisionId,item.postId,item.revisionId,item.asset.sha256,generation].join(':')}
 function current(batch:ScheduleBatchView){
  return batch.reviewCurrent!==false&&batch.manifest.items.every(i=>{const p=posts.find(p=>p.id===i.postId);return p?.status==='approved'&&p.revision.id===i.revisionId&&p.revision.sha256===i.sha256&&p.decision?.id===i.decisionId&&p.revision.binding?.id===i.bindingId&&p.revision.binding?.accountId===i.accountId&&p.revision.draft.scheduledAt===i.scheduledAt&&Date.parse(i.scheduledAt)>Date.now()})
 }
 return <section id="schedule" className={styles.panel} aria-label="Veckans publiceringsschema" aria-busy={busy||loading}>
  <header><div><span className={styles.eyebrow}>PUBLICERINGSPLAN</span><h3>Granska veckan, sedan sköter kön tiderna</h3></div><button disabled={busy||loading} onClick={()=>void load()}>Läs sparat schema</button></header>
  <p>Varje godkännande gäller bilderna, texterna, kontona och tiderna som visas här. Alla tider är svensk tid.</p>
  {loading&&<p role="status">Läser schemat…</p>}{error&&<p role="status" className={styles.notice}>{error}</p>}
  {disabled&&<p className={styles.notice}>Ändringen behöver sparas och granskas igen innan schemat kan godkännas.</p>}
  {model&&!model.dispatchEnabled&&<p className={styles.notice}>Automatiken är avstängd. Godkända inlägg väntar tills aktiveringen är klar.</p>}
  {model&&!model.canManage&&<p>Du kan läsa schemat. Godkännande kräver projektets operatör.</p>}
  {model?.canManage&&<div className={styles.notice}><button disabled={busy||loading||needsRefresh} onClick={()=>void act('readiness',{projectId})}>Kontrollera schemat utan publicering</button>
   {readiness&&<div role="status"><p><strong>{readiness.ready?'Kontrollen är godkänd just nu.':'Detta återstår före automatisk publicering:'}</strong></p><ul>{readiness.blockers.map(code=><li key={code}>{readinessLabel(code)}</li>)}</ul><p>Kontrollerat {date(readiness.checkedAt)}. Inga inlägg skickades och inga publiceringsjobb startades.</p></div>}
  </div>}

  {model&&<><details className={styles.prepare}><summary>Förbered en vecka från granskade utkast</summary>
   <p>Välj inlägg som har en godkänd bild, text och önskad tid. Ett sparat förslag publicerar inget.</p>
   {!eligible.length&&<p>Sätt önskad tid i utkastet och granska innehållet. Då kan det väljas här.</p>}
   {eligible.map(p=><label key={p.id}><input type="checkbox" disabled={blocked} checked={selected.includes(p.id)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id));pending.current=null}}/>{p.revision.draft.title} · {channel(p.revision.draft.channel)} · {date(p.revision.draft.scheduledAt!)}</label>)}
   <button disabled={blocked||!selected.length||selected.length>6} onClick={prepare}>Förbered valda inlägg för granskning</button>
  </details>
  {!model.batches.length&&<p>Ingen vecka är förberedd ännu. De kommande månadssmygtittarna syns nedan.</p>}
  {model.batches.map(batch=>{
   const isCurrent=current(batch),review=batch.review??[],complete=review.length===batch.manifest.items.length&&review.every(r=>r.revision?.id===r.item.revisionId&&r.revision.sha256===r.item.sha256&&loaded[imageKey(batch,r.item)])
   const ready=isCurrent&&complete&&!blocked,conditions=[...new Map(batch.manifest.items.filter(i=>i.releaseCondition).map(i=>[i.releaseCondition!.releaseMonth+':'+i.releaseCondition!.catalogSha256,i.releaseCondition!])).entries()]
   return <article key={batch.revisionId} className={styles.batch} aria-label="Granska veckans exakta inlägg">
    <div className={styles.batchHeader}><h4>{batch.status==='proposal'?'Vecka att granska':batch.status==='approved'?'Godkänd vecka':'Återkallad vecka'}</h4><span>{batch.manifest.items.length} inlägg</span></div>
    {batch.status==='proposal'&&!isCurrent&&<p className={styles.notice}>Granskningen är inaktuell. Läs senaste utkasten och förbered veckan igen.</p>}
    {batch.status==='approved'&&batch.reviewCurrent===false&&batch.jobs.some(j=>['queued','claimed','waiting'].includes(j.state))&&<p className={styles.notice}>Innehållet behöver granskas igen innan fler inlägg kan skickas.</p>}
    <div className={styles.cards}>{review.map(({item,revision})=><section className={styles.card} key={item.postId}>
     <h5>{channel(item.channel)} · {date(item.scheduledAt)}</h5><p className={styles.account}>Konto: {revision?.binding?.label??item.accountId}</p>
     {item.kind==='month_release'&&<p className={styles.monthTag}>Ny månad: {month(item.releaseCondition!.releaseMonth)}</p>}
     {revision?<><p className={styles.caption}>{revision.draft.text}</p><img key={imageKey(batch,item)} alt={'Bilden som publiceras på '+channel(item.channel)} src={'/api/social-content/media?'+new URLSearchParams({projectId,assetId:item.asset.id,sha256:item.asset.sha256})} onLoad={()=>setLoaded(v=>({...v,[imageKey(batch,item)]:true}))} onError={()=>setLoaded(v=>({...v,[imageKey(batch,item)]:false}))}/></>:<p>Innehållet saknas. Veckan kan inte godkännas.</p>}
    </section>)}</div>
    {review.length===0&&<p>De exakta versionerna måste läsas innan veckan kan godkännas.</p>}
    {conditions.map(([key,c])=><div key={key} className={styles.condition}><p><strong>Villkor för {month(c.releaseMonth)}:</strong> Inlägget skickas bara om kundåtkomsten till denna månad har bekräftats det senaste dygnet. Om bekräftelsen saknas väntar det högst tio minuter efter tiden och markeras sedan som missat.</p>
     {batch.status==='approved'&&<><label>Kundvy för {month(c.releaseMonth)}<input type="url" disabled={blocked} placeholder="https://familje-stunden.se/…" value={releaseUrls[key]??''} onChange={e=>setReleaseUrls(v=>({...v,[key]:e.target.value}))}/></label><label><input type="checkbox" disabled={blocked} checked={releaseChecks[key]??false} onChange={e=>setReleaseChecks(v=>({...v,[key]:e.target.checked}))}/>Jag har öppnat kundvyn och kan använda innehållet för {month(c.releaseMonth)}.</label><button disabled={blocked||!releaseChecks[key]||!releaseUrls[key]} onClick={()=>void act('release_confirm',{projectId,...c,customerViewUrl:releaseUrls[key],confirmed:true})}>Bekräfta kundåtkomst för {month(c.releaseMonth)}</button>{model.releaseEvidence.filter(e=>e.releaseMonth===c.releaseMonth&&e.catalogSha256===c.catalogSha256).slice(0,1).map(e=><p key={e.id}>Du bekräftade kundåtkomsten {date(e.verifiedAt)}.</p>)}</>}
    </div>)}
    {batch.status==='proposal'&&<div className={styles.approve}>
     {!complete&&<p>Alla exakta texter och bilder måste kunna visas före godkännande.</p>}
     <label><input type="checkbox" checked={confirmed[batch.revisionId]??false} disabled={!ready} onChange={e=>setConfirmed(v=>({...v,[batch.revisionId]:e.target.checked}))}/>Jag har granskat veckans bilder, texter, konton och tider.</label>
     <button className={styles.primary} disabled={!ready||!confirmed[batch.revisionId]} onClick={()=>void act('approve',{projectId,batchId:batch.batchId,revisionId:batch.revisionId,sha256:batch.sha256,confirmed:true})}>Godkänn och schemalägg veckans inlägg</button>
    </div>}
    {batch.jobs.length>0&&<ul className={styles.jobs}>{batch.jobs.map(j=><li key={j.id}><span>{channel(j.channel)} · {date(j.scheduledAt)}</span><strong>{j.reason==='release_required'?'Väntar på bekräftad kundåtkomst':labels[j.state]??j.state}</strong>{link(j.permalink)&&<a href={link(j.permalink)!} target="_blank" rel="noreferrer">Öppna publicerat inlägg</a>}</li>)}</ul>}
    {batch.status==='approved'&&<button disabled={busy||loading||needsRefresh||!model.canManage} onClick={()=>void act('revoke',{projectId,batchId:batch.batchId,expectedVersion:batch.version})}>Återkalla kommande publiceringar</button>}
   </article>
  })}
  <section className={styles.monthly} aria-label="Kommande månadssmygtittar"><h4>En smygtitt den 1:a varje månad</h4><p>Kl. 20.30 på Facebook och Instagram, med Nova och Pling och en titt på månadens riktiga innehåll.</p>
   <label><input type="checkbox" disabled={blocked} checked={model.monthlyRule?.enabled??false} onChange={e=>void act('monthly_rule_save',{projectId,rule:rule(e.target.checked)})}/>Planera en smygtitt den 1:a varje månad</label><p>Regeln förbereder platser i planen. Varje månads innehåll granskas och godkänns separat.</p>
   <ol>{model.monthlySlots.map(slot=><li key={slot.releaseMonth}><div><strong>{month(slot.releaseMonth)}</strong><time dateTime={slot.scheduledAt}>{date(slot.scheduledAt)}</time></div><span>{slot.status==='unprepared'?'Innehåll saknas – inget schemalagt':slot.status==='needs_review'?'Behöver granskas igen före publicering':slot.status==='partial'?'En kanal återstår – månaden är inte färdig':slot.status==='proposal'?'Förslag att granska':'Godkänt – kundåtkomst krävs vid publicering'}</span></li>)}</ol>
  </section></>}
 </section>
}
export function SocialSchedulePanel(props:Props){return <Workspace key={props.projectId} {...props}/>}
