import JSZip from 'jszip'
import {ROADSTER_PRESET,ROADSTER_CONTROLS,readRoadsterAsset} from './roadster-assets'
import {ROADSTER_PAGE,ROADSTER_VIEWER} from './roadster-templates'

export type RoadsterMount='studio'|'pilot'|'export'
const mounts={
 studio:{root:'/build/demo-motors/cinematic/assets/',back:'/build/demo-motors/cinematic#concept-07',viewer:'?view=roadster-3d'},
 pilot:{root:'/bilhandlare/bilhall/assets/',back:'/bilhandlare/bilhall#concept-07',viewer:'?view=roadster-3d'},
 export:{root:'assets/',back:'index.html',viewer:'viewer.html'}
} as const
const sri=(hash:string)=>'sha256-'+Buffer.from(hash,'hex').toString('base64')
const pageCsp="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; frame-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
const viewerCsp="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'"
/** Authored fictional preset. Deliberately separate from model-generated markup. */
export function roadsterHtml(viewer=false,mount:RoadsterMount='studio'):string{
 if(!Object.hasOwn(mounts,mount))throw Error('ROADSTER_MOUNT')
 const location=mounts[mount],files=ROADSTER_PRESET.files
 let html=viewer?ROADSTER_VIEWER:ROADSTER_PAGE
 for(const file of Object.values(files)){
  html=html.replaceAll('/bilhandlare/bilhall/assets/'+file.name,location.root+file.name)
   .replaceAll('/bilhandlare/assets/3d/'+file.name,location.root+file.name)
 }
 html=html.replace('__ROADSTER_CSP__','<meta http-equiv="Content-Security-Policy" content="'+(viewer?viewerCsp:pageCsp)+'">')
  .replace('__ROADSTER_BACK__',location.back)
  .replace('__ROADSTER_VIEWER_SRI__',sri(files.viewerRuntime.sha256))
 if(!viewer){
  const config={cover:location.root+files.cover.name,cabin:location.root+files.cabin.name,
   rear:location.root+files.rear.name,film:location.root+files.film.name,viewer:location.viewer}
  const script='<script id="roadster-config" type="application/json">'+JSON.stringify(config).replaceAll('<','\\u003c')+'</script>'+
   '<script src="'+location.root+ROADSTER_CONTROLS.name+'" integrity="'+sri(ROADSTER_CONTROLS.sha256)+'" defer></script>'
  html=html.replace('__ROADSTER_SCRIPTS__',script)
  if(mount==='studio')html=html.replace('</header>','<a href="?download=roadster" download>Hämta visningspaket</a></header>')
 }
 return html
}
export function roadsterResponse(viewer=false,mount:RoadsterMount='studio'):Response{
 return new Response(roadsterHtml(viewer,mount),{headers:{
  'content-type':'text/html; charset=utf-8','cache-control':'private, no-store',
  'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
  'x-frame-options':viewer?'SAMEORIGIN':'DENY',
  'content-security-policy':(viewer?viewerCsp:pageCsp)+"; frame-ancestors "+(viewer?"'self'":"'none'")
 }})
}
/** Portable fixed preset with complete media; no keys, uploads, accounts or network dependency. */
export async function exportRoadsterPreset():Promise<Uint8Array>{
 const zip=new JSZip(),date=new Date('2026-11-04T00:00:00Z')
 const add=(name:string,bytes:string|Uint8Array)=>zip.file(name,bytes,{date})
 add('index.html',roadsterHtml(false,'export'));add('viewer.html',roadsterHtml(true,'export'))
 for(const file of Object.values(ROADSTER_PRESET.files)){
  const asset=readRoadsterAsset(file.name)
  if(!asset)throw Error('ROADSTER_EXPORT_ASSET')
  const modelDependency=file===ROADSTER_PRESET.files.model||file===ROADSTER_PRESET.files.cover
  add('assets/'+file.name,asset.bytes)
  if(modelDependency)add('assets/3d/'+file.name,asset.bytes)
 }
 add('assets/'+ROADSTER_CONTROLS.name,readRoadsterAsset(ROADSTER_CONTROLS.name)!.bytes)
 add('manifest.json',JSON.stringify({...ROADSTER_PRESET,controls:ROADSTER_CONTROLS},null,2))
 add('README.txt','Roadster showcase v1 — fictional concept demonstration.\nServe this folder with a static HTTP server (for example: python -m http.server 8080), then open http://localhost:8080.\nAll media are bundled. No provider API, secrets, tracking, purchases or message sending.\nFilm: approved v7, 15.066667 seconds. 3D: evening materials and on-demand rendering. Model: v10, four surface-fitted recessed rear thrusters.\nThis is an artistic Tesla Roadster-inspired concept, not a verified vehicle or performance claim.\nChanging JavaScript requires updating its content hash and SRI in the HTML.\n')
 return zip.generateAsync({type:'uint8array',compression:'STORE'})
}
export async function roadsterDownloadResponse():Promise<Response>{
 const bytes=await exportRoadsterPreset()
 return new Response(Buffer.from(bytes),{headers:{
  'content-type':'application/zip','content-disposition':'attachment; filename="roadster-showcase-v1.zip"',
  'content-length':String(bytes.length),'cache-control':'private, no-store','x-content-type-options':'nosniff'
 }})
}
