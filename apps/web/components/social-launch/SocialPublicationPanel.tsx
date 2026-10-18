'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {SocialContentPost} from '@/lib/social-launch/content/types'
import type {PublicationView} from '@/lib/social-launch/publication/types'
import styles from './SocialPublicationPanel.module.css'
import {SocialReconciliationPanel} from './SocialReconciliationPanel'
const reasons:Record<string,string>={
 image_dimensions_not_supported:'Välj en JPEG-bild med bredd 320–1440 px och bildförhållande 0,8–1,91.',review_required:'Godkänn den sparade versionen först.',account_required:'Anslut projektets konto först.',destination_changed:'Kontot behöver kontrolleras igen.',plan_changed:'Granska inlägget mot den aktuella kanalplanen.',media_changed:'Bilden behöver granskas igen.',media_required:'Bifoga projektets bild först.',manual_time_required:'Ta bort önskad tid och granska versionen igen för att publicera nu.',time_passed:'Ta bort den passerade tiden och granska versionen igen.',format_not_supported:'Första versionen stöder Facebook-text/länk eller en JPEG-bild på Facebook och Instagram.',single_jpeg_required:'Välj en JPEG-bild, högst 8 MB, med bredd 320–1440 px och bildförhållande 0,8–1,91.',caption_too_long:'Instagram-texten får vara högst 2 200 tecken.',image_link_not_in_text:'Lägg länken i den granskade inläggstexten för bildinlägg.',stopped:'Projektet är pausat.',operator_required:'Publicering kräver plattformens operatör.',existing_request_changed:'Det finns redan ett publiceringsförsök för en tidigare version av detta utkast.'
}
const labels={requested:'Begärt – inget skickat ännu',creating:'Instagram tar emot bilden',processing:'Instagram bearbetar bilden',publishing:'Publiceringsförsöket pågår',published:'Publicerat',failed:'Försöket avslutades',uncertain:'Osäkert utfall'}
function safeLink(value:string|null|undefined){if(!value)return null;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['www.facebook.com','www.instagram.com'].includes(u.hostname)?u.href:null}catch{return null}}
type Props={projectId:string;post:SocialContentPost;disabled:boolean}
function Panel({projectId,post,disabled}:Props){
 const [model,setModel]=useState<PublicationView|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[needsRefresh,setNeedsRefresh]=useState(false),[formatError,setFormatError]=useState(false)
 const live=useRef(true),sequence=useRef(0),inFlight=useRef(false),controllers=useRef(new Set<AbortController>()),intent=useRef<Record<string,unknown>|null>(null)
 const accept=useCallback((v:PublicationView)=>{if(v.projectId!==projectId||v.postId!==post.id)throw Error('Publiceringsstatusen kunde inte bekräftas. Läs sparad status.');setModel(v)},[projectId,post.id])
 const load=useCallback(async()=>{
  if(inFlight.current)return
  const c=new AbortController(),n=++sequence.current;controllers.current.add(c);setLoading(true);setError('')
  try{const r=await fetch('/api/social-publications?'+new URLSearchParams({projectId,postId:post.id}),{cache:'no-store',signal:c.signal});const v=await r.json();if(!live.current||c.signal.aborted||n!==sequence.current)return;if(!r.ok)throw Error('Publiceringsstatusen kunde inte läsas. Försök läsa igen.');accept(v);setNeedsRefresh(false)}
  catch(e){if(live.current&&!c.signal.aborted&&n===sequence.current)setError(e instanceof Error?e.message:'Publiceringsstatusen kunde inte läsas.')}
  finally{controllers.current.delete(c);if(live.current&&n===sequence.current)setLoading(false)}
 },[projectId,post.id,accept])
 useEffect(()=>{live.current=true;const active=controllers.current;void load();return()=>{live.current=false;sequence.current++;active.forEach(c=>c.abort())}},[load])
 async function send(operation:'publish'|'check'){
  if(disabled||loading||busy||needsRefresh||formatError||inFlight.current||!model)return
  if(operation==='publish'&&(!confirmed||!model.canRequest||!post.decision||!post.revision.binding))return
  if(operation==='check'&&(!model.publication||model.publication.authoritySource==='scheduled'||model.blockers.includes('operator_required')))return
  const body=operation==='check'?{operation,projectId,postId:post.id,publicationId:model.publication!.id}:intent.current??{operation,projectId,postId:post.id,revisionId:post.revision.id,sha256:post.revision.sha256,decisionId:post.decision!.id,bindingId:post.revision.binding!.id,idempotencyKey:crypto.randomUUID(),confirmed:true}
  if(operation==='publish')intent.current=body
  inFlight.current=true;const c=new AbortController(),n=++sequence.current;controllers.current.add(c);setBusy(true);setError('')
  try{const r=await fetch('/api/social-publications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:c.signal});const v=await r.json();if(!live.current||c.signal.aborted||n!==sequence.current)return;if(!r.ok&&v.code==='UNSUPPORTED'){setFormatError(true);return}if(!r.ok)throw Error('Försöket kunde inte bekräftas. Läs sparad publiceringsstatus innan du fortsätter.');accept(v);setConfirmed(false)}
  catch(e){if(live.current&&!c.signal.aborted&&n===sequence.current){setNeedsRefresh(true);setError(e instanceof Error?e.message:'Svaret saknas. Läs sparad publiceringsstatus innan du fortsätter.')}}
  finally{controllers.current.delete(c);if(n===sequence.current){inFlight.current=false;if(live.current)setBusy(false)}}
 }
 const r=model?.publication,channel=model?.target?.channel==='instagram'?'Instagram':'Facebook',account=model?.target?.accountLabel??post.revision.binding?.label??post.revision.binding?.accountId??'det anslutna kontot'
 const blocked=disabled||loading||busy||needsRefresh||formatError,permalink=safeLink(r?.permalink)
 const mayCheck=r&&r.authoritySource!=='scheduled'&&['processing','creating','publishing','uncertain'].includes(r.state)&&!model?.blockers.includes('operator_required')
 return <section className={styles.panel} aria-label="Manuell publicering" aria-busy={busy||loading}>
  <h3>{r?.authoritySource==='scheduled'?'Publiceringskvitto för schemat':'Publicera granskad version'}</h3><p>Facebook-text/länk eller en JPEG-bild på Facebook och Instagram. Du bekräftar publicering nu här. En önskad tid i utkastet är inget publiceringsgodkännande.</p>
  {loading&&<p role="status">Läser sparad publiceringsstatus…</p>}
  {formatError&&<p className={styles.error} role="status">Bilden eller formatet kan inte publiceras. Välj en giltig JPEG-bild eller ett format som stöds, spara en ny version och granska den igen.</p>}
  {error&&<p className={styles.error} role="status">{error}</p>}
  {disabled&&<p>Spara och läs den senaste versionen innan du publicerar.</p>}
  {model&&<>{r?<div className={styles.receipt} role="status"><strong>{labels[r.state]}</strong><p>Konto: {r.accountLabel??r.accountId}</p>{r.revisionId!==post.revision.id&&<p>Kvittot gäller en tidigare version, inte den visade texten.</p>}
   {r.state==='published'&&<><p>{r.confirmation==='container_status'?'Instagram har bekräftat att behållaren publicerats. Inläggslänk saknas.':r.reconciledAt?'Publiceringen har verifierats mot det befintliga Facebook-inlägget.':'Kanalen har bekräftat publiceringen.'}</p>{permalink&&<a href={permalink} target="_blank" rel="noreferrer">Öppna publicerat inlägg</a>}</>}
   {r.state==='uncertain'&&<p>Kanalen kan redan ha publicerat inlägget. Kontrollera kontot innan du gör något mer.</p>}
   {r.state==='failed'&&<p>Kanalen avvisade försöket eller bilden kunde inte färdigställas. Detta utkast skickas inte igen.</p>}
   {r.state==='processing'&&<p>Kontrollera och slutför kan publicera samma godkända version när bilden är klar.</p>}
  </div>:<p>Mottagare: {account} · {channel}</p>}
  {model.blockers.filter(b=>b!=='already_requested').map(b=><p key={b}>{reasons[b]??'Inlägget behöver kontrolleras igen.'}</p>)}
  {model.canRequest&&r?.authoritySource!=='scheduled'&&<><label className={styles.confirm}><input type="checkbox" disabled={blocked} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Jag vill publicera den granskade versionen på {account} nu.</label><button type="button" disabled={blocked||!confirmed} onClick={()=>void send('publish')}>Publicera nu på {channel}</button></>}
  {r?.state==='uncertain'&&r.channel==='facebook'&&!model?.blockers.includes('operator_required')&&<SocialReconciliationPanel key={r.id+':'+r.version} projectId={projectId} postId={post.id} receipt={r} disabled={blocked} onComplete={()=>void load()}/>}
  {mayCheck&&<button type="button" disabled={blocked} onClick={()=>void send('check')}>{r.state==='processing'?'Kontrollera och slutför':'Kontrollera status'}</button>}
  </>}
  <button type="button" disabled={busy||loading} onClick={()=>void load()}>Läs sparad publiceringsstatus</button>
 </section>
}
export function SocialPublicationPanel(props:Props){return <Panel key={[props.projectId,props.post.id,props.post.revision.id,props.post.decision?.id].join(':')} {...props}/>}
