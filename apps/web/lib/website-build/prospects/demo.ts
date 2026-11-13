import 'server-only'
import JSZip from 'jszip'
import {createHash} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {BuildPrincipal} from '../types'
import {WebsiteBuildError,readBuildArtifact} from '../store'
import {exportWebsiteProject} from '../project-export'
import {publicWebsiteUrl} from './validation'
import {runProspectCapture} from './capture'
import {prospectPlan,updateProspect} from './actions'
import type {ProspectView} from './types'
type Db=ReturnType<typeof createAdminClient>
export async function exportProspect(db: Db,p: BuildPrincipal,current: ProspectView){
  const build=current.content.build
  if(!build)throw new WebsiteBuildError('PROSPECT_BUILD_REQUIRED',409)
  await prospectPlan(db,p,current)
  const ref={projectId:current.projectId,sessionId:build.sessionId}
  const artifact=await readBuildArtifact(db,p,ref,build.revisionId)
  if(artifact.sha256!==build.sha256)throw new WebsiteBuildError('PROSPECT_INTEGRITY_ERROR',503)
  const bytes=await exportWebsiteProject(db,p,ref,build.revisionId,artifact)
  return {bytes,sha256:createHash('sha256').update(bytes).digest('hex'),artifactSha256:artifact.sha256}
}
/** Read-only verification after an operator has separately authorized and performed publication. */
export async function verifyProspectDemo(db: Db,p: BuildPrincipal,current: ProspectView,value: unknown,key: string){
  const url=new URL(publicWebsiteUrl(value))
  if(url.protocol!=='https:'||!url.hostname.endsWith('.vercel.app')||url.pathname!=='/'||url.search)throw new WebsiteBuildError('INVALID_DEMO_URL')
  const exported=await exportProspect(db,p,current),zip=await JSZip.loadAsync(exported.bytes)
  const pages=Object.values(zip.files).filter(file=>!file.dir&&file.name.endsWith('/dist/index.html'))
  if(pages.length!==1)throw new WebsiteBuildError('PROSPECT_INTEGRITY_ERROR',503)
  const html=await pages[0].async('uint8array'),expected=createHash('sha256').update(html).digest('hex')
  const prefix=pages[0].name.slice(0,-'dist/index.html'.length)
  const assetEntries=Object.values(zip.files).filter(file=>!file.dir&&file.name.startsWith(prefix+'dist/')&&file.name!==pages[0].name)
  if(assetEntries.length>24)throw new WebsiteBuildError('PROSPECT_INTEGRITY_ERROR',503)
  const expectedAssets=await Promise.all(assetEntries.map(async file=>{
    const path=file.name.slice((prefix+'dist/').length),bytes=await file.async('uint8array')
    if(!/^(?:website\.js|assets\/(?:images|media)\/[A-Za-z0-9][A-Za-z0-9._\/-]*)$/.test(path)||path.length>180||path.split('/').some(part=>part==='.'||part==='..')||bytes.byteLength>8*1024*1024)throw new WebsiteBuildError('PROSPECT_INTEGRITY_ERROR',503)
    return {path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.byteLength}
  }))
  expectedAssets.sort((a,b)=>a.path.localeCompare(b.path))
  const proof=await runProspectCapture(url.href,expectedAssets.map(item=>item.path))
  const actualAssets=Array.isArray(proof.resources)?proof.resources.slice().sort((a: {path:string},b: {path:string})=>a.path.localeCompare(b.path)):null
  if(proof.finalUrl!==url.href||!Array.isArray(proof.pages)||proof.pages.length!==2||proof.pages.some((page: any)=>page.htmlSha256!==expected||page.overflow!==false||page.imagesLoaded!==true||page.scriptsOk!==true)||proof.pages[0].width!==1440||proof.pages[1].width!==390||JSON.stringify(actualAssets)!==JSON.stringify(expectedAssets))throw new WebsiteBuildError('DEMO_VERIFICATION_FAILED',409)
  return updateProspect(db,p,current,{...current.content,demo:{url:url.href,publisher:'vercel',exportSha256:exported.sha256,artifactSha256:exported.artifactSha256,checkedAt:new Date().toISOString(),desktopWidth:1440,mobileWidth:390,desktopOverflow:false,mobileOverflow:false}},key)
}
