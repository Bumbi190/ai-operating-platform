import 'server-only'
import {assertWebsiteArtifact} from './artifact'
import {validateMockupReference} from './planning/mockups'
import {bundledRaster,rasterHandle} from './assets/bundled-rasters'
import {mapRasterSources} from './assets/raster-markup'
import {WebsiteBuildPermanentError} from './feedback-interpretation'
import {WEBSITE_BUILD_LIMITS,type BuildSnapshot} from './types'
const invalid=():never=>{throw new WebsiteBuildPermanentError('INVALID_MODEL_IMAGE','Bilden finns inte i det verifierade byggunderlaget. Senaste preview behålls.')}

/** Per-snapshot map only. Never persisted globally or populated from model output. */
export function websiteRasterContext(snapshot:BuildSnapshot){
 const rasters=new Map<string,{src:string;alt:string}>()
 let referenceDraft:ReturnType<typeof validateMockupReference>|undefined
 if(snapshot.designReference){try{referenceDraft=validateMockupReference(snapshot.designReference)}catch{throw new WebsiteBuildPermanentError('INVALID_DESIGN_REFERENCE')}}
 if(snapshot.previousArtifact)assertWebsiteArtifact(snapshot.previousArtifact)
 const admit=(source:string,alt:string)=>{
  const src=source.startsWith('atlas-asset:')?bundledRaster(source)?.src:source
  if(!src)return invalid()
  if(!src.startsWith('data:image/'))return source
  let id:string
  try{id=rasterHandle(src)}catch{return invalid()}
  const previous=rasters.get(id)
  if(previous&&previous.src!==src)return invalid()
  if(!previous){if(rasters.size>=64)return invalid();rasters.set(id,{src,alt:alt.slice(0,200)})}
  return id
 }
 for(const page of referenceDraft?.pages??[])mapRasterSources(page.bodyHtml,admit)
 for(const page of snapshot.previousArtifact?.pages??[])mapRasterSources(page.html,admit)
 const compact=(html:string)=>mapRasterSources(html,(src)=>{
  if(src.startsWith('atlas-asset:')){if(!rasters.has(src))return invalid();return src}
  if(!src.startsWith('data:image/'))return src
  let id:string;try{id=rasterHandle(src)}catch{return invalid()}
  if(rasters.get(id)?.src!==src)return invalid()
  return id
 })
 const restore=(html:string)=>mapRasterSources(html,(src)=>{
  if(src.startsWith('atlas-asset:')){const raster=rasters.get(src);if(!raster)return invalid();return raster.src}
  if(src.startsWith('data:image/')){let id:string;try{id=rasterHandle(src)}catch{return invalid()};if(rasters.get(id)?.src!==src)return invalid()}
  return src // Compiler still rejects external URLs, SVG, scripts and every other capability.
 })
 return {referenceDraft,assets:[...rasters].map(([id,r])=>({id,alt:r.alt})),compact,restore}
}
/** Hydrate only img src fields; all other model data still goes through strict compilation. */
export function resolveWebsiteModelRasters(value:unknown,snapshot:BuildSnapshot):unknown{
 const json=JSON.stringify(value)
 if(!json||Buffer.byteLength(json,'utf8')>WEBSITE_BUILD_LIMITS.artifactBytes)return invalid()
 const context=websiteRasterContext(snapshot)
 if(!value||typeof value!=='object'||Array.isArray(value))return value
 const draft=value as Record<string,unknown>
 if(!Array.isArray(draft.pages))return value
 try{return {...draft,pages:draft.pages.map(page=>{
  if(!page||typeof page!=='object'||Array.isArray(page))return page
  return {...page,...(typeof page.bodyHtml==='string'?{bodyHtml:context.restore(page.bodyHtml)}:{})}
 })}}catch(error){if(error instanceof WebsiteBuildPermanentError)throw error;return invalid()}
}
