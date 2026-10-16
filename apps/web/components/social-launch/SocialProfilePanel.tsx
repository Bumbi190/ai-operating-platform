'use client'
import {useEffect,useRef,useState} from 'react'
import type {SocialProfileInput,SocialProfileView} from '@/lib/social-launch/profile/types'
import {parseSocialProfile} from '@/lib/social-launch/profile/validate'
import styles from './SocialProfilePanel.module.css'
const empty=():SocialProfileInput=>({description:'',audience:'',tone:'',websiteUrl:null,callToAction:'',factualBoundaries:'',preferredMediaIds:[]})
export function SocialProfilePanel({projectId,projectName}:{projectId:string;projectName:string}){
 return <Editor key={projectId} projectId={projectId} projectName={projectName}/>
}
function Editor({projectId,projectName}:{projectId:string;projectName:string}){
 const [model,setModel]=useState<SocialProfileView|null>(null),[draft,setDraft]=useState<SocialProfileInput>(empty)
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[stale,setStale]=useState(false),[error,setError]=useState('')
 const live=useRef(true),sequence=useRef(0),edits=useRef(0),request=useRef<AbortController|null>(null),writeInFlight=useRef(false),pending=useRef<{fingerprint:string;key:string}|null>(null)
 function apply(v:SocialProfileView){if(v.project?.id!==projectId||!Array.isArray(v.assets))throw Error('Svaret gäller inte detta projekt. Läs senaste underlaget.');return v}
 async function load(){
  if(writeInFlight.current)return
  request.current?.abort();const c=new AbortController();request.current=c;const seq=++sequence.current,edit=edits.current
  setLoading(true);setError('')
  try{const r=await fetch('/api/social-profile?projectId='+encodeURIComponent(projectId),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('Underlaget kunde inte läsas. Dina ändringar finns kvar.');const v=apply(await r.json() as SocialProfileView);if(!live.current||c.signal.aborted||seq!==sequence.current||edit!==edits.current)return;setModel(v);setDraft(v.revision?.profile??empty());setDirty(false);setStale(false);pending.current=null}
  catch(e){if(live.current&&!c.signal.aborted&&seq===sequence.current)setError(e instanceof Error?e.message:'Underlaget kunde inte läsas.')}
  finally{if(live.current&&seq===sequence.current)setLoading(false)}
 }
 useEffect(()=>{live.current=true;void load();return()=>{live.current=false;sequence.current++;request.current?.abort()}},[projectId]) // project key remounts the complete editor
 function change(patch:Partial<SocialProfileInput>){edits.current++;setDraft(old=>({...old,...patch}));setDirty(true);pending.current=null;setError('')}
 async function save(e:React.FormEvent){
  e.preventDefault();if(loading||writeInFlight.current||!dirty||stale||!model)return
  let profile:SocialProfileInput
  try{profile=parseSocialProfile(draft)}catch{setError('Fyll i vad företaget erbjuder, målgrupp och ton. Webbplatsen ska börja med https://.');return}
  const payload={operation:'save',projectId,expectedRevisionId:model.revision?.id??null,profile},fingerprint=JSON.stringify(payload)
  if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,key:crypto.randomUUID()}
  writeInFlight.current=true;request.current?.abort();const c=new AbortController();request.current=c;const seq=++sequence.current,edit=edits.current;setBusy(true);setError('')
  try{
   const r=await fetch('/api/social-profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,idempotencyKey:pending.current.key}),cache:'no-store',signal:c.signal})
   if(!live.current||c.signal.aborted||seq!==sequence.current)return
   if(!r.ok){if(r.status===409){setStale(true);throw Error('Underlaget har ändrats i ett annat fönster. Ditt utkast finns kvar. Läs senaste underlaget innan du sparar igen.')}throw Error('Underlaget kunde inte sparas. Ditt utkast finns kvar. Försök igen.')}
   const v=apply(await r.json() as SocialProfileView);if(!live.current||c.signal.aborted||seq!==sequence.current)return
   setModel(v);setStale(false);if(edit===edits.current){setDraft(v.revision!.profile);setDirty(false);pending.current=null}
  }catch(e){if(live.current&&!c.signal.aborted&&seq===sequence.current)setError(e instanceof Error?e.message:'Underlaget kunde inte sparas. Ditt utkast finns kvar.')}
  finally{writeInFlight.current=false;if(live.current&&seq===sequence.current)setBusy(false)}
 }
 const unavailable=draft.preferredMediaIds.filter(id=>!model?.assets.some(a=>a.id===id))
 return <section className={styles.panel} aria-label={'Företagsunderlag för '+projectName} aria-busy={loading||busy}>
  <header><span className={styles.eyebrow}>Samma grund i varje inlägg</span><h2>Företagsunderlag – {projectName}</h2><p>Beskriv företaget tillsammans med Atlas. Sparade uppgifter, ton och material kan återanvändas när ni planerar nya inlägg.</p></header>
  <p className={styles.notice}>Underlaget hjälper Atlas. Varje inlägg granskas separat.</p>
  <div className={styles.status}><span role="status">{dirty?'Osparade ändringar':model?.revision?'Sparat underlag · version '+model.revision.sequence:loading?'Läser underlaget…':'Inget sparat underlag ännu'}</span><button type="button" disabled={loading||busy} onClick={()=>{if(!dirty||window.confirm('Läs in den sparade versionen och ersätt dina osparade ändringar?'))void load()}}>Läs senaste underlaget</button></div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  <form onSubmit={e=>void save(e)}>
   <fieldset disabled={loading||busy||!model} className={styles.fields}>
    <label className={styles.wide}>Vad erbjuder företaget?<textarea aria-label="Vad erbjuder företaget?" required maxLength={1200} value={draft.description} onChange={e=>change({description:e.target.value})}/><small>Beskriv erbjudandet med uppgifter ni vet stämmer.</small></label>
    <label>Vem vill ni nå?<textarea required maxLength={600} value={draft.audience} onChange={e=>change({audience:e.target.value})}/></label>
    <label>Ton och språk<textarea required maxLength={300} value={draft.tone} onChange={e=>change({tone:e.target.value})}/></label>
    <label>Webbplats (valfritt)<input type="url" maxLength={2048} placeholder="https://" value={draft.websiteUrl??''} onChange={e=>change({websiteUrl:e.target.value||null})}/></label>
    <label>Vad ska läsaren göra? (valfritt)<input maxLength={300} value={draft.callToAction} onChange={e=>change({callToAction:e.target.value})}/></label>
    <label className={styles.wide}>Vad ska Atlas undvika att lova? (valfritt)<textarea aria-label="Vad ska Atlas undvika att lova? (valfritt)" maxLength={1000} value={draft.factualBoundaries} onChange={e=>change({factualBoundaries:e.target.value})}/><small>Skriv exempelvis vilka påståenden, priser eller garantier som kräver att du frågas först.</small></label>
    <div className={styles.wide}><h3>Material att återanvända</h3><p>Välj upp till fem av projektets sparade bilder eller videor. Du kan också välja material direkt i varje inlägg.</p>
     {!model?.assets.length&&<p>Inget sparat projektmaterial att välja ännu.</p>}
     <div className={styles.mediaList}>{model?.assets.map(a=><label key={a.id} className={styles.asset}><input type="checkbox" checked={draft.preferredMediaIds.includes(a.id)} disabled={!draft.preferredMediaIds.includes(a.id)&&draft.preferredMediaIds.length>=5} onChange={e=>change({preferredMediaIds:e.target.checked?[...draft.preferredMediaIds,a.id]:draft.preferredMediaIds.filter(id=>id!==a.id)})}/>{a.kind==='image'?'Bild':'Video'} · {a.width&&a.height?a.width+' × '+a.height+' · ':''}{a.id.slice(0,8)}</label>)}</div>
     {unavailable.map(id=><label className={styles.asset} key={id}><input type="checkbox" checked onChange={()=>change({preferredMediaIds:draft.preferredMediaIds.filter(v=>v!==id)})}/>Material {id.slice(0,8)} är inte längre tillgängligt. Avmarkera för att ta bort det.</label>)}
     {model?.hasMoreAssets&&<small>De senaste materialen och dina sparade val visas här. Fler material kan väljas i innehållsvyn.</small>}
    </div>
   </fieldset>
   <button className={styles.save} type="submit" disabled={loading||busy||!dirty||stale||!model}>{busy?'Sparar…':'Spara företagsunderlag'}</button>
  </form>
 </section>
}
