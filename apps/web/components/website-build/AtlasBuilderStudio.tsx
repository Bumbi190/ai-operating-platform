'use client'
import {useEffect,useRef,useState} from 'react'
import {Sparkles,Globe2,PanelsTopLeft,ImagePlus,ArrowUpRight} from 'lucide-react'
import {useAtlasConversation} from '@/lib/atlas/conversation/provider'
import {useComposerDraft} from '@/lib/atlas/conversation/use-composer-draft'
import {useOptionalAtlas} from '@/lib/atlas/runtime'
import {AtlasConversationComposer} from '@/components/platform/vnext/AtlasConversationComposer'
import {AtlasBuildSurface} from '@/components/platform/vnext/AtlasBuildSurface'
import type {EnsureStudioInput,StudioSelection,StudioView,StudioWorkspaceRef} from '@/lib/website-build/studio/types'
import {StudioProjectPicker} from './StudioProjectPicker'
import {StudioEmptyPreview} from './StudioEmptyPreview'
import {StudioLayout} from './StudioLayout'
import {StudioLifecycleActions} from './StudioLifecycleActions'
import {StudioBudgetForm} from './StudioBudgetForm'
import {StudioCostControl} from './StudioCostControl'
import {StudioSettings} from './StudioSettings'
import styles from './AtlasBuilderStudio.module.css'
type Filter='active'|'archived'|'trashed'
type InitialTurn={token:string;text:string;inputSource:'text'|'voice'}
function urlFor(selection:StudioSelection,include:Filter='active'){const q=new URLSearchParams();if(include!=='active')q.set('include',include);if(selection.projectSlug)q.set('project',selection.projectSlug);if(selection.conversationId)q.set('conversation',selection.conversationId);if(selection.sessionId)q.set('session',selection.sessionId);return '/build'+(q.size?'?'+q:'')}
function replaceUrl(selection:StudioSelection,include:Filter='active'){window.history.replaceState(window.history.state,'',urlFor(selection,include))}
async function getView(selection:StudioSelection,include:Filter='active'):Promise<StudioView>{const r=await fetch('/api/website-build/studio'+urlFor(selection,include).slice('/build'.length),{cache:'no-store'}),value=await r.json().catch(()=>null);if(!r.ok||!value)throw Error(value?.error??'Projektet kunde inte läsas. Uppdatera och försök igen.');return value}
export function AtlasBuilderStudio({model}:{model:StudioView}){
 const [view,setView]=useState(model),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[name,setName]=useState(''),[initialTurn,setInitialTurn]=useState<InitialTurn|null>(null)
 const current=useRef(view),generation=useRef(0);current.current=view
 const pauseClock=useRef(0),pauseChanges=useRef(new Map<string,{epoch:number;paused:boolean}>())
 const createIntents=useRef(new Map<string,EnsureStudioInput|null>())
 const {controller}=useAtlasConversation(),atlas=useOptionalAtlas()
 const draft=useComposerDraft({draftKey:'atlas-studio-draft:'+model.operatorId+':'+(view.selected?.id??'new'),capture:atlas?cb=>atlas.captureUtterance(cb):null,captureError:atlas?.captureError})
 useEffect(()=>()=>{generation.current++},[])
 // Keep pause changes newer than a read without discarding its project navigation.
 function mergePauseChanges(next:StudioView,readEpoch:number):StudioView{
  const apply=(project:NonNullable<StudioView['selected']>)=>{const change=pauseChanges.current.get(project.id);return change&&change.epoch>readEpoch?{...project,lifecycle:{...project.lifecycle,executionPaused:change.paused}}:project}
  return {...next,selected:next.selected?apply(next.selected):null,projects:next.projects.map(apply)}
 }
 function rememberPause(projectId:string,paused:boolean){
  if(current.current.selected?.id!==projectId||current.current.selected.lifecycle.executionPaused===paused)return
  pauseChanges.current.set(projectId,{epoch:++pauseClock.current,paused})
  setView(old=>({...old,selected:old.selected?.id===projectId?{...old.selected,lifecycle:{...old.selected.lifecycle,executionPaused:paused}}:old.selected,projects:old.projects.map(project=>project.id===projectId?{...project,lifecycle:{...project.lifecycle,executionPaused:paused}}:project)}))
 }
 async function open(selection:StudioSelection,include:Filter=current.current.include??'active'){
  const token=++generation.current,readEpoch=pauseClock.current;setLoading(true);setBusy(false);setError('');setInitialTurn(null)
  const target=selection.projectSlug?current.current.projects.find(p=>p.slug===selection.projectSlug)??(current.current.selected?.slug===selection.projectSlug?current.current.selected:null):null
  const changing=target?.id!==current.current.selected?.id||!selection.projectSlug
  if(changing){controller.deactivateConversation();setView(old=>({...old,selected:target,conversation:null,plan:null,session:null}))}
  try{const next=mergePauseChanges(await getView(selection,include),readEpoch);if(generation.current!==token)return;setView(next);replaceUrl(selection,include)}catch(e){if(generation.current===token){setError((e as Error).message);setView(old=>({...old,state:'error'}))}}finally{if(generation.current===token)setLoading(false)}
 }
 useEffect(()=>{if(!view.selected?.lifecycle.stopping)return;const id=view.selected.id,timer=setInterval(()=>{if(current.current.selected?.id===id)reload()},4000);return()=>clearInterval(timer)},[view.selected?.id,view.selected?.lifecycle.stopping])
 function reload(){const v=current.current;void open({projectSlug:v.selected?.slug,conversationId:v.conversation?.id,...(v.session?{sessionId:v.session.sessionId}:{})})}
 async function start(){
  if(busy||loading||!draft.text.trim()||view.state!=='ok'||!view.selected&&!view.canCreateProject)return
  const selected=view.selected,text=draft.text.trim(),inputSource=draft.inputSource,token=++generation.current,readEpoch=pauseClock.current
  const storageKey='atlas-studio-create:'+model.operatorId+':'+(selected?.id??'new')
  setBusy(true);setError('')
  try{
   let input=createIntents.current.get(storageKey)??null
   if(!createIntents.current.has(storageKey))try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null');if(saved?.idempotencyKey&&(selected?saved.kind==='existing'&&saved.projectId===selected.id:saved.kind==='new'))input=saved}catch{}
   input??=selected?{kind:'existing',projectId:selected.id,idempotencyKey:crypto.randomUUID()}:{kind:'new',name:name.trim()||text.split('\n')[0].slice(0,80),idempotencyKey:crypto.randomUUID()}
   createIntents.current.set(storageKey,input)
   try{sessionStorage.setItem(storageKey,JSON.stringify(input))}catch{}
   const r=await fetch('/api/website-build/studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),ref:StudioWorkspaceRef&{error?:string}=await r.json().catch(()=>null)
   if(!r.ok||!ref?.projectId||!ref?.conversationId||!ref?.projectSlug)throw Error(ref?.error??'Projektet kunde inte startas. Din idé finns kvar; försök igen.')
   const selection={projectSlug:ref.projectSlug,conversationId:ref.conversationId},next=mergePauseChanges(await getView(selection),readEpoch)
   if(generation.current!==token)return
   if(next.state!=='ok'||next.selected?.id!==ref.projectId||next.conversation?.id!==ref.conversationId)throw Error('Projektet skapades men chatten kunde inte läsas. Din idé finns kvar; försök igen.')
   // The live handoff carries the brief even when browser persistence fails.
   setInitialTurn({token:input.idempotencyKey,text,inputSource})
   try{sessionStorage.setItem('atlas-chat-draft:'+model.operatorId+':'+ref.conversationId,JSON.stringify({version:1,text,inputSource}))}catch{}
   try{sessionStorage.removeItem(storageKey)}catch{}
   // A completed in-memory intent also prevents reuse of a stale storage entry.
   createIntents.current.set(storageKey,null)
   draft.clear();setView(next);replaceUrl(selection)
  }catch(e){if(generation.current===token)setError((e as Error).message)}finally{if(generation.current===token)setBusy(false)}
 }
 const selected=view.selected,readOnly=!!selected&&(selected.lifecycle.state!=='active'||selected.lifecycle.executionPaused),canSend=!!selected&&selected.budget.state==='configured'&&!readOnly&&view.state==='ok'
 const starterIcons=[Globe2,PanelsTopLeft,ImagePlus]
 const draftChat=<div className={styles.draft}>
  <div className={styles.intro}>
   <div className={styles.introMark}><Sparkles size={23} aria-hidden/></div>
   <h2>{selected?'Förbättra '+selected.name:'Vad vill du bygga?'}</h2>
   <p>Beskriv din idé. Planera sidor, stil och funktioner tillsammans med Atlas och följ sedan bygget här.</p>
   <ul className={styles.suggestions}>{['Beskriv din hemsida','Förbättra en befintlig sida','Använd en referens'].map((s,i)=>{const Icon=starterIcons[i];return <li key={s}><button type="button" onClick={()=>draft.setText(s)} disabled={busy||loading}><Icon size={17} aria-hidden/><span>{s}</span><ArrowUpRight size={15} aria-hidden/></button></li>})}</ul>
   {!selected&&<label className={styles.projectName}>Projektnamn (valfritt)<input aria-label="Projektnamn (valfritt)" value={name} onChange={e=>setName(e.target.value)} maxLength={120} placeholder="Namn från din idé" disabled={busy}/></label>}
   {!view.canCreateProject&&!selected&&<p>Be projektägaren öppna byggstudion eller skapa ditt första projekt från projektöversikten.</p>}
  </div>
  <AtlasConversationComposer variant="studio" value={draft.text} onChange={draft.setText} onSend={()=>void start()} disabled={busy||loading||readOnly||view.state!=='ok'||!selected&&!view.canCreateProject} pending={busy} capturing={draft.capturing} onVoice={draft.toggleCapture} onStopSpeech={()=>atlas?.stopAudio()} inputSource={draft.inputSource} captureAvailable={!!atlas} captureError={atlas?.captureError}/>
 </div>
 return <section className={styles.studio} aria-label="Bygg med Atlas">
  <header className={styles.header}>
   <div className={styles.headerTitle}><h1>Bygg med Atlas</h1><p title={selected?.name}>{selected?selected.name:'Från idé till färdig hemsida'}</p></div>
   <StudioProjectPicker projects={view.projects} selected={selected} onChange={id=>{const p=view.projects.find(p=>p.id===id)??(selected?.id===id?selected:null);void open(p?{projectSlug:p.slug}:{})}}/>
   <div className={styles.headerActions}>
    <div className={styles.headerActionButtons}>
     <StudioSettings key={selected?.id??'new'}>
      <label>Visa <select aria-label="Projektlista" value={view.include??'active'} onChange={e=>void open({},e.target.value as Filter)}><option value="active">Aktiva projekt</option><option value="archived">Arkiverade projekt</option><option value="trashed">Papperskorgen</option></select></label>
      {selected&&<div className={styles.setup}>
       <StudioLifecycleActions key={selected.id} project={selected} onChanged={state=>{if(current.current.selected?.id===selected.id)void open({projectSlug:selected.slug,conversationId:current.current.conversation?.id},state)}}/>
       {selected.lifecycle.state==='active'?(selected.budget.state==='configured'&&<StudioBudgetForm key={selected.id} project={selected} onSaved={()=>{if(current.current.selected?.id===selected.id)reload()}}/>):<p>Projektet är {selected.lifecycle.state==='archived'?'arkiverat':'i papperskorgen'}. Historiken finns kvar.</p>}
       {selected.lifecycle.executionPaused&&<p>Projektet är pausat. <a href={'/projects/'+encodeURIComponent(selected.slug)}>Öppna projektets kontroller</a>.</p>}
       {!selected.builderAgentId&&<p>Välj projektets byggagent i <a href={'/settings/website-build#project-'+selected.id}>bygginställningarna</a> innan bygget startas.</p>}
       <a href={'/settings/website-build#project-'+selected.id}>Projektmapp och anslutningar</a>
       {selected.workspaceRequest&&<p>Begärd mapp: {selected.workspaceRequest.root.root} · väntar på datoranslutning.</p>}
      </div>}
     </StudioSettings>
     <button type="button" onClick={reload}>Uppdatera</button>
    </div>
    {selected&&<StudioCostControl key={selected.id} projectId={selected.id} projectSlug={selected.slug} paused={selected.lifecycle.executionPaused} onPauseChange={paused=>rememberPause(selected.id,paused)}/>}
   </div>
  </header>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{loading&&<p role="status" className={styles.status}>Läser projektet…</p>}
  {selected&&selected.lifecycle.state==='active'&&selected.budget.state!=='configured'&&<div className={styles.budgetPrompt}><StudioBudgetForm key={selected.id} project={selected} onSaved={()=>{if(current.current.selected?.id===selected.id)reload()}}/></div>}
  {view.conversation?<AtlasBuildSurface key={view.conversation.id} mode="studio" conversationModel={view.conversation} plan={view.plan} initialSession={view.session} workspaceReadable={view.state==='ok'} brief={view.conversation.website?.brief??undefined} studioProject={selected} readOnly={readOnly||loading} canSend={canSend} initialTurn={initialTurn}/>:<StudioLayout chat={draftChat} website={<StudioEmptyPreview/>} desktop={<section><h2>Atlas skrivbord</h2><p>Skrivbordet visas här när en verifierad datoranslutning finns.</p><a href="/settings/website-build">Visa mappinställningar</a></section>} files={<section><h2>Projektets filer</h2><p>Välj projekt eller beskriv en ny hemsida. Projektets material samlas här när det har sparats.</p></section>} tasks={<section><h2>Atlas arbetssteg</h2><p>Börja med en plan i chatten. Här visas sedan byggets verkliga status.</p></section>}/>}
 </section>
}
