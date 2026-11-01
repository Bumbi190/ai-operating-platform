import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {compileWebsiteArtifact} from './artifact'
import {websiteUserMessage} from './prompt'
import {resolveWebsiteModelRasters} from './model-rasters'
import {BUNDLED_DEMO_RASTERS} from './assets/bundled-rasters'
import type {BuildSnapshot} from './types'
const src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVioAAAAASUVORK5CYII='
const id='atlas-asset:'+createHash('sha256').update(Buffer.from(src.split(',')[1],'base64')).digest('hex')
const draft=(bodyHtml=`<h1>Exempel</h1><img src="${src}" alt="Tillåten illustration">`)=>({format:'static-website.v1',title:'Sida',css:'',pages:[{key:'index',title:'Hem',bodyHtml,behaviors:[]}]})
function snapshot():BuildSnapshot{return {writer:{projectId:'p',sessionId:'s',runId:'r',claimId:'c',generation:2},brief:'Behåll bilden',agentId:'a',previousArtifact:compileWebsiteArtifact(draft()),feedback:[],candidate:null,interpretation:null,controlRequested:null}}
describe('model input uses scoped raster handles instead of raw image bytes',()=>{
 it('compacts previous images and supplies usable metadata',()=>{
  const s=snapshot(),original=JSON.stringify(s),message=websiteUserMessage(s,null),value=JSON.parse(message)
  expect(message).not.toContain('base64,')
  expect(value.previousPages[0].html).toContain(id)
  expect(value.assets).toEqual([{id,alt:'Tillåten illustration'}])
  expect(JSON.stringify(s)).toBe(original)
 })
 it('does not change text-only legacy payloads or add an empty registry',()=>{
  const s=snapshot();s.previousArtifact=compileWebsiteArtifact(draft('<h1>Inga bilder</h1>'))
  const value=JSON.parse(websiteUserMessage(s,null))
  expect(value).not.toHaveProperty('assets');expect(value.previousPages).toEqual(s.previousArtifact.pages)
 })
 it('validates stored artifact integrity before treating its pixels as authority',()=>{
  const s=snapshot();s.previousArtifact!.pages[0].html+='tamper'
  expect(()=>websiteUserMessage(s,null)).toThrow()
 })
 it('keeps a repeated large raster below the existing model-input limit without deleting images',()=>{
  const large='data:image/webp;base64,'+Buffer.alloc(35000,7).toString('base64')
  const s=snapshot();s.previousArtifact=compileWebsiteArtifact(draft(Array.from({length:8},()=>`<img src="${large}" alt="Samma illustration">`).join('')))
  const message=websiteUserMessage(s,null)
  expect(Buffer.byteLength(message)).toBeLessThan(20000)
  expect((JSON.parse(message).previousPages[0].html.match(/atlas-asset:/g)||[])).toHaveLength(8)
  expect(JSON.parse(message).assets).toHaveLength(1)
 })
 it('does not carry a previous snapshot image into an unrelated text-only project',()=>{
  websiteUserMessage(snapshot(),null)
  const s=snapshot();s.previousArtifact=null
  expect(websiteUserMessage(s,null)).not.toContain(id)
 })
})

describe('model output cannot select arbitrary image data',()=>{
 it('hydrates an exact authorized handle without mutating input',()=>{
  const input=draft(`<h1>Ändrat</h1><img src="${id}" alt="Tillåten illustration">`),before=JSON.stringify(input)
  const restored=resolveWebsiteModelRasters(input,snapshot())
  expect(compileWebsiteArtifact(restored).pages[0].html).toContain(src)
  expect(JSON.stringify(input)).toBe(before)
 })
 it('accepts exact old base64 for backwards-compatible providers',()=>{expect(resolveWebsiteModelRasters(draft(),snapshot())).toEqual(draft())})
 it('rejects unknown handles before compilation and never promotes them to global authority',()=>{
  expect(()=>resolveWebsiteModelRasters(draft('<img src="atlas-asset:'+'0'.repeat(64)+'">'),snapshot())).toThrow('Bilden finns inte')
  const other=snapshot();other.previousArtifact=null
  expect(()=>resolveWebsiteModelRasters(draft(`<img src="${id}">`),other)).toThrow()
 })
 it('rejects even a valid bundled image unless it belongs to this snapshot',()=>{
  expect(()=>resolveWebsiteModelRasters(draft(`<img src="${BUNDLED_DEMO_RASTERS[0].id}">`),snapshot())).toThrow()
 })
 it('rejects newly invented base64 and MIME changes to approved pixels',()=>{
  for(const value of [src.replace('image/png','image/jpeg'),'data:image/png;base64,AQIDBA=='])expect(()=>resolveWebsiteModelRasters(draft(`<img src="${value}">`),snapshot())).toThrow()
 })
 it('keeps remote URL, SVG and script rejection in the compiler',()=>{
  for(const html of ['<img src="https://invalid.example/a.png">','<svg></svg>','<script>alert(1)</script>'])expect(()=>compileWebsiteArtifact(resolveWebsiteModelRasters(draft(html),snapshot()))).toThrow()
 })
 it('does not replace a handle appearing in ordinary text or style',()=>{
  const input=draft(`<p>${id}</p><img src="${id}">`)
  const output=resolveWebsiteModelRasters(input,snapshot()) as ReturnType<typeof draft>
  expect(output.pages[0].bodyHtml).toContain(`<p>${id}</p>`)
  expect(output.pages[0].bodyHtml).toContain(`src="${src}"`)
 })
})

describe('permanent media failures do not become retryable model jobs',()=>{
 it('retains the permanent invalid-design-reference contract before a model call',()=>{
  const s=snapshot();s.designReference={mockupId:'bad',sha256:'0'.repeat(64),canonicalDraft:'{}'}
  let failure:any;try{websiteUserMessage(s,null)}catch(error){failure=error}
  expect(failure?.code).toBe('INVALID_DESIGN_REFERENCE')
 })
 it('reports overly deep model markup as a permanent validation failure',()=>{
  const value=draft('<div>'.repeat(102)+`<img src="${id}">`+'</div>'.repeat(102))
  let failure:any;try{resolveWebsiteModelRasters(value,snapshot())}catch(error){failure=error}
  expect(failure?.code).toBe('INVALID_MODEL_IMAGE')
 })
})
