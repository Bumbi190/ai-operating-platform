'use client'
import {useState,type FormEvent} from 'react'
import type {WebsiteBuilderSettingsModel} from '@/lib/website-build/planning/settings-types'
import type {BuilderSetting,ProjectRoot} from '@/lib/website-build/planning/types'
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
 const [agentId,setAgentId]=useState(project.setting?.builderAgentId??''),[base,setBase]=useState(''),[os,setOs]=useState<ProjectRoot['os']>(project.setting?.location?.os??'windows'),[setting,setSetting]=useState<BuilderSetting|null>(project.setting),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function save(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');try{const body={projectId:project.id,agentId:agentId||null,...(base.trim()?{location:{os,root:base.trim(),targetId:null}}:{})};setSetting(await post('/api/website-build-settings',body));setMessage('Projektets inställningar är sparade.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 const id='website-builder-'+project.id
 return <form className={styles.replace} id={'project-'+project.id} onSubmit={save} aria-label={'Bygginställningar för '+project.name}>
  <h3 className={styles.channelTitle}>{project.name}</h3>
  {!project.readable&&<p role="alert" className={styles.note}>Projektets bygginställningar kunde inte läsas.</p>}
  <label className={styles.fieldLabel} htmlFor={id+'-agent'}>Webbbyggare för {project.name}</label>
  <select id={id+'-agent'} className={styles.tokenInput} value={agentId} disabled={busy||!project.readable} onChange={e=>setAgentId(e.target.value)}><option value="">Välj byggagent</option>{project.agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
  {!project.agents.length&&<p className={styles.note}>Projektet behöver en textagent som kan bygga hemsidor.</p>}
  <p className={styles.note}>Projektets plats: {setting?.location?.root??'Använder vald standardmapp när platsen binds till projektet.'}</p>
  <details><summary>Välj en annan plats före första planen</summary>
   <label className={styles.fieldLabel} htmlFor={id+'-os'}>Arbetsmiljö för {project.name}</label>
   <select id={id+'-os'} value={os} className={styles.tokenInput} disabled={busy||!project.readable} onChange={e=>setOs(e.target.value as ProjectRoot['os'])}><option value="windows">Windows</option><option value="macos">Mac</option><option value="linux">Linux</option></select>
   <label className={styles.fieldLabel} htmlFor={id+'-root'}>Basmapp för {project.name}</label>
   <input id={id+'-root'} value={base} className={styles.tokenInput} maxLength={1024} disabled={busy||!project.readable} onChange={e=>setBase(e.target.value)} spellCheck={false}/>
  </details>
  <button className={styles.primary} disabled={busy||!project.readable}>{busy?'Sparar…':'Spara för '+project.name}</button>
  {message&&<p role="status" className={styles.note}>{message}</p>}
 </form>
}