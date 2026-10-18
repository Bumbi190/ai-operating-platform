'use client'
import {useEffect,useState} from 'react'
type Preview={
 status:string;previewId:string;maximumSek:number;estimatedSek?:number;quoteHash?:string
 candidate:{title:string;hook:string;script:string;sourceUrl:string;publishedAt:string}
 media?:{props:{images:string[];audioUrl:string;durationMs:number};releaseApproved:false}
}
const errors:Record<string,string>={
 SOURCE_NO_LONGER_FRESH:'Nyheten har blivit för gammal för ett nytt prov.',
 STRICT_BUDGET_GATE_REQUIRED:'Provets kostnadsspärr behöver aktiveras i preview-miljön.',
 PROVIDERS_NOT_CONFIGURED:'Leverantörsanslutningarna behöver kontrolleras.',
 QUOTE_MISMATCH:'Kostnadsunderlaget har ändrats. Uppdatera status innan du försöker igen.',
 PREVIEW_UNAVAILABLE:'Provets status kunde inte kontrolleras. Ingen ny körning startas automatiskt.',
}
export function ProviderPreviewPanel(){
 const [data,setData]=useState<Preview>(),[busy,setBusy]=useState(true),[error,setError]=useState('')
 const [attempted,setAttempted]=useState(false)
 async function load(){
  setBusy(true);setError('')
  try{
   const r=await fetch('/api/media/pilot/provider-preview',{cache:'no-store'})
   const body=await r.json()
   if(!r.ok)throw Error(body.error)
   setData(body)
  }catch(e){setError(errors[(e as Error).message]??'Provets status kunde inte kontrolleras.')}
  finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[])
 async function generate(){
  if(!data?.quoteHash||busy||attempted)return
  setAttempted(true);setBusy(true);setError('')
  try{
   const r=await fetch('/api/media/pilot/provider-preview',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({quoteHash:data.quoteHash,maximumSek:12})})
   const body=await r.json()
   if(!r.ok)throw Error(body.error)
   setData(body)
  }catch(e){setError(errors[(e as Error).message]??'Kontrollera provets status innan något mer görs.')}
  finally{setBusy(false)}
 }
 return <main className="mx-auto max-w-6xl space-y-7 p-5 text-slate-100 md:p-10">
  <header className="space-y-3">
   <p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">The Prompt · privat granskning</p>
   <h1 className="text-3xl font-semibold md:text-4xl">Bild- och röstprov</h1>
   <p className="max-w-2xl text-slate-400">Tre nyhetsanpassade AI-illustrationer och Victoria. Här granskar vi underlaget till den nya filmen. Provet publicerar ingenting.</p>
  </header>
  <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6">
   <div className="flex flex-wrap items-center justify-between gap-4">
    <div><p className="font-medium">En provkörning · högst 12 kr</p>
     {data?.estimatedSek!==undefined&&<p className="mt-1 text-sm text-slate-400">Konservativ beräkning: {data.estimatedSek.toFixed(2)} kr</p>}
    </div>
    <div className="flex flex-wrap gap-3">
     <button onClick={()=>void load()} disabled={busy} className="rounded-xl border border-slate-600 px-4 py-3 text-sm disabled:opacity-40">Uppdatera status</button>
     {data?.status==='ready_to_generate'&&<button onClick={()=>void generate()} disabled={busy||attempted}
      className="rounded-xl bg-orange-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40">Skapa privat prov – högst 12 kr</button>}
    </div>
   </div>
   {busy&&<p role="status" className="mt-4 text-cyan-200">{attempted?'Provet körs. En ny körning startas inte vid omladdning.':'Kontrollerar provets status…'}</p>}
   {error&&<p role="alert" className="mt-4 rounded-xl bg-orange-950/50 p-4 text-orange-200">{error}</p>}
   {data?.status==='claimed'&&<p className="mt-4 text-slate-300">Provet har redan startats. Uppdatera status för att se resultatet. Om körningen avbröts behöver den granskas innan något nytt görs.</p>}
   {data?.status==='review_required'&&<p className="mt-4 text-orange-200">Körningen behöver granskas. Det kan redan finnas genererat material, så vi startar ingen ny generering.</p>}
  </section>
  {data&&<section className="rounded-2xl border border-slate-800 p-6">
   <p className="mb-2 text-xs uppercase tracking-widest text-cyan-300">Nyhetsunderlag</p>
   <h2 className="text-xl font-medium">{data.candidate.title}</h2>
   <p className="mt-2 text-sm text-slate-400">Original publicerat {new Date(data.candidate.publishedAt).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})} · svensk tid</p>
   <a className="mt-3 inline-block text-sm text-cyan-300 underline" href={data.candidate.sourceUrl} target="_blank" rel="noreferrer">Öppna originalkällan</a>
   <p className="mt-5 leading-relaxed text-slate-300">{data.candidate.script}</p>
  </section>}
  {data?.status==='ready'&&data.media&&<section className="space-y-5">
   <div className="grid gap-5 md:grid-cols-3">{data.media.props.images.map((url,i)=><figure key={i} className="relative overflow-hidden rounded-2xl border border-slate-700">
    {/* Private, expiring signed URLs; these are not public article photos. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt={'AI-illustration '+(i+1)+' för nyheten'} className="aspect-[9/16] w-full object-cover"/>
    <figcaption className="absolute bottom-3 left-3 rounded bg-slate-950/85 px-3 py-1 text-xs tracking-widest">AI ILLUSTRATIONS</figcaption>
   </figure>)}</div>
   <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
    <p className="mb-3 font-medium">Victoria · engelsk berättarröst</p>
    <audio controls src={data.media.props.audioUrl} className="w-full"/>
   </div>
   <a href={'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(data,null,2))}
    download="The-Prompt-privat-prov.json" className="inline-block rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950">Hämta underlag för filmexport</a>
   <p className="text-sm text-slate-400">Bild- och ljudlänkarna gäller i 30 minuter. Uppdatera status för nya länkar; det genererar inget nytt material.</p>
  </section>}
 </main>
}
