import 'server-only'
import {compileWebsiteArtifact} from '../artifact'
import {staticConceptDocument} from './concept-document'
import {createWebsiteMockups} from '../planning/mockups'
import type {PlanContent} from '../planning/types'
import {parseReferenceAnalysis,type ReferenceAnalysis} from './contract'
export function createReferenceConcepts(input:ReferenceAnalysis){
 const analysis=parseReferenceAnalysis(input,input.observations.length)
 const content:PlanContent={title:'Ditt projekt',purpose:'En tydlig plats för ditt innehåll',audience:'Din målgrupp',
  pages:[{key:'index',title:'Introduktion',purpose:'Beskriv vad besökaren hittar här.'},{key:'om',title:'Om verksamheten',purpose:'Presentera ditt erbjudande.'},{key:'kontakt',title:'Nästa steg',purpose:'Visa hur besökaren går vidare.'}],
  design:{style:'Tydlig',reference:null},features:[],architecture:'Designkoncept med platshållare',steps:[],domain:{registrar:'strato',requestedName:null}}
 return createWebsiteMockups(content).map((base,index)=>{
  const d=analysis.directions[index],p=d.palette
  // Only validated color literals and a fixed font family can enter CSS.
  const css=':root{--bg:'+p.background+';--fg:'+p.foreground+';--muted:'+p.foreground+';--accent:'+p.accent+';--panel:'+p.background+'}.hero h1,.section-heading h2,.page-card h3{font-family:'+(d.font==='serif'?'Georgia,serif':'system-ui,sans-serif')+'}'
  const artifact=compileWebsiteArtifact({...base.draft,css:base.draft.css+css})
  // Static concept display needs no compiler-injected preview event runtime.
  const html=staticConceptDocument(artifact.pages[0].html)
  return {key:d.key,title:d.title,summary:d.rationale,mobile:d.mobile,artifact,html}
 })
}
