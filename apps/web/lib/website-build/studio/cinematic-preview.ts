import type {WebsiteArtifact} from '../types'
import {escapeHtml,scriptJson} from '../preview-runtime'
/** Only called for a server-validated, source-pinned artifact. No sandbox privilege is added. */
export function renderCinematicPreview(artifact:WebsiteArtifact,pageKey:string,token:string,origin=typeof location==='undefined'?'http://localhost':location.origin):string{
 const page=artifact.pages.find(p=>p.key===pageKey)
 if(!page||!artifact.cinematicPreset)throw Error('PREVIEW_PAGE_NOT_FOUND')
 const nonce=globalThis.crypto.randomUUID().replaceAll('-','')
 const csp="default-src 'none'; script-src 'nonce-"+nonce+"' "+origin+"/assets/; style-src 'unsafe-inline'; img-src data: blob: "+origin+"/assets/; media-src "+origin+"/assets/; connect-src blob: "+origin+"/assets/; frame-src data:; object-src 'none'; base-uri "+origin+"/; form-action 'none'"
 function documentFor(key:string,child=false):string{
  const source=artifact.pages.find(p=>p.key===key)
  if(!source)throw Error('PREVIEW_PAGE_NOT_FOUND')
  let html=source.html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/g,'')
  html=html.replace(/<script([^>]*\bsrc=[^>]*)>/g,(_match,attrs:string)=>'<script'+attrs.replace(/\s+crossorigin(?:="[^"]*")?/g,'')+' crossorigin="anonymous">')
  html=html.replace(/<script\b/g,'<script nonce="'+nonce+'"')
  const children=child?{}:{'viewer.html':documentFor('viewer',true),'nord-r.html':documentFor('nord-r',true)}
  const config={token,artifactHash:artifact.sha256,pageKey:key,child,pages:artifact.pages.map(p=>p.key),children}
  const bridge='const bridge='+scriptJson(config)+';'+String.raw`
const ready=()=>parent.postMessage({type:'atlas-preview-ready',token:bridge.token,artifactHash:bridge.artifactHash,pageKey:bridge.pageKey},'*');
addEventListener('message',e=>{if(e.source===parent&&e.data?.type==='atlas-preview-ping'&&e.data.token===bridge.token)ready()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')parent.postMessage({type:'atlas-preview-exit-fullscreen',token:bridge.token,artifactHash:bridge.artifactHash,pageKey:bridge.pageKey},'*')});
document.addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(!a)return;const href=a.getAttribute('href');if(href.startsWith('#')){e.preventDefault();if(href==='#')scrollTo(0,0);else document.getElementById(href.slice(1))?.scrollIntoView();return}e.preventDefault();const key=href.split('#')[0].replace(/\.html$/,'');if(bridge.pages.includes(key))parent.postMessage({type:'atlas-preview-page',token:bridge.token,artifactHash:bridge.artifactHash,pageKey:key},'*')},true);
const childUrl=path=>'data:text/html;charset=utf-8,'+encodeURIComponent(bridge.children[path]);
const configNode=document.querySelector('#roadster-config');
if(configNode){const cfg=JSON.parse(configNode.textContent);cfg.viewer=childUrl('viewer.html');configNode.textContent=JSON.stringify(cfg)}
document.querySelectorAll('[data-viewer]').forEach(el=>{if(bridge.children[el.dataset.viewer])el.dataset.viewer=childUrl(el.dataset.viewer)});
if(bridge.child){
 const stage=document.getElementById('vehicle-stage');
 if(stage){const report=()=>parent.postMessage({type:'atlas-cinematic-model-state',state:stage.dataset.model3dState},'*');new MutationObserver(report).observe(stage,{attributes:true,attributeFilter:['data-model3d-state']});report();}
}
ready();
`
  // Bridge precedes source runtime execution so dynamic viewers inherit only pinned child documents.
  const injected='<base href="'+escapeHtml(origin+'/')+'"><meta http-equiv="Content-Security-Policy" content="'+escapeHtml(csp)+'">'
  html=html.replace('<html lang="sv">','<html lang="sv">'+injected)
  // Config and the page DOM must exist before bridge setup; source scripts are deferred/module or at document end.
  const script='<script nonce="'+nonce+'">'+bridge+'</script>'
  const external=html.search(/<script[^>]+(?:src=|type="module")/)
  return external>=0?html.slice(0,external)+script+html.slice(external):html.replace('</body>',script+'</body>')
 }
 return documentFor(pageKey)
}
