/** Shared data contract only. Model output has no execution or approval authority. */
export const ANALYSIS_VERSION='reference-analysis.v1' as const
export const DIRECTION_KEYS=['editorial','visual','structured'] as const
export type DirectionKey=typeof DIRECTION_KEYS[number]
export type AnalysisDirection={key:DirectionKey;title:string;rationale:string;palette:{background:string;foreground:string;accent:string};font:'serif'|'sans';mobile:string}
export type ReferenceAnalysis={
 version:typeof ANALYSIS_VERSION
 observations:{imageIndex:number;layout:string;typography:string;colors:string}[]
 directions:AnalysisDirection[]
 uncertainties:string[]
}
export type AnalysisSource={projectId:string;conversationId:string;messageId:string}
export type AnalysisAction=AnalysisSource&({action:'quote'}|{action:'run';analysisId:string;quoteToken:string;approvedMaximumSek:number})
export const ANALYSIS_HARD_CAP_SEK=10
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
export const isUuid=(x:unknown):x is string=>typeof x==='string'&&UUID.test(x)
function object(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))throw Error('INVALID_ANALYSIS')
 return value as Record<string,unknown>
}
function plain(value:unknown,max:number):string{
 if(typeof value!=='string'||!value.trim()||value.length>max||/[<>\x00-\x08\x0b\x0c\x0e-\x1f]|https?:\/\//i.test(value))throw Error('INVALID_ANALYSIS')
 return value
}
function color(value:unknown):string{
 if(typeof value!=='string'||!/^#[a-f0-9]{6}$/i.test(value))throw Error('INVALID_ANALYSIS')
 return value.toLowerCase()
}
function luminance(hex:string):number{
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
 return .2126*r+.7152*g+.0722*b
}
function contrast(a:string,b:string):number{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
export function parseReferenceAnalysis(value:unknown,imageCount:number):ReferenceAnalysis{
 const v=object(value,['version','observations','directions','uncertainties'])
 if(v.version!==ANALYSIS_VERSION||!Number.isInteger(imageCount)||imageCount<1||imageCount>4||
  !Array.isArray(v.observations)||v.observations.length!==imageCount||
  !Array.isArray(v.directions)||v.directions.length!==3||!Array.isArray(v.uncertainties)||v.uncertainties.length<1||v.uncertainties.length>6)throw Error('INVALID_ANALYSIS')
 const observations=v.observations.map((raw,index)=>{
  const o=object(raw,['imageIndex','layout','typography','colors'])
  if(o.imageIndex!==index+1)throw Error('INVALID_ANALYSIS')
  return {imageIndex:index+1,layout:plain(o.layout,600),typography:plain(o.typography,600),colors:plain(o.colors,600)}
 })
 const directions=v.directions.map((raw,index):AnalysisDirection=>{
  const d=object(raw,['key','title','rationale','palette','font','mobile']),p=object(d.palette,['background','foreground','accent'])
  if(d.key!==DIRECTION_KEYS[index]||!['serif','sans'].includes(d.font as string))throw Error('INVALID_ANALYSIS')
  const palette={background:color(p.background),foreground:color(p.foreground),accent:color(p.accent)}
  if(contrast(palette.background,palette.foreground)<4.5||contrast(palette.background,palette.accent)<4.5)throw Error('INVALID_ANALYSIS')
  return {key:DIRECTION_KEYS[index],title:plain(d.title,80),rationale:plain(d.rationale,1000),palette,font:d.font as 'serif'|'sans',mobile:plain(d.mobile,600)}
 })
 return {version:ANALYSIS_VERSION,observations,directions,uncertainties:v.uncertainties.map(x=>plain(x,600))}
}
export function parseAnalysisSource(value:unknown):AnalysisSource{
 const v=object(value,['projectId','conversationId','messageId'])
 if(!isUuid(v.projectId)||!isUuid(v.conversationId)||!isUuid(v.messageId))throw Error('INVALID_ANALYSIS')
 return {projectId:v.projectId,conversationId:v.conversationId,messageId:v.messageId}
}
export function parseAnalysisAction(value:unknown):AnalysisAction{
 if(!value||typeof value!=='object')throw Error('INVALID_ANALYSIS')
 const action=(value as Record<string,unknown>).action
 const v=object(value,action==='quote'?['action','projectId','conversationId','messageId']:['action','projectId','conversationId','messageId','analysisId','quoteToken','approvedMaximumSek'])
 const source=parseAnalysisSource({projectId:v.projectId,conversationId:v.conversationId,messageId:v.messageId})
 if(action==='quote')return {...source,action}
 if(action!=='run'||!isUuid(v.analysisId)||!isUuid(v.quoteToken)||typeof v.approvedMaximumSek!=='number'||!Number.isFinite(v.approvedMaximumSek)||v.approvedMaximumSek<=0||v.approvedMaximumSek>ANALYSIS_HARD_CAP_SEK)throw Error('INVALID_ANALYSIS')
 return {...source,action,analysisId:v.analysisId,quoteToken:v.quoteToken,approvedMaximumSek:v.approvedMaximumSek}
}
