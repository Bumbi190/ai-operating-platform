import { createHash } from 'node:crypto'
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5'
import JSZip from 'jszip'
import {bundledRaster} from './assets/bundled-rasters'
import {readBundledVehicle3DAssetBytes,vehicle3DAsset} from './assets/vehicle-3d'
import { escapeHtml, scriptJson, websiteCsp, WEBSITE_RUNTIME, renderPreviewDocument } from './preview-runtime'
import {MODEL3D_RUNTIME_ASSET,readModel3DRuntimeBytes} from './model3d-runtime-asset'
import { WEBSITE_BUILD_LIMITS, type WebsiteArtifact, type WebsiteBehavior, type WebsiteDraft } from './types'

export class WebsiteArtifactError extends Error {
  constructor(readonly code: string, message = code) { super(message); this.name = 'WebsiteArtifactError' }
}
function fail(code: string): never { throw new WebsiteArtifactError(code) }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_OBJECT')
  return value as Record<string, unknown>
}
function text(value: unknown, max: number = WEBSITE_BUILD_LIMITS.artifactBytes): string {
  if (typeof value !== 'string' || value.length > max) fail('INVALID_TEXT')
  return value
}
const SAFE_KEY = /^[a-z][a-z0-9-]{0,49}$/
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/
const TAGS = new Set('a abbr address article aside b blockquote br button caption code col colgroup dd del details dfn div dl dt em figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i img input label legend li main mark nav ol optgroup option p pre progress q s section select small span strong sub summary sup table tbody td textarea th thead time tr u ul fieldset'.split(' '))
const ATTRS = new Set('id class title role lang dir hidden tabindex style href src alt width height loading decoding type name value placeholder required disabled checked selected multiple readonly autocomplete min max step minlength maxlength rows cols for datetime open colspan rowspan scope start reversed contenteditable'.split(' '))
type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']
function isElement(node: Node): node is Element { return 'tagName' in node }

