// Local fictional-media harness. Real document compiler/runtime/assets; no accounts or external APIs.
import {createServer} from 'node:http'
import {GET as dealerPilot} from '../../app/bilhandlare/[[...path]]/route'
import {cinematicShowroomBaseHtml} from '../../lib/website-build/studio/demo-motors-readonly'
import {createCinematicDemoHtml} from '../../lib/website-build/studio/cinematic-demo'
import {reelResponse} from '../../lib/website-build/studio/cinematic-reel'
import {listingViewerResponse} from '../../lib/website-build/studio/cinematic-listing'
import {cinematicAssetNames,cinematicAssetResponse,isListingViewerAsset} from '../../lib/website-build/studio/cinematic-assets'
import {readPublicWebsitePreviewAsset} from '../../lib/website-build/public-preview-assets'
const port=19993
const html=createCinematicDemoHtml(cinematicShowroomBaseHtml())
const server=createServer(async(req,res)=>{
 const url=new URL(req.url??'/','http://127.0.0.1:'+port)
 res.setHeader('cache-control','no-store')
 if(url.pathname==='/bilhandlare'||url.pathname.startsWith('/bilhandlare/')){
  const path=url.pathname.split('/').slice(2)
  const response=await dealerPilot(new Request(url,{headers:req.headers.range?{range:req.headers.range}:{}}),{params:{path}})
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return
 }
 if(url.pathname==='/'||url.pathname==='/build/demo-motors/cinematic'){
  if(url.searchParams.get('view')==='visning'){
   const names=cinematicAssetNames(),reel=reelResponse(names.reelRuntime)
   res.writeHead(reel.status,Object.fromEntries(reel.headers));res.end(await reel.text());return
  }
  if(url.searchParams.get('view')==='nord-r'){
   const viewer=listingViewerResponse();res.writeHead(200,Object.fromEntries(viewer.headers));res.end(await viewer.text());return
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return
 }
 const prefix='/build/demo-motors/cinematic/assets/'
 if(url.pathname.startsWith(prefix)){
  const response=cinematicAssetResponse(new Request(url,{headers:req.headers.range?{range:req.headers.range}:{}}),decodeURIComponent(url.pathname.slice(prefix.length)))
  res.writeHead(response.status,Object.fromEntries(response.headers))
  res.end(Buffer.from(await response.arrayBuffer()));return
 }
 const assetPrefix='/build/demo-motors/assets/'
 if(url.pathname.startsWith(assetPrefix)){
  const parts=url.pathname.slice(assetPrefix.length).split('/')
  if(isListingViewerAsset(parts)){
   const response=cinematicAssetResponse(new Request(url),parts[1]);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return
  }
  const asset=readPublicWebsitePreviewAsset(parts)
  if(asset){res.writeHead(200,{'content-type':asset.contentType});res.end(Buffer.from(asset.bytes));return}
 }
 res.writeHead(404);res.end()
})
server.listen(port,'127.0.0.1',()=>console.log('Cinematic pilot ready on local port '+port))
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>server.close(()=>process.exit(0)))
