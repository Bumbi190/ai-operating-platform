import {describe,it,expect} from 'vitest'
import {parseReferenceAnalysis,parseAnalysisAction} from './contract'
import {createReferenceConcepts} from './concepts'
const id='11111111-1111-4111-8111-111111111111'
export const analysisFixture=()=>({
 version:'reference-analysis.v1',
 observations:[{imageIndex:1,layout:'Luftig uppdelning',typography:'Stor rubrik',colors:'Blå accenter'}],
 directions:['editorial','visual','structured'].map(key=>({key,title:'Egen riktning',rationale:'Tydlig hierarki med eget formspråk',
  palette:{background:'#ffffff',foreground:'#162032',accent:'#1e40af'},font:'sans',mobile:'En kolumn med tydlig handling'})),
 uncertainties:['Stillbilder visar inte funktioner eller rörelse.'],
})
describe('reference analysis contract',()=>{
 it('detaches exact structured output and requires one observation per selected image',()=>{
  const input=analysisFixture(),parsed=parseReferenceAnalysis(input,1)
  input.directions[0].palette.accent='#000000'
  expect(parsed.directions[0].palette.accent).toBe('#1e40af')
  expect(()=>parseReferenceAnalysis(analysisFixture(),2)).toThrow()
  expect(()=>parseReferenceAnalysis({...analysisFixture(),approveBuild:true},1)).toThrow()
  const duplicate=analysisFixture();duplicate.directions[2].key='editorial'
  expect(()=>parseReferenceAnalysis(duplicate,1)).toThrow()
 })
 it('rejects executable palette/font values, URLs, oversized and low contrast output',()=>{
  for(const change of [
   (x:ReturnType<typeof analysisFixture>)=>{x.directions[0].palette.accent='red;background:url(https://evil)'},
   (x:ReturnType<typeof analysisFixture>)=>{x.directions[0].font='url(https://evil)'},
   (x:ReturnType<typeof analysisFixture>)=>{x.directions[0].palette.foreground='#ffffff'},
   (x:ReturnType<typeof analysisFixture>)=>{x.observations[0].layout='<script>alert(1)</script>'},
   (x:ReturnType<typeof analysisFixture>)=>{x.directions[0].rationale='x'.repeat(1001)},
  ]){const value=analysisFixture();change(value);expect(()=>parseReferenceAnalysis(value,1)).toThrow()}
 })
 it('requires exact quote confirmation and rejects caller supplied model/source bytes',()=>{
  expect(parseAnalysisAction({action:'quote',projectId:id,conversationId:id,messageId:id})).toEqual({action:'quote',projectId:id,conversationId:id,messageId:id})
  expect(parseAnalysisAction({action:'run',projectId:id,conversationId:id,messageId:id,analysisId:id,quoteToken:id,approvedMaximumSek:2.2613}).action).toBe('run')
  for(const extra of [{model:'cheap'},{images:[]},{approvedMaximumSek:0}]){
   expect(()=>parseAnalysisAction({action:'quote',projectId:id,conversationId:id,messageId:id,...extra})).toThrow()
  }
 })
 it('compiles three different responsive scriptless concepts without source branding or images',()=>{
  const concepts=createReferenceConcepts(parseReferenceAnalysis(analysisFixture(),1))
  expect(concepts.map(x=>x.key)).toEqual(['editorial','visual','structured'])
  expect(new Set(concepts.map(x=>x.artifact.sha256)).size).toBe(3)
  for(const {artifact,html} of concepts){
   expect(artifact.pages).toHaveLength(1)
   expect(artifact.pages[0].html).toContain('Din bild här')
   expect(artifact.pages[0].html).toContain('@media')
   expect(html).not.toMatch(/<script|https?:\/\//i)
  }
 })
})
