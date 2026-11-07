import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {compileWebsiteArtifact} from '../artifact'
import {vehicle3DAsset} from '../assets/vehicle-3d'
import {createPremiumDealerDraft,type PremiumDealerInput} from './premium-dealer'
const asset=(name:string,width:number)=>({src:'data:image/webp;base64,'+readFileSync(new URL('../../../e2e/website-catalog/assets/premium/'+name+'.webp',import.meta.url)).toString('base64'),width,height:name==='showroom-hero'?367:140,alt:'AI-genererad konceptillustration'})
const photos=[asset('concept-silver',331),asset('concept-green',329),asset('concept-blue',322),asset('concept-black',331)]
const modelPoster={src:'data:image/webp;base64,'+readFileSync(new URL('../../../e2e/website-catalog/assets/premium/3d/demo-motors-poster.webp',import.meta.url)).toString('base64'),width:1280,height:720,alt:'Fiktiv konceptbil renderad från samma 3D-källa som fri 3D-vy'}
function input():PremiumDealerInput{return {brand:'Handlarbörsen',subtitle:'DEMO MOTORS',hero:asset('showroom-hero',963),cars:Array.from({length:8},(_,i)=>({id:'concept-0'+(i+1),name:'Koncept '+(i+1),fuel:(['el','hybrid','bensin'] as const)[i%3],year:2025,km:i*1000,price:300000+i*10000,image:photos[i%4]}))}}
describe('approved premium dealership template',()=>{
 it('uses real readable text, cinematic layout and four provided vehicle illustrations',()=>{
  const draft=createPremiumDealerDraft(input()),html=draft.pages[0].bodyHtml
  expect(html).toContain('En ny vy');expect(html).toContain('bilaffären.')
  expect(html).toContain('AI-genererade');expect(html).toContain('Inget skickas')
  expect(html.match(/class="car"/g)).toHaveLength(8)
  expect(draft.css).toContain('--accent:#efb563')
  expect(draft.css).toContain('repeat(4,minmax(0,1fr))')
  expect(draft.css).toContain('prefers-reduced-motion')
  for(const photo of photos)expect(html).toContain(photo.src)
  expect(html).not.toContain('360°');expect(html).not.toContain('<script')
  expect(draft.pages[0].behaviors.filter(b=>b.kind==='filter')).toHaveLength(1)
  expect(draft.pages[0].behaviors.filter(b=>b.kind==='toggle')).toHaveLength(8)
 })
 it('adds a bounded accessible 360 concept spin only when vetted frames are supplied',()=>{
  const data=input();data.cars[0].spin=Array.from({length:4},(_,i)=>({...photos[0],alt:'Konceptvy '+(i+1)}))
  const draft=createPremiumDealerDraft(data),html=draft.pages[0].bodyHtml
  expect(html).toContain('360° konceptvy')
  expect(html).toContain('Dra för att rotera bilen')
  expect(html).toContain('inte en digital tvilling')
  expect(draft.pages[0].behaviors.filter(b=>b.kind==='spin')).toEqual([{kind:'spin',triggerId:'concept-01-spin-control',targetIds:['concept-01-spin-0','concept-01-spin-1','concept-01-spin-2','concept-01-spin-3']}])
  expect(()=>compileWebsiteArtifact(draft)).not.toThrow()
  const short=input();short.cars[0].spin=[photos[0],photos[0],photos[0]]
  expect(()=>createPremiumDealerDraft(short)).toThrow('INVALID_DEALER_SPIN')
  const mixed=input();mixed.cars[0].spin=[photos[0],photos[0],photos[0],photos[1]]
  expect(()=>createPremiumDealerDraft(mixed)).toThrow('INVALID_DEALER_SPIN_SIZE')
 })

 it('binds the free 3D viewer to the exact same-source poster and keeps the 360 fallback',()=>{
  const data=input(),assetId='vehicle3d:demo-motors-concept-v1'
  data.cars[0].image=modelPoster
  data.cars[0].spin=Array.from({length:4},(_,i)=>({...photos[0],alt:'Konceptvy '+(i+1)}))
  data.cars[0].model3dAssetId=assetId
  const draft=createPremiumDealerDraft(data),html=draft.pages[0].bodyHtml
  expect(html).toContain('class="model3d-stage"')
  expect(html).toContain('data-vehicle-3d="'+assetId+'"')
  expect(html).toContain('Fri 3D-konceptvy')
  expect(html).toContain('fiktiv 3D-modell')
  expect(html).toContain('360° fallback')
  expect(draft.pages[0].behaviors.filter(b=>b.kind==='model3d')).toEqual([{kind:'model3d',triggerId:'concept-01-model3d',targetIds:['concept-01-model3d-fallback'],assetId}])
  const artifact=compileWebsiteArtifact(draft)
  expect(artifact.assets).toHaveLength(3)
  expect(artifact.pages[0].html).toContain(vehicle3DAsset(assetId)!.glb.path)
  const mismatch=input()
  mismatch.cars[0].spin=Array.from({length:4},()=>photos[0])
  mismatch.cars[0].model3dAssetId=assetId
  expect(()=>createPremiumDealerDraft(mismatch)).toThrow('INVALID_DEALER_MODEL3D_POSTER')
 })
 it('compiles within the unchanged artifact limit and keeps forms explicitly disconnected',()=>{
  const artifact=compileWebsiteArtifact(createPremiumDealerDraft(input()))
  expect(Buffer.byteLength(JSON.stringify(artifact))).toBeLessThan(1048576)
  expect(artifact.integrationNeeds).toEqual(['form_delivery'])
  expect(artifact.pages[0].html).toContain('connect-src &#39;none&#39;')
 })
 it('escapes metadata and preserves identities and prices',()=>{
  const data=input();data.cars[1].name='Bil <script>alert(1)</script>'
  const draft=createPremiumDealerDraft(data),html=draft.pages[0].bodyHtml
  expect(html).toContain('Bil &lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html).toContain('id="concept-02-vehicle"')
  expect(html).toContain('CONCEPT-02');expect(html).toContain('310')
  expect(()=>compileWebsiteArtifact(draft)).not.toThrow()
 })
 it('an accent edit changes only style and leaves the input and content unchanged',()=>{
  const data=input(),saved=JSON.stringify(data),first=createPremiumDealerDraft(data),second=createPremiumDealerDraft({...data,accent:'#71d7ba'})
  expect(second.pages).toEqual(first.pages)
  expect(second.css!.replaceAll('#71d7ba','#efb563')).toBe(first.css)
  expect(JSON.stringify(data)).toBe(saved)
 })
 it.each(['https://invalid.example/car.jpg','data:image/svg+xml;base64,PHN2Zz4=','data:image/webp;base64,broken!'])('refuses unsupported image %s',src=>{const data=input();data.hero={...data.hero,src};expect(()=>createPremiumDealerDraft(data)).toThrow()})
 it.each(['red;display:none','#fff','url(https://invalid.example)'])('refuses unsafe accent %s',accent=>expect(()=>createPremiumDealerDraft({...input(),accent})).toThrow())
 it.each(['duplicate','invalid-id','unknown-fuel','negative-price','empty-cars','image-size','too-many'])('refuses invalid catalogue %s',kind=>{
  const data=input()
  if(kind==='duplicate')data.cars[1].id=data.cars[0].id
  if(kind==='invalid-id')data.cars[0].id='../other'
  if(kind==='unknown-fuel')(data.cars[0] as any).fuel='unknown'
  if(kind==='negative-price')data.cars[0].price=-1
  if(kind==='empty-cars')data.cars=[]
  if(kind==='image-size')data.hero.width=0
  if(kind==='too-many')data.cars=Array.from({length:65},(_,i)=>({...data.cars[0],id:'car-'+i}))
  expect(()=>createPremiumDealerDraft(data)).toThrow()
 })
 it('spin provenance hashes match all twelve original concept renders',()=>{
  const base=new URL('../../../e2e/website-catalog/assets/premium/spin/',import.meta.url)
  const provenance=JSON.parse(readFileSync(new URL('provenance.json',base),'utf8'))
  expect(provenance.truthClass).toBe('fictional_concept')
  expect(provenance.notRealVehicle).toBe(true)
  expect(provenance.frames).toHaveLength(12)
  for(const frame of provenance.frames){
   const bytes=readFileSync(new URL(frame.file,base))
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(frame.sha256)
   expect(bytes.length).toBe(frame.bytes)
  }
 })
 it('provenance hashes match the five curated local assets',()=>{
  const base=new URL('../../../e2e/website-catalog/assets/premium/',import.meta.url)
  const provenance=JSON.parse(readFileSync(new URL('provenance.json',base),'utf8'))
  expect(provenance.sourceSha256).toBe('b9af8a93fd090bacd499bad965eac72c10c93263506bf291d322c289f5dd2433')
  expect(provenance.assets).toHaveLength(5)
  for(const a of provenance.assets)expect(createHash('sha256').update(readFileSync(new URL(a.file,base))).digest('hex')).toBe(a.sha256)
 })
})

 it('finishes with a luxury automotive footer instead of a boxed SaaS CTA',()=>{
  const draft=createPremiumDealerDraft(input()),html=draft.pages[0].bodyHtml
  expect(html).toContain('class="premium-footer"')
  expect(html).toContain('Handlarbörsen')
  expect(html).toContain('Digitalt showroom')
  expect(html).toContain('Utforska')
  expect(html).toContain('Demo & transparens')
  expect(html).toContain('Omnira Web Studio')
  expect(html).toContain('Byggd för nästa affär.')
  expect(html).toContain('Se vad vi kan skapa')
  expect(html).toContain('href="#kontakt"')
  expect(html).not.toContain('class="footer-cta"')
  expect(draft.css).toContain('.footer-statement')
  expect(draft.css).toContain('.footer-action')
  expect(draft.css).not.toContain('.footer-cta{')
  expect(draft.css).toContain('linear-gradient')
 })

 it('uses the approved showroom image as a heavily tinted footer backdrop without changing its truth class',()=>{
  const data=input(),draft=createPremiumDealerDraft(data),html=draft.pages[0].bodyHtml
  expect(html).toContain('class="footer-visual"')
  expect(html).toContain(data.hero.src)
  expect(html.split(data.hero.src).length-1).toBeGreaterThanOrEqual(2)
  expect(draft.css).toContain('.footer-visual')
  expect(draft.css).toContain('.premium-footer:after')
  expect(draft.css).toContain('opacity:')
  expect(draft.css).toContain('linear-gradient')
 })
