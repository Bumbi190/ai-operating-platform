import 'server-only'
import {createHash} from 'node:crypto'
import JSZip from 'jszip'
import {parse,type DefaultTreeAdapterMap} from 'parse5'
import {escapeHtml} from '../preview-runtime'
import {MODEL3D_RUNTIME_ASSET,readModel3DRuntimeBytes} from '../model3d-runtime-asset'
import type {PlanContent} from '../planning/types'
import {cinematicShowroomBaseHtml} from './demo-motors-readonly'
import {createCinematicDemoHtml} from './cinematic-demo'
import {cinematicAssetEntries,cinematicAssetNames,readCinematicAsset} from './cinematic-assets'
import {listingViewerResponse} from './cinematic-listing'
import {reelResponse} from './cinematic-reel'
import {ROADSTER_PRESET} from './roadster-assets'
import {roadsterHtml} from './roadster-preset'
import nord from './cinematic-assets/nord-r.json'

export const CINEMATIC_PRESET_ID='demo-motors-cinematic-v1' as const
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex')
type Entry={path:string;sha256:string;bytes:number;contentType:string}
type Page={path:string;html:string}
const json=(value:unknown)=>JSON.stringify(value,null,2)+'\n'
function catalogIds(html:string):string[]{
 const ids:string[]=[]
 const visit=(node:DefaultTreeAdapterMap['node'])=>{
  if('tagName' in node){const id=node.attrs.find(a=>a.name==='id')?.value;if(id&&/^concept-\d\d$/.test(id))ids.push(id)}
  if('childNodes' in node)node.childNodes.forEach(visit)
 }
 visit(parse(html))
 if(ids.length!==7||new Set(ids).size!==7||ids.includes('concept-01')||!ids.includes('concept-07'))throw Error('CINEMATIC_CATALOG_MISMATCH')
 return ids
}
/** HTTP-only CSP must also survive a portable static export. */
async function staticDocument(response:Response):Promise<string>{
 const csp=response.headers.get('content-security-policy')
 if(!csp)throw Error('CINEMATIC_CSP_MISSING')
 // frame-ancestors is a response-header rule, not a valid meta directive.
 const meta=csp.split(';').filter(part=>!part.trim().startsWith('frame-ancestors')).join(';')
 return (await response.text()).replace('<html lang="sv">','<html lang="sv"><meta http-equiv="Content-Security-Policy" content="'+escapeHtml(meta)+'">')
}
/** Only server-authored pages; no caller-provided markup, scripts or URLs. */
export async function cinematicPackagePages():Promise<Page[]>{
 const index=createCinematicDemoHtml(cinematicShowroomBaseHtml(),'assets/')
  .replaceAll('href="?view=roadster"','href="roadster.html"')
  .replaceAll('href="?view=visning"','href="visning.html"')
  .replaceAll('data-viewer="?view=nord-r"','data-viewer="nord-r.html"')
 const reel=(await staticDocument(reelResponse(cinematicAssetNames().reelRuntime,'.')))
  .replaceAll('href=".#lager"','href="index.html#lager"')
 return [
  {path:'index.html',html:index},
  {path:'roadster.html',html:roadsterHtml(false,'export')},
  {path:'viewer.html',html:roadsterHtml(true,'export')},
  {path:'nord-r.html',html:await staticDocument(listingViewerResponse('assets/'))},
  {path:'visning.html',html:reel}
 ]
}
export function cinematicPackageAssets():Entry[]{
 const entries=cinematicAssetEntries().map(file=>({path:'assets/'+file.name,sha256:file.sha256,bytes:file.bytes,contentType:file.contentType}))
 for(const file of [ROADSTER_PRESET.files.model,ROADSTER_PRESET.files.cover]){
  entries.push({path:'assets/3d/'+file.name,sha256:file.sha256,bytes:file.bytes,contentType:file.contentType})
 }
 for(const [file,extension] of [[nord.model,'.glb'],[nord.front,'.webp']] as const){
  entries.push({path:'assets/3d/'+file.sha256+extension,sha256:file.sha256,bytes:file.bytes,contentType:file.contentType})
 }
 entries.push({...MODEL3D_RUNTIME_ASSET,contentType:'text/javascript; charset=utf-8'})
 if(new Set(entries.map(e=>e.path)).size!==entries.length)throw Error('CINEMATIC_DUPLICATE_ASSET')
 return entries.map(({path,sha256,bytes,contentType})=>({path,sha256,bytes,contentType})).sort((a,b)=>a.path.localeCompare(b.path,'en'))
}
function manifestFor(pages:Page[]){
 const payload={
  format:CINEMATIC_PRESET_ID,truthClass:'fictional_concept',
  catalogIds:catalogIds(pages[0].html),
  pages:pages.map(p=>({path:p.path,sha256:sha(p.html),bytes:Buffer.byteLength(p.html,'utf8')})),
  assets:cinematicPackageAssets(),
  roadster:{filmSha256:ROADSTER_PRESET.files.film.sha256,modelSha256:ROADSTER_PRESET.files.model.sha256,thrusters:4},
 }
 return {...payload,sha256:sha(JSON.stringify(payload))}
}
export async function cinematicPackageManifest(){return manifestFor(await cinematicPackagePages())}
export type CinematicPresetBinding={id:typeof CINEMATIC_PRESET_ID;sha256:string}
export async function assertCinematicPresetBinding(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('CINEMATIC_BINDING_INVALID')
 const v=value as Record<string,unknown>
 if(Object.keys(v).length!==2||v.id!==CINEMATIC_PRESET_ID||typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256))throw Error('CINEMATIC_BINDING_INVALID')
 const manifest=await cinematicPackageManifest()
 if(v.sha256!==manifest.sha256)throw Error('CINEMATIC_BINDING_STALE')
 return manifest
}
/** Review input only: no plan revision, design decision or paid session is created here. */
export function cinematicPlanProposal(binding:CinematicPresetBinding):PlanContent{
 return {
  title:'Handlarbörsen Demo Motors',
  purpose:'Bevara den granskade bilhallen med sju fiktiva konceptbilar, Nord R och Roadster.',
  audience:'Bilhandlare som vill granska en fungerande konceptvisning',
  pages:[{key:'index',title:'Bilhallen',purpose:'Sju konceptbilar, filter, Nord R-annons och ingång till Roadster och filmvisningen.'},
   {key:'roadster',title:'Roadster',purpose:'Exteriör, kupé, akter, komplett scrollfilm och den granskade 3D-modellen.'},
   {key:'viewer',title:'Roadster 3D',purpose:'Inbäddad modell med fyra bakre thrusters och godkänd kvällsbelysning.'},
   {key:'nord-r',title:'Nord R 3D',purpose:'Inbäddad fiktiv 3D-modell för Nord R-annonsen.'},
   {key:'visning',title:'Filmvisning',purpose:'Bilhallens befintliga film med scroll och mobiluppspelning.'}],
  design:{style:'Bevara det granskade paketets form, färger, belysning och kamerarörelser.',
   reference:binding.id+':'+binding.sha256,cinematic:binding},
  features:[{name:'Sju fiktiva konceptbilar med filter',mode:'preview_demo',provider:null},
   {name:'Befintliga scrollfilmer och två 3D-visningar',mode:'preview_demo',provider:null},
   {name:'Testförfrågningar utan utskick',mode:'preview_demo',provider:null}],
  architecture:'Betrott, versionslåst statiskt paket. Modellen får inte ersätta media, skript eller 3D-filer. Generisk HTML-kompilering är inte en godkänd byggväg för detta paket.',
  steps:['Granska den bundna paketversionen.','Koppla paketet till ordinarie plan- och mockupbeslut.','Verifiera ett avgränsat textändringsflöde med bevarade media.'],
  domain:{registrar:'strato',requestedName:null}
 }
}
export async function exportCinematicPackage(binding:unknown):Promise<Uint8Array>{
 const manifest=await assertCinematicPresetBinding(binding),pages=await cinematicPackagePages()
 // Check the exact rendered documents again before packaging, not just a caller hash.
 if(manifestFor(pages).sha256!==manifest.sha256)throw Error('CINEMATIC_BINDING_STALE')
 const zip=new JSZip(),date=new Date('2026-11-04T00:00:00Z')
 for(const page of pages)zip.file(page.path,page.html,{date})
 for(const entry of manifest.assets){
  const bytes=entry.path===MODEL3D_RUNTIME_ASSET.path?readModel3DRuntimeBytes():readCinematicAsset(entry.path.split('/').at(-1)!)?.bytes
  if(!bytes||bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error('CINEMATIC_EXPORT_INTEGRITY')
  zip.file(entry.path,bytes,{date})
 }
 zip.file('preset-manifest.json',json(manifest),{date})
 zip.file('plan-proposal.json',json({status:'review_only_not_admitted',binding,content:cinematicPlanProposal(binding as CinematicPresetBinding)}),{date})
 zip.file('README.txt','Demo Motors — reviewed fictional showcase.\nServe this directory over HTTP, e.g. python -m http.server 8080, then open /index.html.\nIncludes seven fictional cars, existing films and both 3D viewers. No media is generated by this package.\nplan-proposal.json is a review proposal, NOT a saved/approved Studio plan or paid build.\nThe manifest pins actual page and media bytes. Changed bytes require a new review binding.\nForms are demonstrations. The film page retains its explicit mailto link; it opens the visitor email app only when clicked.\nNo credentials, provider APIs, tracking or automatic message sending.\n',{date})
 return zip.generateAsync({type:'uint8array',compression:'STORE'})
}
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
export async function cinematicPackageDownloadResponse(expectedHash:string|null):Promise<Response>{
 try{
  const binding={id:CINEMATIC_PRESET_ID,sha256:expectedHash}
  const bytes=await exportCinematicPackage(binding)
  // Explicit bounded streaming: the complete archive is larger than a buffered function response.
  // All input bytes have passed integrity checks before any response bytes leave the server.
  let archive:Uint8Array|null=bytes,offset=0
  const stream=new ReadableStream<Uint8Array>({
   pull(controller){
    if(!archive||offset>=archive.length){archive=null;controller.close();return}
    const end=Math.min(offset+64*1024,archive.length)
    controller.enqueue(archive.subarray(offset,end));offset=end
   },
   cancel(){archive=null}
  })
  return new Response(stream,{headers:{...headers,'content-type':'application/zip','content-disposition':'attachment; filename="demo-motors-showcase.zip"'}})
 }catch(error){
  if(error instanceof Error&&['CINEMATIC_BINDING_INVALID','CINEMATIC_BINDING_STALE'].includes(error.message))return new Response('Visningspaketet har ändrats. Öppna granskningssidan igen.',{status:409,headers})
  throw error
 }
}
export async function cinematicPackageReviewResponse():Promise<Response>{
 const manifest=await cinematicPackageManifest(),e=escapeHtml
 const html='<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo Motors — byggunderlag</title>'+
 '<style>*{box-sizing:border-box}body{margin:0;background:#101617;color:#f6f1e8;font:16px/1.65 system-ui}main{max-width:900px;margin:auto;padding:48px 24px}h1{font-size:clamp(36px,7vw,64px);line-height:1.1;letter-spacing:-.04em}a{color:#f0d6af}nav{display:flex;flex-wrap:wrap;gap:14px;margin:30px 0}nav a{border:1px solid #927b59;border-radius:28px;padding:12px 20px;text-decoration:none}code{overflow-wrap:anywhere;font-size:12px}.panel{border-block:1px solid #394447;padding:22px 0;margin:28px 0}small{color:#bfcbc9}a:focus-visible{outline:3px solid #fff;outline-offset:4px}</style>'+
 '<main><a href="/build">← Till Studio</a><p>DEMO MOTORS / BYGGUNDERLAG</p><h1>Den godkända bilhallen,<br>samlad i ett paket.</h1>'+
 '<p>Sju konceptbilar, filmerna du valt och båda 3D-visningarna. Roadstern har fyra bakre thrusters och den mörkare kvällsbelysningen.</p>'+
 '<nav><a href="?">Öppna bilhallen</a><a href="?view=roadster">Granska Roadster</a><a href="?download=showroom&amp;sha256='+manifest.sha256+'">Hämta hela visningspaketet</a></nav>'+
 '<section class="panel"><h2>Inför nästa bygge</h2><p>Paketet innehåller ett planförslag som utgår från den här visningen. Det är ännu inte en godkänd byggplan i Studio. Kopplingen till planbeslut, designgranskning och textändringar återstår.</p><p>Ingen ny film eller modell skapas när du öppnar eller hämtar paketet.</p></section>'+
 '<small>Version: '+e(manifest.format)+'<br>Kontrollsumma: <code>'+manifest.sha256+'</code><br>'+manifest.pages.length+' dokument · '+manifest.assets.length+' mediefiler och beroenden</small></main></html>'
 return new Response(html,{headers:{...headers,'content-type':'text/html; charset=utf-8','x-frame-options':'DENY','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}})
}
