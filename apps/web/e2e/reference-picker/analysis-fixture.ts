import {createReferenceConcepts} from '../../lib/website-build/reference-analysis/concepts'
import {parseReferenceAnalysis} from '../../lib/website-build/reference-analysis/contract'
export const fixtureAnalysis=parseReferenceAnalysis({version:'reference-analysis.v1',
 observations:[{imageIndex:1,layout:'Luftig uppdelning',typography:'Stor rubrik',colors:'Blå accenter'}],
 directions:['editorial','visual','structured'].map((key,index)=>({key,title:['Redaktionell','Bild i fokus','Tydlig struktur'][index],
  rationale:'Egen hierarki med tydlig handling',palette:{background:'#ffffff',foreground:'#162032',accent:'#1e40af'},font:index===0?'serif':'sans',mobile:'En kolumn med tydlig handling'})),
 uncertainties:['Stillbilder visar inte funktioner eller rörelse.']},1)
export const fixtureConcepts=createReferenceConcepts(fixtureAnalysis).map(({key,title,summary,mobile,html,artifact})=>({key,title,summary,mobile,html,sha256:artifact.sha256}))
