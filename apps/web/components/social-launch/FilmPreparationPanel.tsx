'use client'
import {useEffect,useRef,useState} from 'react'
import type {SocialContentPost} from '@/lib/social-launch/content/types'
import type {prepareFilm} from '@/lib/social-launch/news-review/film-preparation'
import styles from './SocialContentPanel.module.css'

type Result=Awaited<ReturnType<typeof prepareFilm>>
const blockers:Record<string,string>={
 SOURCE_REVERIFICATION_REQUIRED:'Källuppgifterna behöver verifieras mot originalkällan.',
 CANONICAL_NEWS_SCRIPT_PREPARATION_REQUIRED:'Nyheten och manuset behöver sparas i filmflödet.',
 GENERATION_BUDGET_REQUIRED:'Budget för bild och röst behöver godkännas.',
 IMAGE_VOICE_USAGE_EVIDENCE_REQUIRED:'Användningsunderlag för bilder och Victoria-rösten saknas.',
 GENERATED_MEDIA_REQUIRED:'De tre illustrationerna och berättarrösten behöver skapas.',
 RENDER_QA_AND_REVIEW_REQUIRED:'Filmen behöver renderas, kvalitetskontrolleras och granskas.'
}
const errors:Record<string,string>={
 SOURCE_EXPIRED:'Källan är för gammal för en nyhetsfilm. Välj och granska en aktuell nyhet.',
 BRIEF_MISMATCH:'Det sparade manuset eller länken saknar ett matchande granskat filmunderlag.',
 PLAN_REQUIRED:'Kanalplanen behöver ett aktuellt godkännande.',
 PLAN_CHANGED:'Kanalplanen har ändrats. Läs senaste innehållet före en ny kontroll.',
 REVISION_CONFLICT:'Utkastsversionen har ändrats. Läs senaste innehållet före en ny kontroll.',
 STOPPED:'Projektet är pausat. Kontrollera projektets status.',
 NOT_FOUND:'Utkastet är inte tillgängligt för denna pilot.',
 UNAUTHORIZED:'Logga in i Omnira för att kontrollera filmunderlaget.'
}
function time(value:string){return new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(value))}
type Props={projectId:string;post:SocialContentPost;planRevisionId:string|null;planStateKey?:string;disabled:boolean}
function Check({projectId,post,planRevisionId,disabled}:Props){
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const controller=useRef<AbortController|null>(null),sequence=useRef(0)
 useEffect(()=>()=>{sequence.current++;controller.current?.abort()},[])
 useEffect(()=>{
  if(!result)return
  const timer=setTimeout(()=>{setResult(null);setError(errors.SOURCE_EXPIRED)},Math.max(0,Date.parse(result.sourceExpiresAt)-Date.now()+1))
  return()=>clearTimeout(timer)
 },[result])
 async function check(){
  const current=++sequence.current;controller.current?.abort()
  const c=new AbortController();controller.current=c;setBusy(true);setError('');setResult(null)
  const ref={projectId,postId:post.id,revisionId:post.revision.id,sha256:post.revision.sha256}
  try{
   const response=await fetch('/api/media/film-preparation',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(ref),signal:c.signal})
   const value=await response.json() as Result&{code?:string}
   if(c.signal.aborted||sequence.current!==current)return
   if(!response.ok)throw Error(errors[value.code??'']??(response.status===401?errors.UNAUTHORIZED:'Filmunderlaget kunde inte kontrolleras. Försök igen.'))
   if(value.kind!=='the-prompt-film-preparation-v1'||value.projectId!==ref.projectId||value.post?.id!==ref.postId||
    value.post?.revisionId!==ref.revisionId||value.post?.sha256!==ref.sha256||value.plan?.revisionId!==planRevisionId||
    value.persisted!==false||value.jobId!==null||value.canGenerate!==false||value.canPublish!==false||
    value.sourceVerification!=='operator_supplied_not_verified'||!Number.isFinite(Date.parse(value.checkedAt))||
    !Number.isFinite(Date.parse(value.sourceExpiresAt))||!Array.isArray(value.blockers)||value.blockers.length!==6||
    new Set(value.blockers).size!==6||value.blockers.some(b=>!Object.hasOwn(blockers,b)))
    throw Error('Kontrollsvaret stämmer inte med det valda utkastet. Läs senaste innehållet och försök igen.')
   if(Date.parse(value.sourceExpiresAt)<Date.now())throw Error(errors.SOURCE_EXPIRED)
   setResult(value)
  }catch(e){if(!c.signal.aborted&&sequence.current===current)setError(e instanceof Error?e.message:'Filmunderlaget kunde inte kontrolleras.')}
  finally{if(!c.signal.aborted&&sequence.current===current)setBusy(false)}
 }
 return <section className={styles.newsEvidence} aria-label="Kontroll av filmunderlag" aria-busy={busy}>
  <button type="button" disabled={disabled||busy} onClick={()=>void check()}>{busy?'Kontrollerar filmunderlag…':'Kontrollera filmunderlag'}</button>
  <p>Läsande kontroll av det sparade utkastet. Inga medier skapas.</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {result&&<details open><summary>Filmunderlag – kontrollresultat</summary>
   <p><strong>Kontrollerad version {post.revision.sequence}</strong><br/><time dateTime={result.checkedAt}>{time(result.checkedAt)}</time> (Stockholm)</p>
   <p>Källuppgifterna är tillförda underlaget och ännu inte självständigt verifierade.</p>
   <p>Källans tidsgräns: <time dateTime={result.sourceExpiresAt}>{time(result.sourceExpiresAt)}</time> (Stockholm).</p>
   <h4>Kvar innan filmen kan göras</h4><ul>{result.blockers.map(b=><li key={b}>{blockers[b]}</li>)}</ul>
   <p>Kontrollen är tillfällig. Inget filmjobb har sparats och ingen generering eller publicering är godkänd.</p>
  </details>}
 </section>
}
export function FilmPreparationPanel(props:Props){
 if(props.projectId!=='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'||props.post.revision.draft.format!=='video')return null
 const key=JSON.stringify([props.projectId,props.post.id,props.post.revision.id,props.post.revision.sha256,props.planRevisionId,props.planStateKey,props.disabled])
 return <Check key={key} {...props}/>
}
