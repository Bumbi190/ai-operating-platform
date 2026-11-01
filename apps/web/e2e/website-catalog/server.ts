// Loopback-only acceptance harness: actual compiler + preview runtime; no Auth/model/backend.
import {createServer} from 'node:http'
import {writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {compileWebsiteArtifact,makePreviewDocument,exportWebsiteZip} from '../../lib/website-build/artifact'
import {escapeHtml} from '../../lib/website-build/preview-runtime'
import {dealerCatalogDraft} from './demo'
const port=54427
const original=compileWebsiteArtifact(dealerCatalogDraft()),edited=compileWebsiteArtifact(dealerCatalogDraft('#e3aa63'))
const selected=dealerCatalogDraft();selected.pages[0].bodyHtml=selected.pages[0].bodyHtml.replace('<option value="el">','<option value="el" selected>')
const preselected=compileWebsiteArtifact(selected)
const pair=dealerCatalogDraft();const first=pair.pages[0];const html=first.bodyHtml;const secondHtml=html.replace(/id="([^"]+)"/g,(_all,id)=>`id="second-${id}"`).replace(/for="([^"]+)"/g,(_all,id)=>`for="second-${id}"`).replace(/href="#([^"]+)"/g,(_all,id)=>`href="#second-${id}"`).replace(/aria-controls="([^"]+)"/g,(_all,id)=>`aria-controls="second-${id}"`).replace(/aria-labelledby="([^"]+)"/g,(_all,id)=>`aria-labelledby="second-${id}"`)
first.bodyHtml+=secondHtml
first.behaviors.push(...first.behaviors.map(b=>({...b,triggerId:'second-'+b.triggerId,targetIds:b.targetIds.map(id=>'second-'+id),...(b.kind==='filter'?{emptyId:'second-'+b.emptyId,countId:'second-'+b.countId}:{})})))
const independent=compileWebsiteArtifact(pair)
const dir=resolve('../../.superpowers/sdd/2026-10-31-web-studio-catalog-preview/preview')
mkdirSync(dir,{recursive:true})
writeFileSync(resolve(dir,'index.html'),original.pages[0].html)
writeFileSync(resolve(dir,'edited.html'),edited.pages[0].html)
writeFileSync(resolve(dir,'artifact.json'),JSON.stringify(original))
const archive=exportWebsiteZip(original)
const server=createServer((req,res)=>{
 res.setHeader('cache-control','no-store');res.setHeader('content-type','text/html; charset=utf-8')
 const route=new URL(req.url??'/','http://127.0.0.1:'+port).pathname
 if(route==='/')return res.end(original.pages[0].html)
 if(route==='/edited')return res.end(edited.pages[0].html)
 if(route==='/selected')return res.end(preselected.pages[0].html)
 if(route==='/independent')return res.end(independent.pages[0].html)
 if(route==='/preview')return res.end('<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Omnira – katalogtest i isolerad preview</title><style>body{margin:0;background:#10141b}iframe{border:0;width:100%;height:100dvh;display:block}</style><iframe title="Bilhandlardemo – funktionspreview" sandbox="allow-scripts" srcdoc="'+escapeHtml(makePreviewDocument(original,'index','catalog-test'))+'"></iframe></html>')
 res.statusCode=404;res.end('Not found')
})
archive.then(bytes=>{writeFileSync(resolve(dir,'demo-motors.zip'),bytes);server.listen(port,'127.0.0.1',()=>console.log('Catalog acceptance fixture ready on loopback; exported artifact '+original.sha256))}).catch(error=>{console.error(error);process.exitCode=1})
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close(()=>process.exit(0)))
