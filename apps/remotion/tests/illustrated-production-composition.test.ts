import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {planIllustratedNewsShots} from '../../web/lib/media/illustrated-news-shots'
import * as shots from '../src/lib/illustrated-shots'
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
let frame=0
const remotion={
 AbsoluteFill:({children,...p}:any)=>React.createElement('div',p,children),
 Img:(p:any)=>React.createElement('img',p),Audio:(p:any)=>React.createElement('audio',p),
 useCurrentFrame:()=>frame,useVideoConfig:()=>({fps:30,durationInFrames:982}),
 interpolate:(x:number,[a,b]:number[],[c,d]:number[])=>c+(d-c)*Math.max(0,Math.min(1,(x-a)/(b-a))),
 Composition:()=>null,
}
function compile(path:string,deps:Record<string,any>){
 const source=readFileSync(new URL(path,import.meta.url),'utf8')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText
 const m={exports:{} as any}
 new Function('require','module','exports',js)((id:string)=>{if(id in deps)return deps[id];if(id==='react')return React;throw new Error('Unhandled dependency '+id)},m,m.exports)
 return m.exports
}
const shared=compile('../src/compositions/ThePromptDailyPilot.tsx',{'remotion':remotion,'../lib/illustrated-shots':shots})
const loadProduction=()=>compile('../src/compositions/ThePromptIllustratedNews.tsx',{
 './ThePromptDailyPilot':shared,'../../../web/lib/media/illustrated-news-shots':{planIllustratedNewsShots},
})
const words=Array.from({length:73},(_,i)=>({word:i===23||i===47?'sentence.':'word'+i,startMs:i*400,endMs:i*400+320}))
const props={hook:'AI DID THE WORK. WHO CHECKS IT?',audioUrl:'https://private.test/voice.mp3',durationMs:29721,words,captions:[],
 images:['https://private.test/0.png','https://private.test/1.png','https://private.test/2.png'],
 sourceLabel:'ANTHROPIC',sourceUrl:'https://www.anthropic.com/research/employment-at-anthropic',
 sourcePublishedAt:'2026-10-16T16:26:00.000Z',creativeVersion:'the-prompt-illustrated-smooth-v1'}
test('production derives three continuous shots from actual speech, ignoring injected shot plans',()=>{
 const {ThePromptIllustratedNews}=loadProduction()
 const element=ThePromptIllustratedNews({...props,illustratedShots:[{startMs:0,imageIndex:2}],presentation:'private_review'})
 assert.equal(element.type,shared.ThePromptNewsFrame)
 assert.equal(element.props.presentation,'production')
 assert.deepEqual(element.props.illustratedShots,planIllustratedNewsShots(words,29721,3))
 assert.equal(element.props.audioUrl,props.audioUrl)
 assert.equal(element.props.words,props.words)
})
test('production fails closed on missing inputs, wrong version and image count',()=>{
 const {ThePromptIllustratedNews}=loadProduction()
 for(const patch of [{creativeVersion:'the-prompt-editorial-v1'},{images:props.images.slice(0,2)},{images:[props.images[0],props.images[0],props.images[0]]},{audioUrl:''},{sourceUrl:''},{sourcePublishedAt:'invalid'},{words:[]},{durationMs:NaN}]){
  assert.throws(()=>ThePromptIllustratedNews({...props,...patch}),/INVALID_ILLUSTRATED_NEWS_INPUT/)
 }
})
test('private review watermark cannot be disabled; production retains AI disclosure on story and outro',()=>{
 const {ThePromptIllustratedNews}=loadProduction()
 const privateProps={...props,creativeVersion:'the-prompt-editorial-v1',illustratedShots:planIllustratedNewsShots(words,29721,3),presentation:'production'}
 for(const f of [100,910]){
  frame=f
  const privateHtml=renderToStaticMarkup(React.createElement(shared.ThePromptDailyPilot,privateProps))
  const productionHtml=renderToStaticMarkup(React.createElement(ThePromptIllustratedNews,props))
  assert.match(privateHtml,/PILOT REVIEW/)
  assert.doesNotMatch(productionHtml,/PILOT|PRIVATE|NOT FOR POSTING/)
  assert.match(productionHtml,/AI-GENERATED \/ EDITORIAL ILLUSTRATIONS/)
  assert.match(productionHtml,/voice.mp3/)
  if(f===100){assert.match(productionHtml,/AI ILLUSTRATIONS/);assert.match(productionHtml,/word/)}
 }
 frame=0
})
test('actual Root registers separate production composition with voice length plus 90-frame outro',async()=>{
 const production=loadProduction()
 const blank=()=>null
 const root=compile('../src/Root.tsx',{'remotion':remotion,
 './compositions/ThePromptDailyPilot':shared,'./compositions/ThePromptIllustratedNews':production,
 './compositions/ShortFormVideo':{ShortFormVideo:blank},'./compositions/SimpleNewsReel':{SimpleNewsReel:blank},
 './compositions/ContentGrowthReel':{ContentGrowthReel:blank},'./compositions/ThePromptEditorialLab':{ThePromptEditorialLab:blank},
 './compositions/ThePromptNewsPreview':{ThePromptNewsPreview:blank,previewDuration:()=>450},
 './compositions/FamilyNovemberTeaser':{FamilyNovemberTeaser:blank}})
 const children=React.Children.toArray(root.RemotionRoot().props.children)
 const get=(id:string)=>children.find((c:any)=>c.props?.id===id)?.props
 const p=get('ThePromptIllustratedNews')
 assert.ok(p,'production composition is registered')
 assert.equal(p.component,production.ThePromptIllustratedNews)
 assert.deepEqual([p.width,p.height,p.fps],[1080,1920,30])
 const metadata=await p.calculateMetadata({props})
 assert.equal(metadata.durationInFrames,982)
 assert.equal(metadata.props,props)
 assert.ok(get('ThePromptDailyPilotTemplate'));assert.ok(get('SimpleNewsReel'));assert.ok(get('ShortFormVideo'))
 assert.throws(()=>production.ThePromptIllustratedNews(p.defaultProps),/INVALID_ILLUSTRATED_NEWS_INPUT/)
})