function validateMarkup(html: string, pageKeys: Set<string>, homeAlias = false, pageKey = 'index'): { html: string; ids: Set<string>; elements: Map<string,Element>; forms: boolean } {
  const fragment = parseFragment(html)
  const ids = new Set<string>()
  const elements = new Map<string,Element>()
  const anchorTargets: string[] = []
  let forms = false, linkNumber = 0
  const invalidLink = (reason:string):never => { throw new WebsiteArtifactError('INVALID_LINK', 'Sidan '+pageKey+', länk '+linkNumber+': '+reason+' Tillåtna sidor: '+[...pageKeys].map(key=>key+'.html').join(', ')+'. Använd #id för en befintlig sektion eller en button för en demoåtgärd.') }
  const walk = (nodes: Node[], depth: number): void => {
    if (depth > 100) fail('MARKUP_TOO_DEEP')
    for (const node of nodes) {
      if (!isElement(node)) continue
      if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !TAGS.has(node.tagName)) fail('UNSUPPORTED_ELEMENT')
      if (node.tagName === 'form') forms = true
      for (const attr of node.attrs) {
        if (attr.namespace || attr.prefix || !(ATTRS.has(attr.name) || /^(aria|data)-[a-z0-9-]+$/.test(attr.name))) fail('UNSUPPORTED_ATTRIBUTE')
        if (attr.name === 'id') {
          if (!SAFE_ID.test(attr.value) || ids.has(attr.value)) fail('INVALID_OR_DUPLICATE_ID')
          ids.add(attr.value)
          elements.set(attr.value,node)
        }
        if (attr.name === 'href') {
          linkNumber++
          if (node.tagName !== 'a') invalidLink('href får bara finnas på en a-länk.')
          // An empty fragment is native same-page navigation, not an external capability.
          if (attr.value === '#') continue
          if (attr.value.startsWith('#') && SAFE_ID.test(attr.value.slice(1))) anchorTargets.push(attr.value.slice(1))
          else {
            const value = attr.value === '/' ? 'index.html' : attr.value
            // Only flat, known package pages. Never decode URLs, dot segments,
            // schemes, protocol-relative paths, queries or arbitrary filenames.
            const match = value.match(/^\/?([a-z][a-z0-9-]{0,49})(?:\.html)?(#[A-Za-z][A-Za-z0-9_-]{0,79})?$/)
            if (!match) invalidLink('Länkformatet stöds inte i en statisk preview.')
            const key = homeAlias && match![1] === 'home' ? 'index' : match![1]
            if (!pageKeys.has(key)) invalidLink('Målsidan finns inte i sidpaketet.')
            attr.value = key + '.html' + (match![2] ?? '')
          }
        }
        if (attr.name === 'src') {
          if(node.tagName==='img'&&attr.value.startsWith('atlas-asset:')){const raster=bundledRaster(attr.value);if(!raster)fail('INVALID_IMAGE');attr.value=raster.src}
          if (node.tagName !== 'img' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(attr.value)) fail('INVALID_IMAGE')
        }
      }
      walk(node.childNodes, depth + 1)
    }
  }
  walk(fragment.childNodes, 0)
  if (anchorTargets.some(id => !ids.has(id))) fail('MISSING_ANCHOR')
  if (forms) {
    // Inert preview-only forms clearly name the missing delivery integration.
    const note = parseFragment('<p role="note">Formuläret behöver en ansluten mottagare innan det kan skicka meddelanden.</p>')
    fragment.childNodes.push(...note.childNodes)
  }
  return { html: serialize(fragment), ids, elements, forms }
}
function validateCatalogFilter(item:Record<string,unknown>,elements:Map<string,Element>): Extract<WebsiteBehavior,{kind:'filter'}> {
  const keys=['kind','triggerId','targetIds','attribute','emptyId','countId']
  if(Object.keys(item).length!==keys.length||keys.some(k=>!Object.hasOwn(item,k)))fail('INVALID_FILTER')
  const attribute=item.attribute
  if(typeof attribute!=='string'||!/^data-[a-z][a-z0-9-]{0,39}$/.test(attribute))fail('INVALID_FILTER_ATTRIBUTE')
  const attr=(el:Element,name:string)=>el.attrs.find(a=>a.name===name)?.value
  const token=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,31}$/.test(v)
  const trigger=elements.get(item.triggerId as string)!
  if(trigger.tagName!=='select'||attr(trigger,'multiple')!==undefined||attr(trigger,'disabled')!==undefined)fail('INVALID_FILTER_CONTROL')
  const options:string[]=[]
  function readOptions(nodes:Node[]):void{
    for(const node of nodes){if(!isElement(node))continue
      if(node.tagName==='option'){const v=attr(node,'value');if(v!=='*'&&!token(v))fail('INVALID_FILTER_OPTION');options.push(v!)}
      else if(node.tagName==='optgroup')readOptions(node.childNodes)
      else fail('INVALID_FILTER_OPTION')
    }
  }
  readOptions(trigger.childNodes)
  if(options.length>33||!options.includes('*')||new Set(options).size!==options.length)fail('INVALID_FILTER_OPTION')
  const targetIds=item.targetIds as string[]
  if(typeof item.countId!=='string'||typeof item.emptyId!=='string')fail('INVALID_FILTER_STATUS')
  const all=[item.triggerId as string,...targetIds,item.countId,item.emptyId]
  if(new Set(all).size!==all.length||all.some(id=>!elements.has(id)))fail('INVALID_FILTER_STATUS')
  for(const id of [item.countId,item.emptyId]){
    const node=elements.get(id)!
    if(!['p','span'].includes(node.tagName)||node.childNodes.some(isElement))fail('INVALID_FILTER_STATUS')
  }
  for(const id of targetIds){
    const node=elements.get(id)!,category=attr(node,attribute)
    if(!['article','li','div','section'].includes(node.tagName)||!token(category)||!options.includes(category))fail('INVALID_FILTER_ITEM')
    // A hidden item cannot also hide another item or the filter controls/status.
    for(const other of all.filter(x=>x!==id)){
      let parent=elements.get(other)!.parentNode
      while(parent){if(parent===node)fail('NESTED_FILTER_TARGET');parent='parentNode' in parent?parent.parentNode:null}
    }
  }
  return {kind:'filter',triggerId:item.triggerId as string,targetIds,attribute,emptyId:item.emptyId,countId:item.countId}
}
function validateSpin(item:Record<string,unknown>,elements:Map<string,Element>): Extract<WebsiteBehavior,{kind:'spin'}> {
  const keys=['kind','triggerId','targetIds']
  if(Object.keys(item).length!==keys.length||keys.some(k=>!Object.hasOwn(item,k)))fail('INVALID_SPIN')
  const attr=(el:Element,name:string)=>el.attrs.find(a=>a.name===name)?.value
  const trigger=elements.get(item.triggerId as string)!
  const targetIds=item.targetIds as string[]
  if(trigger.tagName!=='input'||attr(trigger,'type')!=='range'||attr(trigger,'min')!=='0'||attr(trigger,'step')!=='1'||attr(trigger,'value')!=='0')fail('INVALID_SPIN_CONTROL')
  const max=Number(attr(trigger,'max'))
  if(!Number.isInteger(max)||max!==targetIds.length-1||targetIds.length<4||targetIds.length>36)fail('INVALID_SPIN_CONTROL')
  for(let i=0;i<targetIds.length;i++){
    const target=elements.get(targetIds[i])!
    if(target.tagName!=='img')fail('INVALID_SPIN_FRAME')
    const hidden=attr(target,'hidden')!==undefined
    if((i===0&&hidden)||(i>0&&!hidden))fail('INVALID_SPIN_FRAME_STATE')
  }
  return {kind:'spin',triggerId:item.triggerId as string,targetIds}
}
function validateModel3d(item:Record<string,unknown>,elements:Map<string,Element>): Extract<WebsiteBehavior,{kind:'model3d'}> {
  const keys=['kind','triggerId','targetIds','assetId']
  if(Object.keys(item).length!==keys.length||keys.some(k=>!Object.hasOwn(item,k)))fail('INVALID_MODEL3D')
  const attr=(el:Element,name:string)=>el.attrs.find(a=>a.name===name)?.value
  const trigger=elements.get(item.triggerId as string)!
  const assetId=item.assetId
  if(typeof assetId!=='string'||!vehicle3DAsset(assetId))fail('INVALID_MODEL3D_ASSET')
  if(trigger.tagName!=='div'||attr(trigger,'data-vehicle-3d')!==assetId)fail('INVALID_MODEL3D_VIEWER')
  const targetIds=item.targetIds as string[]
  for(const id of targetIds){
    const target=elements.get(id)!
    if(!['div','section','figure'].includes(target.tagName))fail('INVALID_MODEL3D_FALLBACK')
  }
  return {kind:'model3d',triggerId:item.triggerId as string,targetIds,assetId}
}

