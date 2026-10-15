'use client'
import {useRef,useState,type FormEvent} from 'react'
import type {WebsiteBuilderSettingsModel} from '@/lib/website-build/planning/settings-types'
import type {BuilderSetting,ProjectRoot} from '@/lib/website-build/planning/types'
import type {WorkspaceRequestView} from '@/lib/website-build/studio/types'
import styles from './SettingsSurface.module.css'
export type {WebsiteBuilderSettingsModel}
async function post(url:string,body:unknown){
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
 const value=await response.json().catch(()=>null)
 if(!response.ok)throw Error(value?.error??'Inställningen kunde inte sparas.')
 return value
}
export function ProjectWebsiteBuilderSettings({model}:{model:WebsiteBuilderSettingsModel}){
 const [os,setOs]=useState<ProjectRoot['os']>(model.root?.os??'windows'),[root,setRoot]=useState(model.root?.root??''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function save(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');try{await post('/api/website-build-settings/default-root',{root:root.trim()?{os,root:root.trim(),targetId:os===model.root?.os?model.root.targetId:null}:null});setMessage('Standardmappen är sparad.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <section className={styles.panel} id="website-build-settings" aria-labelledby="website-build-heading">
  <h2 className={styles.sectionTitle} id="website-build-heading">Webbprojekt med Atlas</h2>
  <p className={styles.note}>Välj var nya projekt ska samlas. Varje projekt får en egen mapp med källkod, bilder, media, planer och previewversioner.</p>
  {!model.rootReadable&&<p role="alert" className={styles.note}>Standardmappen kunde inte läsas. Kontrollera anslutningen innan du ändrar den.</p>}
  <form className={styles.replace} onSubmit={save}>
   <label className={styles.fieldLabel} htmlFor="website-default-os">Arbetsmiljö</label>
   <select id="website-default-os" className={styles.tokenInput} value={os} disabled={busy||!model.rootReadable} onChange={e=>setOs(e.target.value as ProjectRoot['os'])}><option value="windows">Windows</option><option value="macos">Mac</option><option value="linux">Linux</option></select>
   <label className={styles.fieldLabel} htmlFor="website-default-root">Standardmapp för nya projekt</label>
   <input id="website-default-root" className={styles.tokenInput} value={root} placeholder={os==='windows'?'C:\\Projects':'/home/user/projects'} maxLength={1024} disabled={busy||!model.rootReadable} onChange={e=>setRoot(e.target.value)} spellCheck={false}/>
   <button className={styles.primary} disabled={busy||!model.rootReadable}>{busy?'Sparar…':'Spara standardmapp'}</button>
   {message&&<p role="status" className={styles.note}>{message}</p>}
  </form>
  <p className={styles.note}>En ändrad standardmapp gäller nya projekt. Befintliga projekt flyttas inte. Lokal mapp skapas när projektets dator eller byggmiljö har en fungerande filanslutning.</p>
  {!model.projectsReadable&&<p role="alert" className={styles.note}>Projektlistan kunde inte läsas.</p>}
  {(model.projectsReadable?model.projects:[]).map(project=><ProjectSetting key={project.id} project={project}/>)}
 </section>
}
function ProjectSetting({project}:{project:WebsiteBuilderSettingsModel['projects'][number]}){
 const [agentId,setAgentId]=useState(project.setting?.builderAgentId??''),[base,setBase]=useState(project.workspaceRequest?.mode!=='new'?project.workspaceRequest?.root.root??'':''),[os,setOs]=useState<ProjectRoot['os']>(project.workspaceRequest?.root.os??project.setting?.location?.os??'windows'),[setting,setSetting]=useState<BuilderSetting|null>(project.setting),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const [mode,setMode]=useState<'new'|'existing_git'|'existing_folder'>(project.workspaceRequest?.mode??'new'),[requested,setRequested]=useState<WorkspaceRequestView|null>(project.workspaceRequest??null)
 const intent=useRef<{fingerprint:string;key:string}|null>(null)
 async function save(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setMessage('')
  try{
   if(mode!=='new'&&!base.trim())throw Error('Ange den befintliga projektmappens fullständiga sökväg.')
   const body={projectId:project.id,agentId:agentId||null,...(mode==='new'&&base.trim()?{location:{os,root:base.trim(),targetId:null}}:{})}
   const updated:BuilderSetting=await post('/api/website-build-settings',body);setSetting(updated)
   const root=base.trim()?{os,root:base.trim(),targetId:null}:updated.location?{os:updated.location.os,root:updated.location.root,targetId:updated.location.targetId}:null
   if(root){
    const payload={projectId:project.id,mode,root,targetId:root.targetId},fingerprint=JSON.stringify(payload)
    if(intent.current?.fingerprint!==fingerprint)intent.current={fingerprint,key:crypto.randomUUID()}
    setRequested(await post('/api/website-build/studio/workspace-request',{...payload,idempotencyKey:intent.current.key}))
   }
   setMessage('Projektets inställningar är sparade.')
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 const id='website-builder-'+project.id
 return <form className={styles.replace} id={'project-'+project.id} onSubmit={save} aria-label={'Bygginställningar för '+project.name}>
  <h3 className={styles.channelTitle}>{project.name}</h3>
  {!project.readable&&<p role="alert" className={styles.note}>Projektets bygginställningar kunde inte läsas.</p>}
  <label className={styles.fieldLabel} htmlFor={id+'-agent'}>Webbbyggare för {project.name}</label>
  <select id={id+'-agent'} className={styles.tokenInput} value={agentId} disabled={busy||!project.readable} onChange={e=>setAgentId(e.target.value)}><option value="">Välj byggagent</option>{project.agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
  {!project.agents.length&&<p className={styles.note}>Projektet behöver en textagent som kan bygga hemsidor.</p>}
  <p className={styles.note}>Projektets plats: {setting?.location?.root??'Använder vald standardmapp när platsen binds till projektet.'}</p>
  {requested&&<p role="status" className={styles.note}>Begärd — väntar på datoranslutning: {requested.root.root}. Befintliga filer och projektstruktur bevaras.</p>}
  <details><summary>Välj en annan plats före första planen</summary>
   <label className={styles.fieldLabel} htmlFor={id+'-mode'}>Typ av projektmapp för {project.name}</label>
   <select id={id+'-mode'} className={styles.tokenInput} value={mode} disabled={busy||!project.readable} onChange={e=>setMode(e.target.value as typeof mode)}><option value="new">Ny projektmapp</option><option value="existing_git">Befintligt git-projekt</option><option value="existing_folder">Befintlig projektmapp</option></select>
   <label className={styles.fieldLabel} htmlFor={id+'-os'}>Arbetsmiljö för {project.name}</label>
   <select id={id+'-os'} value={os} className={styles.tokenInput} disabled={busy||!project.readable} onChange={e=>setOs(e.target.value as ProjectRoot['os'])}><option value="windows">Windows</option><option value="macos">Mac</option><option value="linux">Linux</option></select>
   <label className={styles.fieldLabel} htmlFor={id+'-root'}>{mode==='new'?'Basmapp':'Befintlig projektmapp'} för {project.name}</label>
   <input id={id+'-root'} value={base} className={styles.tokenInput} maxLength={1024} disabled={busy||!project.readable} onChange={e=>setBase(e.target.value)} spellCheck={false}/>
  </details>
  <button className={styles.primary} disabled={busy||!project.readable}>{busy?'Sparar…':'Spara för '+project.name}</button>
  {message&&<p role="status" className={styles.note}>{message}</p>}
 </form>
}
