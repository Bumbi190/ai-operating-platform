// Local end-to-end harness for a genuine compiled and exported showroom.
// All data is fictional. No external services, auth, paid models or live customers.
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import JSZip from 'jszip'
import {compileWebsiteArtifact,exportWebsiteZip,makePreviewDocument} from '../../lib/website-build/artifact'
import {escapeHtml} from '../../lib/website-build/preview-runtime'
import {createPremiumDealerDraft,type DealerRaster} from '../../lib/website-build/templates/premium-dealer'
import {cars} from '../website-catalog/demo'

const port=19989
const premium=new URL('../website-catalog/assets/premium/',import.meta.url)
function raster(name:string,width:number,height:number,alt:string):DealerRaster{
 return {src:'data:image/webp;base64,'+readFileSync(new URL(name,premium)).toString('base64'),width,height,alt}
}
const hero=raster('showroom-hero.webp',963,367,'Fiktivt showroom med konceptbil')
const images=[
 raster('concept-silver.webp',331,140,'Fiktiv silverfärgad konceptbil'),
 raster('concept-green.webp',329,140,'Fiktiv grön konceptbil'),
 raster('concept-blue.webp',322,140,'Fiktiv blå konceptbil'),
 raster('concept-black.webp',331,140,'Fiktiv svart konceptbil')
]
const poster=raster('3d/demo-motors-poster.webp',1280,720,'Samma fiktiva konceptbil som i den interaktiva 3D-vyn')
const frames=Array.from({length:12},(_,i)=>
 raster('spin/concept-spin-'+String(i).padStart(2,'0')+'.webp',320,180,'Fiktiv konceptbil, vinkel '+String(i+1))
)
const catalog=cars.map((car,i)=>({
 ...car,image:i===0?poster:images[i%images.length],
 ...(i===0?{spin:frames,model3dAssetId:'vehicle3d:demo-motors-concept-v1'}:{})
}))
const artifact=compileWebsiteArtifact(createPremiumDealerDraft({
 brand:'Handlarbörsen',subtitle:'DEMO MOTORS',hero,cars:catalog
}))
const assets=artifact.assets
if(!assets||assets.length!==3)throw Error('MISSING_MODEL3D_EXPORT_ASSETS')
async function start(){
const zip=await JSZip.loadAsync(await exportWebsiteZip(artifact))
const paths=new Map<string,{bytes:Buffer;contentType:string}>()
for(const [name,entry] of Object.entries(zip.files)){
 if(entry.dir||!['index.html',...assets.map(a=>a.path)].includes(name))continue
 const bytes=Buffer.from(await entry.async('uint8array'))
 const contentType=name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.glb')?'model/gltf-binary':name.endsWith('.webp')?'image/webp':'application/octet-stream'
 paths.set('/'+name,{bytes,contentType})
}
const page=paths.get('/index.html')
if(!page||paths.size!==assets.length+1)throw Error('INCOMPLETE_STATIC_EXPORT')
const server=createServer((req,res)=>{
 const url=new URL(req.url??'/','http://127.0.0.1:'+port)
 const path=url.pathname==='/'?'/index.html':url.pathname
 if(path==='/preview'){
  const srcdoc=escapeHtml(makePreviewDocument(artifact,'index','model3d-e2e'))
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'})
  res.end('<!doctype html><html lang="sv"><meta charset="utf-8"><title>Isolerad byggpreview</title><iframe title="Skyddad byggpreview" sandbox="allow-scripts" srcdoc="'+srcdoc+'" style="display:block;border:0;width:100%;height:100vh"></iframe></html>')
  return
 }
 const asset=paths.get(path)
 res.setHeader('cache-control','no-store')
 res.setHeader('x-content-type-options','nosniff')
 if(!asset){res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return}
 // Public hash-addressed static assets need CORS for opaque-origin iframe module/fetch loads.
 res.writeHead(200,{'content-type':asset.contentType,'access-control-allow-origin':'*'})
 res.end(asset.bytes)
})
server.listen(port,'127.0.0.1',()=>console.log('Local model3d ZIP export ready; assets='+assets.length+' sha='+artifact.sha256))
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>server.close(()=>process.exit(0)))
}
void start().catch(error=>{console.error(error);process.exitCode=1})