function validateBehaviors(value: unknown, ids: Set<string>,elements:Map<string,Element>): WebsiteBehavior[] {
  if (!Array.isArray(value) || value.length > WEBSITE_BUILD_LIMITS.behaviorsPerPage) fail('INVALID_BEHAVIORS')
  const triggers = new Set<string>()
  const behaviors:WebsiteBehavior[]=value.map(raw => {
    const item = record(raw)
    if (!['toggle', 'tabs', 'accordion','filter','spin','model3d'].includes(String(item.kind)) || typeof item.triggerId !== 'string' || !ids.has(item.triggerId) || triggers.has(item.triggerId)) fail('INVALID_BEHAVIOR')
    triggers.add(item.triggerId)
    if (!Array.isArray(item.targetIds) || !item.targetIds.length || item.targetIds.length > 64 || item.targetIds.some(id => typeof id !== 'string' || !ids.has(id)) || new Set(item.targetIds).size !== item.targetIds.length) fail('INVALID_BEHAVIOR_TARGET')
    if(item.kind==='filter')return validateCatalogFilter(item,elements)
    if(item.kind==='spin')return validateSpin(item,elements)
    if(item.kind==='model3d')return validateModel3d(item,elements)
    if (item.kind === 'tabs' && (typeof item.groupId !== 'string' || !SAFE_ID.test(item.groupId))) fail('INVALID_TAB_GROUP')
    return { kind: item.kind as 'toggle'|'tabs'|'accordion', triggerId: item.triggerId, targetIds: item.targetIds as string[], ...(item.kind === 'tabs' ? { groupId: item.groupId as string } : {}) }
  })
  for(const filter of behaviors.filter(b=>b.kind==='filter')){
    const owned=new Set([...filter.targetIds,filter.emptyId,filter.countId])
    for(const other of behaviors){if(other===filter)continue
      if(other.targetIds.some(id=>owned.has(id))||owned.has(other.triggerId)||(other.kind==='filter'&&[other.emptyId,other.countId].some(id=>owned.has(id))))fail('OVERLAPPING_FILTER_TARGET')
    }
  }
  for(const spin of behaviors.filter(b=>b.kind==='spin')){
    const owned=new Set(spin.targetIds)
    for(const other of behaviors){if(other===spin)continue
      if(other.targetIds.some(id=>owned.has(id))||owned.has(other.triggerId))fail('OVERLAPPING_SPIN_TARGET')
    }
  }
  for(const model of behaviors.filter(b=>b.kind==='model3d')){
    const owned=new Set([model.triggerId,...model.targetIds])
    for(const other of behaviors){if(other===model)continue
      if(other.targetIds.some(id=>owned.has(id))||owned.has(other.triggerId))fail('OVERLAPPING_MODEL3D_TARGET')
    }
  }
  return behaviors
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}'
  return JSON.stringify(value)
}
function artifactHash(artifact: Omit<WebsiteArtifact, 'sha256'>): string { return createHash('sha256').update(canonical(artifact), 'utf8').digest('hex') }
function validateArtifactAssets(artifact:WebsiteArtifact):void{
  const assets=artifact.assets??[]
  if(!Array.isArray(assets)||assets.length>32)fail('INVALID_ARTIFACT_ASSET')
  const seen=new Set<string>()
  for(const raw of assets){
    const item=record(raw)
    const keys=['id','kind','path','sha256','bytes']
    if(Object.keys(item).length!==keys.length||keys.some(k=>!Object.hasOwn(item,k)))fail('INVALID_ARTIFACT_ASSET')
    if(item.kind==='model3d-runtime'){
      const expected=MODEL3D_RUNTIME_ASSET
      if(item.id!==expected.id||item.path!==expected.path||item.sha256!==expected.sha256||item.bytes!==expected.bytes||seen.has(expected.path))fail('INVALID_ARTIFACT_ASSET')
      seen.add(expected.path)
      continue
    }
    const manifest=typeof item.id==='string'?vehicle3DAsset(item.id):undefined
    if(!manifest)fail('INVALID_ARTIFACT_ASSET')
    const expected=item.kind==='vehicle3d-glb'?manifest.glb:item.kind==='vehicle3d-poster'?manifest.poster:null
    if(!expected||item.path!==expected.path||item.sha256!==expected.sha256||item.bytes!==expected.bytes||seen.has(expected.path))fail('INVALID_ARTIFACT_ASSET')
    seen.add(expected.path)
  }
  const required=new Set<string>()
  for(const page of artifact.pages){
    const match=page.html.match(/<script type="application\/json" id="__atlas_config">([\s\S]*?)<\/script>/)
    if(!match)continue
    let config:any
    try{config=JSON.parse(match[1])}catch{fail('INVALID_ARTIFACT_ASSET')}
    for(const behavior of Array.isArray(config?.behaviors)?config.behaviors:[])if(behavior?.kind==='model3d'&&typeof behavior.assetId==='string')required.add(behavior.assetId)
  }
  for(const id of required){
    const manifest=vehicle3DAsset(id)
    if(!manifest||!assets.some(a=>a.id===id&&a.kind==='vehicle3d-glb')||!assets.some(a=>a.id===id&&a.kind==='vehicle3d-poster'))fail('MISSING_ARTIFACT_ASSET')
  }
  if(required.size&&!assets.some(a=>a.id===MODEL3D_RUNTIME_ASSET.id&&a.kind==='model3d-runtime'))fail('MISSING_ARTIFACT_ASSET')
}
export function assertWebsiteArtifact(artifact: WebsiteArtifact): void {
  const { sha256, ...payload } = artifact
  if (Buffer.byteLength(canonical(artifact), 'utf8') > WEBSITE_BUILD_LIMITS.artifactBytes) fail('ARTIFACT_TOO_LARGE')
  if (artifact.format !== 'static-website.v1' || sha256 !== artifactHash(payload)) fail('ARTIFACT_HASH_MISMATCH')
  if (!artifact.files.length || artifact.files.some(f => !(SAFE_KEY.test(f.path.replace(/\.html$/, '')) && f.path.endsWith('.html')) && f.path !== 'website.js')) fail('INVALID_ARTIFACT_FILE')
  validateArtifactAssets(artifact)
}
export function compileWebsiteArtifact(input: unknown): WebsiteArtifact {
  if (Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8') > WEBSITE_BUILD_LIMITS.artifactBytes) fail('ARTIFACT_TOO_LARGE')
  const draft = record(input)
  if (draft.format !== 'static-website.v1') fail('INVALID_FORMAT')
  const title = text(draft.title, 200)
  if (!title.trim() || !Array.isArray(draft.pages) || !draft.pages.length || draft.pages.length > WEBSITE_BUILD_LIMITS.pages) fail('INVALID_PAGES')
  const sharedCss = draft.css === undefined ? '' : text(draft.css)
  const rawPages = draft.pages.map(record)
  // Plans may call their start page home; static exports always need index.html.
  const homeAlias = !rawPages.some(p=>p.key==='index') && rawPages.some(p=>p.key==='home')
  const keys = rawPages.map(p => {const key=text(p.key,50);return homeAlias&&key==='home'?'index':key})
  if (keys.some(k => !SAFE_KEY.test(k)) || new Set(keys).size !== keys.length || !keys.includes('index')) fail('INVALID_PAGE_KEY')
  const pageKeys = new Set(keys)
  let forms = false
  const model3dAssetIds=new Set<string>()
  const scriptHash = createHash('sha256').update(WEBSITE_RUNTIME).digest('base64')
  const model3dRuntimeIntegrity='sha256-'+Buffer.from(MODEL3D_RUNTIME_ASSET.sha256,'hex').toString('base64')
  const pages = rawPages.map((page,index) => {
    const pageTitle = text(page.title, 200)
    const markup = validateMarkup(text(page.bodyHtml), pageKeys, homeAlias, keys[index])
    forms ||= markup.forms
    const behaviors = validateBehaviors(page.behaviors, markup.ids,markup.elements)
    for(const behavior of behaviors)if(behavior.kind==='model3d')model3dAssetIds.add(behavior.assetId)
    const css = ((sharedCss ? sharedCss + '\n' : '') + (page.css === undefined && draft.css !== undefined ? '' : text(page.css))).replace(/</g, '\\3c ')
    const vehicle3dAssets=Object.fromEntries(behaviors.filter(b=>b.kind==='model3d').map(behavior=>{
      const manifest=vehicle3DAsset(behavior.assetId)
      if(!manifest)fail('INVALID_MODEL3D_ASSET')
      return [behavior.assetId,{glb:manifest.glb.path,poster:manifest.poster.path,truthClass:manifest.truthClass}]
    }))
    const config = scriptJson({ behaviors, pages: keys, vehicle3dAssets })
    const hasModel3d=behaviors.some(behavior=>behavior.kind==='model3d')
    const model3dScript=hasModel3d?`<script type="module" src="${MODEL3D_RUNTIME_ASSET.path}" integrity="${model3dRuntimeIntegrity}" crossorigin="anonymous"></script>`:''
    const html = `<!doctype html><html lang="sv"><head><meta http-equiv="Content-Security-Policy" content="${escapeHtml(websiteCsp(`'sha256-${scriptHash}'`,{model3d:hasModel3d}))}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(pageTitle || title)}</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}[hidden]{display:none!important}img{max-width:100%;height:auto}${css}</style></head><body>${markup.html}<script type="application/json" id="__atlas_config">${config}</script><script id="__atlas_runtime">${WEBSITE_RUNTIME}</script>${model3dScript}</body></html>`
    return { key: keys[index], title: pageTitle, html }
  })
  const assets=[
    ...[...model3dAssetIds].flatMap(id=>{
      const manifest=vehicle3DAsset(id)
      if(!manifest)fail('INVALID_MODEL3D_ASSET')
      return [
        {id,kind:'vehicle3d-glb' as const,path:manifest.glb.path,sha256:manifest.glb.sha256,bytes:manifest.glb.bytes},
        {id,kind:'vehicle3d-poster' as const,path:manifest.poster.path,sha256:manifest.poster.sha256,bytes:manifest.poster.bytes}
      ]
    }),
    ...(model3dAssetIds.size?[MODEL3D_RUNTIME_ASSET]:[])
  ]
  const payload = { format: 'static-website.v1' as const, pages, files: [...pages.map(p => ({ path: `${p.key}.html`, content: p.html })), { path: 'website.js', content: WEBSITE_RUNTIME }], assets, integrationNeeds: forms ? ['form_delivery'] : [] }
  const artifact = { ...payload, sha256: artifactHash(payload) }
  assertWebsiteArtifact(artifact)
  return artifact
}
export function makePreviewDocument(artifact: WebsiteArtifact, pageKey: string, channelToken: string): string {
  assertWebsiteArtifact(artifact)
  if (!artifact.pages.some(p => p.key === pageKey)) fail('PREVIEW_PAGE_NOT_FOUND')
  return renderPreviewDocument(artifact, pageKey, channelToken)
}
export async function exportWebsiteZip(artifact: WebsiteArtifact): Promise<Uint8Array> {
  assertWebsiteArtifact(artifact)
  const zip = new JSZip()
  for (const file of artifact.files) zip.file(file.path, file.content, { date: new Date('2000-01-01T00:00:00Z') })
  for(const asset of artifact.assets??[]){
    const bytes=asset.kind==='model3d-runtime'
      ?readModel3DRuntimeBytes()
      :readBundledVehicle3DAssetBytes(asset.id,asset.kind==='vehicle3d-glb'?'glb':'poster')
    if(bytes.byteLength!==asset.bytes||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)fail('BUNDLED_VEHICLE_3D_HASH_MISMATCH')
    zip.file(asset.path,bytes,{date:new Date('2000-01-01T00:00:00Z')})
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
