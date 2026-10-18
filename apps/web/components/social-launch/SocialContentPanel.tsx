'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {SOCIAL_LAUNCH_CHANNELS} from '@/lib/social-launch/catalog'
import {parseSocialContent,stockholmToUtc,stockholmLocal} from '@/lib/social-launch/content/validate'
import type {SocialContentInput,SocialContentView,SocialContentPost} from '@/lib/social-launch/content/types'
import {SocialSchedulePanel} from './SocialSchedulePanel'
import {FAMILY_SOCIAL_PROJECT_ID} from '@/lib/social-launch/scheduling/policy'
import {SocialPublicationPanel} from './SocialPublicationPanel'
import styles from './SocialContentPanel.module.css'
const formats={text:'Text',image:'Bild',video:'Video',link:'Länk'}
const statuses={proposal:'Förslag att granska',approved:'Innehållet godkänt',rejected:'Avvisat innehåll',needs_review:'Behöver granskas igen'}
const reasons:Record<string,string>={activation_required:'Separat publiceringsgodkännande krävs',account_required:'Väntar på kontokoppling',plan_changed:'Kanalplanen har ändrats',destination_changed:'Mottagarkontot har ändrats eller blockerats',media_changed:'Bifogat material har ändrats',time_passed:'Önskad tid har passerat – inget skickades',media_required:'Bifoga projektets bild eller video före granskning.'}
type Editor={postId:string;expectedRevisionId:string|null;draft:SocialContentInput;localTime:string}
function empty(channel:SocialContentInput['channel']='facebook',format:SocialContentInput['format']='text'):SocialContentInput{return {channel,format,title:'',text:'',linkUrl:null,mediaIds:[],mediaBrief:'',scheduledAt:null}}
function mediaUrl(projectId:string,id:string,sha:string){return '/api/social-content/media?'+new URLSearchParams({projectId,assetId:id,sha256:sha})}
function Workspace({projectId,projectName,onPlanRequested,planStateKey}:{projectId:string;projectName:string;onPlanRequested?:()=>void;planStateKey?:string}){
 const [model,setModel]=useState<SocialContentView|null>(null),[editor,setEditor]=useState<Editor|null>(null),[selectedId,setSelectedId]=useState<string|null>(null)
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[stale,setStale]=useState(false)
 const [loaded,setLoaded]=useState<Record<string,boolean>>({})
 const responseSequence=useRef(0),writeInFlight=useRef(false),observedPlan=useRef(planStateKey)
 const live=useRef(true),controllers=useRef(new Set<AbortController>()),pending=useRef<{signature:string;body:Record<string,unknown>}|null>(null)
 const selected=model?.posts.find(p=>p.id===selectedId)??null
 const load=useCallback(async()=>{
  if(writeInFlight.current)return
  const sequence=++responseSequence.current
  const c=new AbortController();controllers.current.add(c);setLoading(true);setError('')
  try{const r=await fetch('/api/social-content?projectId='+encodeURIComponent(projectId),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('Innehållet kunde inte läsas. Försök igen.');const v=await r.json() as SocialContentView;if(!live.current||c.signal.aborted||sequence!==responseSequence.current)return;if(v.project.id!==projectId)throw Error('Svaret gäller ett annat projekt.');setModel(v);setStale(false)}
  catch(e){if(live.current&&!c.signal.aborted&&sequence===responseSequence.current)setError(e instanceof Error?e.message:'Innehållet kunde inte läsas.')}
  finally{controllers.current.delete(c);if(live.current&&sequence===responseSequence.current)setLoading(false)}
 },[projectId])
 useEffect(()=>{if(!busy&&!writeInFlight.current&&observedPlan.current!==planStateKey){observedPlan.current=planStateKey;void load()}},[planStateKey,busy,load])
 useEffect(()=>{live.current=true;const active=controllers.current;void load();return()=>{live.current=false;responseSequence.current++;active.forEach(c=>c.abort())}},[load])
 function change(patch:Partial<SocialContentInput>){setEditor(e=>e?{...e,draft:{...e.draft,...patch}}:e);setDirty(true);pending.current=null}
 function edit(post?:SocialContentPost){
  if(dirty&&!window.confirm('Ersätt dina osparade ändringar?'))return
  const choice=model?.plannedChannels[0]
  setSelectedId(post?.id??null);setEditor({postId:post?.id??crypto.randomUUID(),expectedRevisionId:post?.revision.id??null,draft:post?{...post.revision.draft,mediaIds:[...post.revision.draft.mediaIds]}:empty(choice?.channel,choice?.format),localTime:post?.revision.draft.scheduledAt?stockholmLocal(post.revision.draft.scheduledAt):''})
  setDirty(!post);setError('');setStale(false);pending.current=null
 }
 async function send(operation:'propose'|'decide',decision?:'approve'|'reject'){
  if(!model||busy||loading||writeInFlight.current)return
  let input:Record<string,unknown>
  try{
   if(operation==='propose'){
    if(!editor||!model.currentPlanRevisionId)return
    let scheduledAt:string|null=null
    if(editor.localTime){try{scheduledAt=stockholmToUtc(editor.localTime)}catch{throw Error('Tiden finns inte eller är tvetydig vid sommartidsbytet. Välj en annan tid. Ditt utkast finns kvar.')}}
    let draft:SocialContentInput
    try{draft=parseSocialContent({...editor.draft,scheduledAt},!pending.current)}catch{throw Error('Kontrollera rubrik, text, länk och framtida tid. Ditt utkast finns kvar.')}
    input={projectId,postId:editor.postId,expectedRevisionId:editor.expectedRevisionId,planRevisionId:model.currentPlanRevisionId,draft}
   }else{if(!selected||dirty)return;input={projectId,postId:selected.id,revisionId:selected.revision.id,sha256:selected.revision.sha256,decision}}
  }catch(e){setError((e as Error).message);return}
  const signature=JSON.stringify({operation,...input})
  if(pending.current?.signature!==signature)pending.current={signature,body:{operation,...input,idempotencyKey:crypto.randomUUID()}}
  writeInFlight.current=true;const sequence=++responseSequence.current
  const c=new AbortController();controllers.current.add(c);setBusy(true);setError('')
  try{
   const r=await fetch('/api/social-content',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(pending.current.body),signal:c.signal})
   const v=await r.json();if(!live.current||c.signal.aborted||sequence!==responseSequence.current)return
   if(!r.ok){if(r.status===409)setStale(true);throw Error(r.status===409?'Versionen, kontot eller planen har ändrats. Ditt utkast finns kvar; läs senaste versionen före nästa försök.':'Ändringen kunde inte sparas. Ditt utkast finns kvar.')}
   if(v.project?.id!==projectId)throw Error('Svaret gäller ett annat projekt. Ditt utkast finns kvar.')
   setModel(v);setSelectedId(input.postId as string);setEditor(null);setDirty(false);setStale(false);pending.current=null
  }catch(e){if(live.current&&!c.signal.aborted&&sequence===responseSequence.current)setError(e instanceof Error?e.message:'Ändringen kunde inte sparas. Ditt utkast finns kvar.')}
  finally{controllers.current.delete(c);if(sequence===responseSequence.current){writeInFlight.current=false;if(live.current)setBusy(false)}}
 }
 const media=selected?.revision.media??[]
 const mediaMissing=!!selected&&['image','video'].includes(selected.revision.draft.format)&&media.length===0
 const reviewDisabled=busy||loading||dirty||stale||mediaMissing||selected?.status==='needs_review'||media.some(m=>!loaded[m.id+':'+m.sha256])
 const calendar=[...(model?.posts??[])].filter(p=>p.revision.draft.scheduledAt).sort((a,b)=>a.revision.draft.scheduledAt!.localeCompare(b.revision.draft.scheduledAt!))
 return <section className={styles.panel} aria-label={'Innehåll för '+projectName} aria-busy={busy||loading}>
  <header className={styles.header}><div><span className={styles.eyebrow}>Förbered lanseringen</span><h2>Innehåll – {projectName}</h2><p>Samla utkast, återanvänd material och granska innehållet tillsammans med Atlas.</p></div>
   <p className={styles.notice}>Börja med utkast och granskning. När rätt konto är anslutet kan du bekräfta ett enskilt Facebook- eller Instagram-inlägg nedan. Inga inlägg skickas från kalendern.</p>
  </header>
  <div className={styles.actions}><button type="button" disabled={busy||loading||(!model?.planApproved||!model.plannedChannels.length)} onClick={()=>edit()}>Nytt utkast</button><button type="button" disabled={busy||loading} onClick={()=>{if(!dirty||window.confirm('Ersätt ditt osparade utkast med senaste sparade versionen?')){setEditor(null);setDirty(false);void load()}}}>Läs senaste innehållet</button></div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {loading&&<p role="status">Läser projektets innehåll…</p>}
  {model&&!model.planApproved&&<div className={styles.notice}><p>Godkänn projektets kanalplan innan du sparar innehållsförslag. Du behöver inte ansluta några konton för att förbereda ett utkast.</p>{onPlanRequested?<button type="button" onClick={onPlanRequested}>Gå till kanalplanen</button>:<a href={'/projects/'+model.project.slug+'/social'}>Gå till kanalplanen</a>}</div>}
  {model&&<div className={styles.layout}>
   <aside className={styles.list} aria-label="Sparade innehållsförslag"><h3>Utkast och granskning</h3>{model.posts.length===0?<p>Inga sparade utkast ännu. Planera innehållet med Atlas eller börja med ett nytt utkast.</p>:model.posts.map(p=><button type="button" key={p.id} disabled={busy||loading} className={p.id===selectedId?styles.active:styles.item} onClick={()=>{if(dirty&&!window.confirm('Ersätt dina osparade ändringar?'))return;setSelectedId(p.id);setEditor(null);setDirty(false);setError('')}}><strong>{p.revision.draft.title}</strong><span>{SOCIAL_LAUNCH_CHANNELS.find(c=>c.id===p.revision.draft.channel)?.label} · v{p.revision.sequence}</span><span>{statuses[p.status]}</span></button>)}</aside>
   <div className={styles.work}>
    {editor&&<form className={styles.editor} onSubmit={e=>{e.preventDefault();void send('propose')}}><h3>{editor.expectedRevisionId?'Redigera innehållet':'Nytt innehållsförslag'}</h3><fieldset disabled={busy||loading}>
     <div className={styles.row}><label>Kanal<select aria-label="Kanal" value={editor.draft.channel} onChange={e=>{const channel=e.target.value as SocialContentInput['channel'],c=model.plannedChannels.find(c=>c.channel===channel)!;change({channel,format:c.format,mediaIds:[]})}}>{model.plannedChannels.map(c=><option key={c.channel} value={c.channel}>{SOCIAL_LAUNCH_CHANNELS.find(n=>n.id===c.channel)?.label}</option>)}</select></label><label>Format<select aria-label="Format" value={editor.draft.format} onChange={e=>change({format:e.target.value as SocialContentInput['format'],mediaIds:[]})}>{SOCIAL_LAUNCH_CHANNELS.find(c=>c.id===editor.draft.channel)?.formats.map(f=><option key={f} value={f}>{formats[f]}</option>)}</select></label></div>
     <label>Rubrik<input aria-label="Rubrik" value={editor.draft.title} maxLength={150} onChange={e=>change({title:e.target.value})}/></label>
     <label>Inläggstext<textarea aria-label="Inläggstext" value={editor.draft.text} maxLength={5000} rows={7} onChange={e=>change({text:e.target.value})}/></label>
     <label>Länk (HTTPS)<input type="url" value={editor.draft.linkUrl??''} maxLength={2048} onChange={e=>change({linkUrl:e.target.value||null})}/></label>
     {['image','video'].includes(editor.draft.format)&&<><label>Bild- eller videoidé<textarea aria-label="Bild- eller videoidé" value={editor.draft.mediaBrief} maxLength={1000} rows={3} onChange={e=>change({mediaBrief:e.target.value})}/></label><p>En idé skapar ingen bild. Välj redan sparat projektmaterial för att kunna granska inlägget.</p><div className={styles.assets}>{model.assets.filter(a=>a.kind===editor.draft.format).map(a=><label key={a.id}><input type="checkbox" checked={editor.draft.mediaIds.includes(a.id)} onChange={e=>change({mediaIds:e.target.checked?(editor.draft.format==='video'?[a.id]:[...editor.draft.mediaIds,a.id]):editor.draft.mediaIds.filter(id=>id!==a.id)})}/>{a.kind==='image'?'Bild':'Video'} {a.width&&a.height?a.width+' × '+a.height+' · ':''}{a.id.slice(0,8)}</label>)}{!model.assets.some(a=>a.kind===editor.draft.format)&&<p>Inget matchande material finns i projektet ännu.</p>}{model.hasMoreAssets&&<p>Visar de 100 senaste filerna.</p>}</div></>}
     <label>Önskad publiceringstid (Stockholm)<input type="datetime-local" value={editor.localTime} onChange={e=>{setEditor({...editor,localTime:e.target.value});setDirty(true);pending.current=null}}/></label>
     <small>Europe/Stockholm. Spara och granska tiden. Publicering godkänns separat.</small>
    </fieldset><div className={styles.actions}><button disabled={busy||loading||!dirty||stale||!model.planApproved} type="submit">Spara innehållsförslag</button><button type="button" disabled={busy||loading} onClick={()=>{setEditor(null);setDirty(false);setError('')}}>Avbryt redigering</button></div></form>}
    {selected&&<article className={styles.preview} aria-label="Granska sparat innehåll"><div className={styles.previewHead}><span>{SOCIAL_LAUNCH_CHANNELS.find(c=>c.id===selected.revision.draft.channel)?.label} · Version {selected.revision.sequence}</span><strong>{statuses[selected.status]}</strong></div><h3>{selected.revision.draft.title}</h3><p className={styles.caption}>{selected.revision.draft.text}</p>
     {selected.revision.draft.linkUrl&&<a href={selected.revision.draft.linkUrl} target="_blank" rel="noreferrer">{selected.revision.draft.linkUrl}</a>}
     {media.map(m=><div key={m.id+':'+m.sha256} className={styles.media}>{m.kind==='image'?<img alt={'Bifogad bild '+m.id.slice(0,8)} src={mediaUrl(projectId,m.id,m.sha256)} onLoad={()=>setLoaded(s=>({...s,[m.id+':'+m.sha256]:true}))} onError={()=>setLoaded(s=>({...s,[m.id+':'+m.sha256]:false}))}/>:<video controls preload="metadata" src={mediaUrl(projectId,m.id,m.sha256)} onLoadedMetadata={()=>setLoaded(s=>({...s,[m.id+':'+m.sha256]:true}))} onError={()=>setLoaded(s=>({...s,[m.id+':'+m.sha256]:false}))}/>}</div>)}
     {mediaMissing&&<p className={styles.notice}>Bifoga projektets bild eller video före granskning.</p>}
     {media.some(m=>!loaded[m.id+':'+m.sha256])&&<p role="status">Materialet måste kunna visas före godkännande.</p>}
     {selected.revision.binding&&<p>Konto vid granskning: {selected.revision.binding.label??selected.revision.binding.accountId}</p>}
     {selected.requirements.filter(r=>r!=='media_required').map(r=><p className={styles.requirement} key={r}>{reasons[r]??'Kräver ny kontroll'}</p>)}
     <div className={styles.actions}><button type="button" disabled={busy||loading} onClick={()=>edit(selected)}>Redigera utkast</button>{!selected.decision&&<><button type="button" disabled={reviewDisabled} onClick={()=>void send('decide','approve')}>Godkänn innehållet</button><button type="button" disabled={busy||loading||dirty||stale} onClick={()=>void send('decide','reject')}>Avvisa innehållet</button></>}</div>
     {dirty&&<p className={styles.notice}>Spara den nya versionen innan du granskar den.</p>}
     <details><summary>Granskningskvitto</summary><p>SHA256: {selected.revision.sha256}</p><p>Godkännandet gäller innehållet. Publicering kräver separat aktivering och kontroll av kanalens krav.</p></details>
     <SocialPublicationPanel projectId={projectId} post={selected} disabled={busy||loading||dirty||stale}/>
    </article>}
   </div>
  </div>}
  {model&&<section className={styles.calendar} aria-label="Planerad innehållskalender"><h3>Kalender</h3><p>Önskade tider i Stockholm. Utkast behöver ett separat publiceringsgodkännande.</p>{calendar.length===0?<p>Inga daterade förberedelser ännu.</p>:<ol>{calendar.map(p=><li key={p.id}><time dateTime={p.revision.draft.scheduledAt!}>{stockholmLocal(p.revision.draft.scheduledAt!).replace('T',' ')}</time><button type="button" disabled={busy||loading} onClick={()=>{if(dirty&&!window.confirm('Ersätt dina osparade ändringar?'))return;setSelectedId(p.id);setEditor(null);setDirty(false)}}>{p.revision.draft.title}</button><span>{statuses[p.status]} · Väntar på aktivering</span></li>)}</ol>}</section>}
  {model&&projectId===FAMILY_SOCIAL_PROJECT_ID&&<SocialSchedulePanel projectId={projectId} posts={model.posts} disabled={busy||loading||dirty||stale}/>}
 </section>
}
export function SocialContentPanel(props:{projectId:string;projectName:string;onPlanRequested?:()=>void;planStateKey?:string}){return <Workspace key={props.projectId} {...props}/>}
